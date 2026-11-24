// 15-minute candle backtester — replays each trading day candle by candle (09:15 … 15:15).
//
// How it works
//  1. findBreakoutDays(): a fast daily pass lists every day a VCP setup traded above its pivot,
//     so 15-minute data is only needed for those days plus the following holding period.
//  2. runBacktest15(): for every 15-minute candle, in time order:
//       • open positions: gap through the stop → exit at the open; stop / +10% partial / breakeven
//         decided inside the candle (if both are touched, the stop is assumed first unless the
//         candle OPENED above the target); 10% trail uses the candle high; the 21-EMA trail is
//         checked on the day's last candle close.
//       • entries: a setup triggers when a candle CLOSES above its pivot, still within the 5% buy
//         zone, with volume on pace for ≥ 1.5× the 50-day average (cumulative volume so far ÷ the
//         normal share of the day traded by then). The buy fills at that candle's close + slippage —
//         no peeking at later candles.
//     Days without 15-minute data fall back to the daily candle (reported as coverage).
//  Same scoring, market filter, sizing (10%), stops (chart, max 6%), re-entry and Zerodha charges
//  as the live agents.

import { prepareUniverse, analyzeUniverse } from './analyze.js';
import { scoreSetup } from './scoring.js';
import { DEFAULT_RULES, computeStop, positionSize, capacityCheck, managePosition, deliveryCharges, rMultiple } from './rules.js';
import { volumeFraction } from './market.js';
import { evaluateChecks } from './confirm.js';
import { computeStats } from './stats.js';
import { round } from './vcp.js';
import { roundTick } from './indicators.js';

export const HOLD_WINDOW_DAYS = 90; // trading days of 15-min data fetched after each breakout day
const SLOTS = 25; // 09:15 … 15:15

const mergeRules = (rules) => ({
  ...DEFAULT_RULES,
  ...rules,
  reentry: { ...DEFAULT_RULES.reentry, ...(rules?.reentry || {}) },
  confirm: { ...DEFAULT_RULES.confirm, ...(rules?.confirm || {}) },
  twoStage: { ...DEFAULT_RULES.twoStage, ...(rules?.twoStage || {}) },
  failedExit: { ...DEFAULT_RULES.failedExit, ...(rules?.failedExit || {}) },
  timeExit: { ...DEFAULT_RULES.timeExit, ...(rules?.timeExit || {}) },
});

const isSetup = (a) => a.vcp?.valid && a.trend?.pass && ['near', 'breakout', 'forming'].includes(a.stage) && (a.vcp.distToPivotPct ?? 0) <= 0;

/** Phase 1: which (stock, date ranges) need 15-minute candles. */
export function findBreakoutDays({ stocks, index, from, to, rules, onProgress }) {
  const R = mergeRules(rules);
  const prepared = prepareUniverse(stocks);
  const bySym = new Map(prepared.map((s) => [s.symbol, s]));
  const dates = index.map((c) => c.date).filter((d) => (!from || d >= from) && (!to || d <= to));
  const perToken = new Map();
  let prev = null;
  let candidateDays = 0;
  for (let di = 0; di < dates.length; di++) {
    const d = dates[di];
    if (prev) {
      for (const a of prev.stocks) {
        if (!isSetup(a)) continue;
        const s = bySym.get(a.symbol);
        const i = s.idx.get(d);
        if (i == null || s.c.high[i] <= a.vcp.pivot) continue;
        candidateDays++;
        if (!perToken.has(s.token)) perToken.set(s.token, { symbol: s.symbol, days: [] });
        perToken.get(s.token).days.push(di);
      }
    }
    prev = analyzeUniverse(prepared, { indexCandles: index, date: d });
    if (onProgress && di % 20 === 0) onProgress(di / dates.length);
  }
  // Merge overlapping holding windows per stock
  const ranges = [];
  for (const [token, { symbol, days }] of perToken) {
    let cur = null;
    for (const di of days) {
      const end = Math.min(dates.length - 1, di + HOLD_WINDOW_DAYS);
      if (cur && di <= cur.endIdx + 1) cur.endIdx = Math.max(cur.endIdx, end);
      else {
        if (cur) ranges.push(cur);
        cur = { token, symbol, startIdx: di, endIdx: end };
      }
    }
    if (cur) ranges.push(cur);
  }
  return {
    candidateDays,
    ranges: ranges.map((r) => ({ token: r.token, symbol: r.symbol, from: dates[r.startIdx], to: dates[r.endIdx] })),
    from: dates[0],
    to: dates[dates.length - 1],
  };
}

