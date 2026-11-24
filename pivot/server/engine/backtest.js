// Daily-bar backtester for the exact live strategy (same detector, scoring and trade rules).
//
// Assumptions (deliberately conservative):
//  • Signals use only bars completed before the trading day (no look-ahead on the setup).
//  • Entry when the day's high crosses the pivot: price = max(open, pivot) + slippage.
//    Full-day volume stands in for the live "volume pace" check.
//  • If the stop and the +10% target are both inside the same day's range, the stop is assumed first.
//  • A gap below the stop exits at the open. Zerodha delivery charges are deducted.

import { prepareUniverse, analyzeUniverse } from './analyze.js';
import { scoreSetup } from './scoring.js';
import { DEFAULT_RULES, computeStop, positionSize, capacityCheck, managePosition, deliveryCharges, rMultiple } from './rules.js';
import { computeStats } from './stats.js';
import { round } from './vcp.js';
import { roundTick } from './indicators.js';

export function runBacktest({ stocks, index, from, to, capital = 500000, rules = DEFAULT_RULES, marketFilter = 'pause', onProgress }) {
  const R = {
    ...DEFAULT_RULES,
    ...rules,
    reentry: { ...DEFAULT_RULES.reentry, ...(rules?.reentry || {}) },
    confirm: { ...DEFAULT_RULES.confirm, ...(rules?.confirm || {}) },
    twoStage: { ...DEFAULT_RULES.twoStage, ...(rules?.twoStage || {}) },
    failedExit: { ...DEFAULT_RULES.failedExit, ...(rules?.failedExit || {}) },
  };
  const prepared = prepareUniverse(stocks);
  const bySym = new Map(prepared.map((s) => [s.symbol, s]));
  const dates = index.map((c) => c.date).filter((d) => (!from || d >= from) && (!to || d <= to));
  let cash = capital;
  const open = [];
  const closed = [];
  const equity = [];
  const stoppedOut = new Map(); // symbol → { date, pivot, count, idx }
  const signals = { total: 0, taken: 0, skippedCapital: 0, skippedRegime: 0, skippedScore: 0, skippedStop: 0, skippedConfirm: 0 };
  const CF = { ...(R.confirm || {}) };
  const TS = R.twoStage || {};
  const FX = R.failedExit || {};
  let prevAnalysis = null;

  const sell = (pos, qty, price, date, reason) => {
    const ch = deliveryCharges('SELL', qty, price);
    const proceeds = qty * price - ch;
    cash += proceeds;
    pos.qtyOpen -= qty;
    pos.charges += ch;
    pos.realized += qty * (price - pos.entryPrice) - ch;
    pos.fills.push({ date, side: 'SELL', qty, price: round(price), reason });
    if (pos.qtyOpen <= 0) {
      pos.exitDate = date;
      pos.exitPrice = round(price);
      pos.exitReason = reason;
      const s = bySym.get(pos.symbol);
      pos.holdDays = s.idx.get(date) - s.idx.get(pos.entryDate);
      // weighted exit price for R-multiple
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

  for (let di = 0; di < dates.length; di++) {
    const d = dates[di];
    // ---------- 1. manage open positions on today's bar
    for (const pos of [...open]) {
      const s = bySym.get(pos.symbol);
      const i = s.idx.get(d);
      if (i == null) continue;
      const o = s.c.open[i],
        h = s.c.high[i],
        l = s.c.low[i],
        c = s.c.close[i];
      if (pos.entryDate === d) {
        continue; // entry day is handled at entry time

      }
      if (o <= pos.stop) {
        sell(pos, pos.qtyOpen, o * (1 - R.slippagePct / 100), d, 'stop');
        continue;
      }
      if (l <= pos.stop && !(o >= pos.entryPrice * (1 + R.partialAtPct / 100))) {
        sell(pos, pos.qtyOpen, pos.stop * (1 - R.slippagePct / 100), d, 'stop');
        continue;
      }
      pos.highest = Math.max(pos.highest, h);
      const target = pos.entryPrice * (1 + R.partialAtPct / 100);
      if (!pos.partialDone && h >= target) {
        const acts = managePosition(pos, target, {}, R);
        const a = acts.find((x) => x.type === 'partial');
        if (a) {
          if (a.qty > 0) sell(pos, a.qty, Math.max(o, target) * (1 - R.slippagePct / 100), d, 'partial');
          pos.partialDone = true;
          pos.stop = a.newStop;
        }
      }
      if (pos.qtyOpen <= 0) continue;
      if (pos.partialDone) {
        let trailLevel = null;
        if (R.trailMethod === 'ema21') trailLevel = s.m.ema21[i];
        else if (R.trailMethod === 'sma50') trailLevel = s.m.sma50[i];
        const acts = managePosition(pos, c, { isCloseCheck: true, trailLevel }, R);
        for (const a of acts) {
          if (a.type === 'trail' || a.type === 'stop') sell(pos, pos.qtyOpen, c * (1 - R.slippagePct / 100), d, a.type === 'trail' ? 'trail' : 'stop');
          else if (a.type === 'raiseStop') pos.stop = a.newStop;
        }
      }
      // Failed breakout: closed back below the pivot within the first days → sell at the close
      if (FX.enabled && pos.qtyOpen > 0 && !pos.partialDone && c < pos.pivot && di - dates.indexOf(pos.entryDate) < (FX.days || 2)) {
        sell(pos, pos.qtyOpen, c * (1 - R.slippagePct / 100), d, 'failed');
      }
    }

    // ---------- 2. new entries using yesterday's analysis
    if (prevAnalysis) {
      const regime = prevAnalysis.market?.regime;
      const candidates = [];
      for (const a of prevAnalysis.stocks) {
        const s = bySym.get(a.symbol);
        const i = s.idx.get(d);
        if (i == null) continue;
        const so = stoppedOut.get(a.symbol);
        const isRe = !!so && R.reentry.enabled && di - so.dateIdx <= R.reentry.windowDays && so.count <= R.reentry.maxPerSetup;
        let pivot, chartStop;
        if (a.vcp?.valid && a.trend?.pass && ['near', 'breakout', 'forming'].includes(a.stage) && (a.vcp.distToPivotPct ?? 0) <= 0) {
          pivot = a.vcp.pivot;
          chartStop = a.vcp.stop;
        } else if (isRe && a.trend?.passCount >= 7 && s.c.close[i - 1] < so.pivot) {
          pivot = so.pivot;
          chartStop = Math.min(...s.c.low.slice(Math.max(0, i - 5), i)) * 0.995;
        } else continue;
        if (open.some((p) => p.symbol === a.symbol)) continue;
        if (so && so.date === d) continue; // no re-entry on the day of the stop-out
        const o = s.c.open[i],
          h = s.c.high[i],
          vol = s.c.volume[i];
        if (h <= pivot || o > pivot * (1 + R.buyZonePct / 100)) continue;
        const pace = a.avgVol50 ? vol / a.avgVol50 : 0;
        if (pace < R.minVolPace) continue;
        signals.total++;
        // Daily-candle stand-in for the live confirmation checks: a strong close above the pivot
        // (cleared by the buffer, in the top third of the day's range, still in the buy zone).
        const cl = s.c.close[i],
          lo = s.c.low[i];
        const thr = pivot * (1 + (CF.pivotBufferPct || 0) / 100);
        const closeOk = cl >= thr && cl <= pivot * (1 + R.buyZonePct / 100) && (!CF.rangePos || h - lo <= 0 || cl >= lo + (CF.rangeTopFrac || 0.67) * (h - lo));
        if (CF.enabled && !closeOk) {
          signals.skippedConfirm++;
          continue;
        }
        const atClose = !!CF.enabled; // confirmed entries happen at the close in a daily backtest
        const entry = roundTick((atClose ? cl : Math.max(o, pivot * 1.001)) * (1 + R.slippagePct / 100));
        const sc = scoreSetup(isRe && !a.vcp?.valid ? { ...a, vcp: { ...a.vcp, valid: true, pivot } } : a, { price: entry, volPace: pace });
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
        const st = computeStop(entry, chartStop, R);
        if (st.skip) {
          signals.skippedStop++;
          continue;
        }
        candidates.push({ a, s, i, entry, stop: st.stop, score: sc.score, grade: sc.grade, pivot, isRe, half: regime === 'downtrend' && marketFilter === 'half', atClose, closeOk, close: cl });
      }
      candidates.sort((x, y) => y.score - x.score);
      for (const cnd of candidates) {
        const eq = cash + open.reduce((acc, p) => acc + p.qtyOpen * (bySym.get(p.symbol).c.close[bySym.get(p.symbol).idx.get(d) ?? 0] || p.entryPrice), 0);
        const cap = capacityCheck({ openPositions: open, industry: cnd.a.industry, rules: R });
        const size = positionSize({ equity: cnd.half ? eq / 2 : eq, cash, price: cnd.entry, rules: R });
        if (!cap.ok || size.qty < 1 || size.limitedByCash) {
          signals.skippedCapital++;
          continue;
        }
        const planned = size.qty;
        if (TS.enabled && !cnd.atClose && planned >= 2) size.qty = Math.max(1, Math.floor(planned * (TS.firstFraction || 0.5)));
        const ch = deliveryCharges('BUY', size.qty, cnd.entry);
        cash -= size.qty * cnd.entry + ch;
        signals.taken++;
        const pos = {
          symbol: cnd.a.symbol,
          industry: cnd.a.industry,
          entryDate: d,
          entryPrice: cnd.entry,
          qtyInitial: size.qty,
          qtyOpen: size.qty,
          stop: cnd.stop,
          initialStop: cnd.stop,
          pivot: cnd.pivot,
          partialDone: false,
          highest: cnd.entry,
          charges: ch,
          realized: -ch,
          grade: cnd.grade,
          score: cnd.score,
          isReentry: cnd.isRe,
          fills: [{ date: d, side: 'BUY', qty: size.qty, price: cnd.entry, reason: cnd.isRe ? 're-entry' : 'breakout' }],
        };
        open.push(pos);
        if (cnd.isRe) stoppedOut.delete(cnd.a.symbol);
        // Same-day stop: certain if the day closed below the stop; if we bought a gap-up open,
        // any low under the stop came after our entry. Otherwise the low most likely came
        // before price rallied through the pivot.
        const sc = cnd.s.c;
        if (cnd.atClose) continue; // bought at the close — nothing else happens today
        const gapEntry = sc.open[cnd.i] >= cnd.pivot;
        if (sc.close[cnd.i] <= pos.stop || (gapEntry && sc.low[cnd.i] <= pos.stop)) {
          sell(pos, pos.qtyOpen, pos.stop * (1 - R.slippagePct / 100), d, 'stop'); // the live stop fires at the stop level
          continue;
        }
        // Two-stage: add the rest at the close if the breakout held
        const addQty = planned - pos.qtyInitial;
        if (addQty > 0 && cnd.closeOk) {
          const px = roundTick(cnd.close * (1 + R.slippagePct / 100));
          const q2 = Math.min(addQty, Math.floor((cash * 0.995) / px));
          if (q2 > 0) {
            const ch2 = deliveryCharges('BUY', q2, px);
            cash -= q2 * px + ch2;
            pos.entryPrice = round((pos.entryPrice * pos.qtyInitial + px * q2) / (pos.qtyInitial + q2));
            pos.qtyInitial += q2;
            pos.qtyOpen += q2;
            pos.charges += ch2;
            pos.realized -= ch2;
            pos.fills.push({ date: d, side: 'BUY', qty: q2, price: px, reason: 'second part' });
          }
        }
        if (FX.enabled && sc.close[cnd.i] < cnd.pivot) sell(pos, pos.qtyOpen, sc.close[cnd.i] * (1 - R.slippagePct / 100), d, 'failed');
      }
    }

    // ---------- 3. mark to market
    const invested = open.reduce((acc, p) => {
      const s = bySym.get(p.symbol);
      const i = s.idx.get(d);
      return acc + p.qtyOpen * (i != null ? s.c.close[i] : p.entryPrice);
    }, 0);
    equity.push({ date: d, equity: round(cash + invested, 0), cash: round(cash, 0), invested: round(invested, 0), positions: open.length });

    prevAnalysis = analyzeUniverse(prepared, { indexCandles: index, date: d });
    if (onProgress && di % 20 === 0) onProgress(di / dates.length);
  }

  const trades = closed.map((p) => ({ ...p }));
  const stats = computeStats(trades, equity, capital);
  return {
    params: { from: dates[0], to: dates[dates.length - 1], capital, rules: R, marketFilter },
    stats,
    equity,
    trades: trades.sort((a, b) => (a.entryDate < b.entryDate ? 1 : -1)),
    openAtEnd: open.map((p) => ({ symbol: p.symbol, entryDate: p.entryDate, entryPrice: p.entryPrice, qtyOpen: p.qtyOpen, stop: p.stop })),
    signals,
  };
}