/** Phase 2: candle-by-candle replay. `getBars(token, date)` returns that day's 15-min candles (or []). */
export function runBacktest15({ stocks, index, from, to, capital = 500000, rules = DEFAULT_RULES, marketFilter = 'pause', getBars, onProgress }) {
  const R = mergeRules(rules);
  const prepared = prepareUniverse(stocks);
  const bySym = new Map(prepared.map((s) => [s.symbol, s]));
  const dates = index.map((c) => c.date).filter((d) => (!from || d >= from) && (!to || d <= to));
  let cash = capital;
  const open = [];
  const closed = [];
  const equity = [];
  const stoppedOut = new Map();
  const signals = { total: 0, taken: 0, skippedCapital: 0, skippedRegime: 0, skippedScore: 0, skippedStop: 0, notConfirmed: 0 };
  const CF = R.confirm;
  const TS = R.twoStage;
  const FX = R.failedExit;
  const coverage = { entryDays15: 0, entryDaysDaily: 0, positionDays15: 0, positionDaysDaily: 0 };
  const slip = R.slippagePct / 100;
  let prevAnalysis = null;

  const sell = (pos, qty, price, date, time, reason) => {
    const ch = deliveryCharges('SELL', qty, price);
    cash += qty * price - ch;
    pos.qtyOpen -= qty;
    pos.charges += ch;
    pos.realized += qty * (price - pos.entryPrice) - ch;
    pos.fills.push({ date, time, side: 'SELL', qty, price: round(price), reason });
    if (pos.qtyOpen <= 0) {
      pos.exitDate = date;
      pos.exitTime = time;
      pos.exitPrice = round(price);
      pos.exitReason = reason;
      const s = bySym.get(pos.symbol);
      pos.holdDays = s.idx.get(date) - s.idx.get(pos.entryDate);
      const sold = pos.fills.filter((f) => f.side === 'SELL');
      const avgExit = sold.reduce((a, f) => a + f.qty * f.price, 0) / sold.reduce((a, f) => a + f.qty, 0);
      pos.rMultiple = round(rMultiple(pos, avgExit), 2);
      closed.push(pos);
      open.splice(open.indexOf(pos), 1);
      if (reason === 'stop' && !pos.partialDone) {
        const prev = stoppedOut.get(pos.symbol);
        stoppedOut.set(pos.symbol, { date, pivot: pos.pivot, count: (prev?.count || 0) + 1, dateIdx: dates.indexOf(date) });
      }
    }
  };

  /** One candle for one open position. */
  const manageBar = (pos, bar, d, s, i, isLast) => {
    const { open: o, high: h, low: l, close: c, time } = bar;
    const target = pos.entryPrice * (1 + R.partialAtPct / 100);
    if (o <= pos.stop) return sell(pos, pos.qtyOpen, o * (1 - slip), d, time, 'stop');
    const hitsTarget = !pos.partialDone && h >= target;
    if (l <= pos.stop && !(hitsTarget && o >= target)) return sell(pos, pos.qtyOpen, pos.stop * (1 - slip), d, time, 'stop');
    pos.highest = Math.max(pos.highest, h);
    if (hitsTarget) {
      const a = managePosition(pos, target, {}, R).find((x) => x.type === 'partial');
      if (a) {
        if (a.qty > 0) sell(pos, a.qty, Math.max(o, target) * (1 - slip), d, time, 'partial');
        pos.partialDone = true;
        pos.stop = a.newStop;
        if (pos.qtyOpen > 0 && c <= pos.stop) return sell(pos, pos.qtyOpen, pos.stop * (1 - slip), d, time, 'stop');
      }
    }
    // Failed breakout: closed back below the pivot within the first days → sell at the close
    if (isLast && FX.enabled && pos.qtyOpen > 0 && !pos.partialDone && c < pos.pivot && dates.indexOf(d) - dates.indexOf(pos.entryDate) < (FX.days || 2)) {
      return sell(pos, pos.qtyOpen, c * (1 - slip), d, time, 'failed');
    }
    // Time exit: neither the stop nor the +10% target within N trading days → sell at the close
    if (isLast && R.timeExit?.enabled && pos.qtyOpen > 0 && !pos.partialDone && dates.indexOf(d) - dates.indexOf(pos.entryDate) >= (R.timeExit.days || 7)) {
      return sell(pos, pos.qtyOpen, c * (1 - slip), d, time, 'time');
    }
    if (pos.qtyOpen <= 0 || !pos.partialDone) return;
    let trailLevel = null;
    if (isLast && R.trailMethod === 'ema21') trailLevel = s.m.ema21[i];
    else if (isLast && R.trailMethod === 'sma50') trailLevel = s.m.sma50[i];
    for (const a of managePosition(pos, c, { isCloseCheck: isLast, trailLevel }, R)) {
      if (a.type === 'trail') sell(pos, pos.qtyOpen, c * (1 - slip), d, time, 'trail');
      else if (a.type === 'stop') sell(pos, pos.qtyOpen, Math.min(c, pos.stop) * (1 - slip), d, time, 'stop');
      else if (a.type === 'raiseStop') pos.stop = a.newStop;
    }
  };

  /** A day's candles by slot (0 = 09:15). Falls back to the daily candle as one closing candle. */
  const slotsFor = (s, d, i) => {
    const bars = getBars(s.token, d) || [];
    const map = new Array(SLOTS).fill(null);
    if (bars.length) {
      for (const b of bars) {
        const [hh, mm] = b.time.split(':').map(Number);
        const k = Math.round((hh * 60 + mm - 555) / 15);
        if (k >= 0 && k < SLOTS) map[k] = b;
      }
      return { map, intraday: true };
    }
    map[SLOTS - 1] = { open: s.c.open[i], high: s.c.high[i], low: s.c.low[i], close: s.c.close[i], volume: s.c.volume[i], time: '15:15', daily: true };
    return { map, intraday: false };
  };

  for (let di = 0; di < dates.length; di++) {
    const d = dates[di];
    const regime = prevAnalysis?.market?.regime;

    // today's candidate setups
    const cands = [];
    if (prevAnalysis) {
      for (const a of prevAnalysis.stocks) {
        const s = bySym.get(a.symbol);
        const i = s.idx.get(d);
        if (i == null) continue;
        const so = stoppedOut.get(a.symbol);
        const isRe = !!so && R.reentry.enabled && di - so.dateIdx <= R.reentry.windowDays && so.count <= R.reentry.maxPerSetup;
        let pivot, chartStop;
        if (isSetup(a)) {
          pivot = a.vcp.pivot;
          chartStop = a.vcp.stop;
        } else if (isRe && a.trend?.passCount >= 7 && s.c.close[i - 1] < so.pivot) {
          pivot = so.pivot;
          chartStop = Math.min(...s.c.low.slice(Math.max(0, i - 5), i)) * 0.995;
        } else continue;
        if (open.some((p) => p.symbol === a.symbol)) continue;
        if (so && so.date === d) continue;
        if (s.c.high[i] <= pivot) continue; // no candle today can close above the pivot
        const slots = slotsFor(s, d, i);
        if (slots.intraday) coverage.entryDays15++;
        else coverage.entryDaysDaily++;
        cands.push({ a, s, i, pivot, chartStop, isRe, slots, cumVol: 0, pv: 0, hi: -Infinity, lo: Infinity, dayOpen: null, orHigh: -Infinity, armed: false, everArmed: false, done: false });
      }
    }
    const posSlots = new Map();
    for (const pos of open) {
      const s = bySym.get(pos.symbol);
      const i = s.idx.get(d);
      if (i == null) continue;
      const sl = slotsFor(s, d, i);
      if (sl.intraday) coverage.positionDays15++;
      else coverage.positionDaysDaily++;
      posSlots.set(pos, { s, i, sl });
    }

    for (let k = 0; k < SLOTS; k++) {
      const isLast = k === SLOTS - 1;
      // 1. manage positions held before this candle
      for (const pos of [...open]) {
        const ps = posSlots.get(pos);
        if (!ps) continue;
        const bar = ps.sl.map[k];
        if (bar) manageBar(pos, bar, d, ps.s, ps.i, isLast);
      }
      // 1b. two-stage buy: at 15:15 add the rest if the breakout held (position ≥ 30 min old)
      if (TS.enabled && k === SLOTS - 2) {
        for (const pos of open) {
          if (pos.stage !== 1 || di * SLOTS + k - pos.entryClock < 2) continue;
          const ps = posSlots.get(pos);
          const bar = ps?.sl.map[k];
          if (!bar) continue;
          const thr = pos.pivot * (1 + (CF.pivotBufferPct || 0) / 100);
          const dayVol = ps.sl.map.slice(0, k + 1).reduce((acc, b) => acc + (b?.volume || 0), 0);
          const a = prevAnalysis?.stocks.find((x) => x.symbol === pos.symbol);
          const pace = a?.avgVol50 ? dayVol / volumeFraction((k + 1) * 15) / a.avgVol50 : null;
          const holds = bar.close >= thr && bar.close > pos.stop && bar.close <= pos.pivot * (1 + R.buyZonePct / 100) && (pace == null || pace >= R.minVolPace);
          pos.stage = 0;
          if (!holds) continue;
          const px = roundTick(bar.close * (1 + slip));
          const q2 = Math.min(pos.plannedAdd, Math.floor((cash * 0.995) / px));
          if (q2 < 1) continue;
          const ch2 = deliveryCharges('BUY', q2, px);
          cash -= q2 * px + ch2;
          pos.entryPrice = round((pos.entryPrice * pos.qtyInitial + px * q2) / (pos.qtyInitial + q2));
          pos.qtyInitial += q2;
          pos.qtyOpen += q2;
          pos.charges += ch2;
          pos.realized -= ch2;
          pos.stage = 2;
          pos.fills.push({ date: d, time: bar.time, side: 'BUY', qty: q2, price: px, reason: 'second part' });
        }
      }
      // 2. entries on this candle's close
      const fired = [];
      for (const c of cands) {
        if (c.done) continue;
        const bar = c.slots.map[k];
        if (!bar) continue;
        c.cumVol += bar.volume || 0;
        c.pv += ((bar.high + bar.low + bar.close) / 3) * (bar.volume || 0);
        c.hi = Math.max(c.hi, bar.high);
        c.lo = Math.min(c.lo, bar.low);
        if (c.dayOpen == null) c.dayOpen = bar.open;
        if (!bar.daily && k < 2) c.orHigh = Math.max(c.orHigh, bar.high); // first 30 minutes
        const minutes = bar.daily ? 375 : (k + 1) * 15;
        if (bar.close <= c.pivot) {
          c.armed = false; // fell back below the pivot before confirming
          continue;
        }
        if (bar.close > c.pivot * (1 + R.buyZonePct / 100)) continue;
        c.armed = true;
        c.everArmed = true;
        if (minutes < R.minMinutesAfterOpen) continue;
        const pace = c.a.avgVol50 ? c.cumVol / volumeFraction(minutes) / c.a.avgVol50 : 0;
        if (CF.enabled) {
          // the same checks the live Screener uses, evaluated on this candle's close
          const { confirmed } = evaluateChecks(
            {
              ltp: bar.close,
              pivot: c.pivot,
              dayOpen: c.dayOpen,
              dayHigh: c.hi,
              dayLow: c.lo,
              vwap: c.cumVol ? c.pv / c.cumVol : null,
              orHigh: bar.daily ? null : k >= 2 ? c.orHigh : null,
              lastBar: { c: bar.close, bucket: k },
              armedBucket: k,
              minutes,
              volPace: pace,
            },
            CF,
            R.minVolPace,
          );
          if (!confirmed) continue;
        } else if (pace < R.minVolPace) continue;
        c.done = true;
        signals.total++;
        const entry = roundTick(bar.close * (1 + slip));
        const sc = scoreSetup(c.isRe && !c.a.vcp?.valid ? { ...c.a, vcp: { ...c.a.vcp, valid: true, pivot: c.pivot } } : c.a, { price: entry, volPace: pace });
        let minScore = R.minScore;
        if (regime === 'pressure') minScore += R.pressureExtraScore;
        if (regime === 'downtrend' && marketFilter === 'pause') {
          signals.skippedRegime++;
          continue;
        }
        if (sc.score < minScore) {
          signals.skippedScore++;
          continue;
        }
        const st = computeStop(entry, c.chartStop, R);
        if (st.skip) {
          signals.skippedStop++;
          continue;
        }
        fired.push({ ...c, entry, stop: st.stop, score: sc.score, grade: sc.grade, time: bar.time, half: regime === 'downtrend' && marketFilter === 'half' });
      }
      fired.sort((x, y) => y.score - x.score);
      for (const f of fired) {
        const eq =
          cash +
          open.reduce((acc, p) => {
            const s = bySym.get(p.symbol);
            return acc + p.qtyOpen * (s.c.close[s.idx.get(d) - 1] || p.entryPrice);
          }, 0);
        const cap = capacityCheck({ openPositions: open, industry: f.a.industry, rules: R });
        const size = positionSize({ equity: f.half ? eq / 2 : eq, cash, price: f.entry, rules: R });
        if (!cap.ok || size.qty < 1 || size.limitedByCash) {
          signals.skippedCapital++;
          continue;
        }
        const planned = size.qty;
        if (TS.enabled && planned >= 2) size.qty = Math.max(1, Math.floor(planned * (TS.firstFraction || 0.5)));
        const ch = deliveryCharges('BUY', size.qty, f.entry);
        cash -= size.qty * f.entry + ch;
        signals.taken++;
        const pos = {
          symbol: f.a.symbol,
          industry: f.a.industry,
          entryDate: d,
          entryTime: f.time,
          entryPrice: f.entry,
          qtyInitial: size.qty,
          qtyOpen: size.qty,
          stop: f.stop,
          initialStop: f.stop,
          pivot: f.pivot,
          partialDone: false,
          highest: f.entry,
          charges: ch,
          realized: -ch,
          grade: f.grade,
          score: f.score,
          isReentry: f.isRe,
          plannedAdd: planned - size.qty,
          stage: planned - size.qty > 0 ? 1 : 0,
          entryClock: di * SLOTS + k,
          fills: [{ date: d, time: f.time, side: 'BUY', qty: size.qty, price: f.entry, reason: f.isRe ? 're-entry' : 'breakout' }],
        };
        open.push(pos);
        if (f.isRe) stoppedOut.delete(f.a.symbol);
        // manage from the NEXT candle onwards
        posSlots.set(pos, { s: f.s, i: f.i, sl: { map: f.slots.map.map((b, j) => (j > k ? b : null)), intraday: f.slots.intraday } });
      }
    }

    for (const c of cands) if (c.everArmed && !c.done) signals.notConfirmed++;
    const invested = open.reduce((acc, p) => {
      const s = bySym.get(p.symbol);
      const i = s.idx.get(d);
      return acc + p.qtyOpen * (i != null ? s.c.close[i] : p.entryPrice);
    }, 0);
    equity.push({ date: d, equity: round(cash + invested, 0), cash: round(cash, 0), invested: round(invested, 0), positions: open.length });
    prevAnalysis = analyzeUniverse(prepared, { indexCandles: index, date: d });
    if (onProgress && di % 10 === 0) onProgress(di / dates.length);
  }

  const trades = closed.map((p) => ({ ...p }));
  const totalEntry = coverage.entryDays15 + coverage.entryDaysDaily;
  const totalPos = coverage.positionDays15 + coverage.positionDaysDaily;
  return {
    params: { from: dates[0], to: dates[dates.length - 1], capital, rules: R, marketFilter, resolution: '15minute' },
    stats: computeStats(trades, equity, capital),
    equity,
    trades: trades.sort((a, b) => (a.entryDate < b.entryDate ? 1 : -1)),
    openAtEnd: open.map((p) => ({ symbol: p.symbol, entryDate: p.entryDate, entryPrice: p.entryPrice, qtyOpen: p.qtyOpen, stop: p.stop })),
    signals,
    coverage: {
      ...coverage,
      entryPct: totalEntry ? round((coverage.entryDays15 / totalEntry) * 100, 1) : null,
      positionPct: totalPos ? round((coverage.positionDays15 / totalPos) * 100, 1) : null,
    },
  };
}
