import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sma, ema, roundTick, columns } from '../server/engine/indicators.js';
import { detectVCP, trendTemplate, movingAverages, rankPercentiles } from '../server/engine/vcp.js';
import { computeStop, positionSize, managePosition, deliveryCharges, DEFAULT_RULES, capacityCheck } from '../server/engine/rules.js';
import { computeStats } from '../server/engine/stats.js';
import { volumePace, volumeFraction } from '../server/engine/market.js';
import { runBacktest } from '../server/engine/backtest.js';
import { generateMarket } from '../server/demo/synth.js';
import { tradingDates } from '../server/demo/synth.js';
import { scoreSetup } from '../server/engine/scoring.js';
import { evaluateChecks, DEFAULT_CONFIRM } from '../server/engine/confirm.js';

test('sma / ema', () => {
  assert.deepEqual(sma([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]);
  const e = ema([1, 1, 1, 1, 1], 3);
  assert.equal(e[4], 1);
  assert.equal(e[1], null);
});

test('roundTick', () => {
  assert.equal(roundTick(100.03), 100.05);
  assert.equal(roundTick(100.03, 0.05, 'down'), 100);
  assert.equal(roundTick(100.01, 0.05, 'up'), 100.05);
  assert.equal(roundTick(100.05, 0.05, 'up'), 100.05);
});

/** Hand-built textbook VCP: advance, then contractions of 20% → 10% → 5% with drying volume. */
function textbookVcp() {
  const closes = [];
  const vols = [];
  let p = 100;
  for (let i = 0; i < 220; i++) {
    p *= 1.004;
    closes.push(p);
    vols.push(1_000_000);
  }
  const H = p;
  const leg = (to, n, v) => {
    const from = closes[closes.length - 1];
    for (let i = 1; i <= n; i++) {
      closes.push(from + ((to - from) * i) / n);
      vols.push(v);
    }
  };
  leg(H * 0.8, 10, 1_200_000);
  leg(H * 0.99, 10, 900_000);
  leg(H * 0.89, 7, 800_000);
  leg(H * 0.985, 7, 700_000);
  leg(H * 0.935, 5, 500_000);
  leg(H * 0.98, 5, 400_000);
  const dates = tradingDates('2026-06-30', closes.length);
  return closes.map((c, i) => ({ date: dates[i], open: c, high: c * 1.003, low: c * 0.997, close: c, volume: vols[i] }));
}

test('detectVCP finds a textbook VCP with a pivot and stop', () => {
  const c = columns(textbookVcp());
  const v = detectVCP(c);
  assert.equal(v.valid, true, v.reasons.join('; '));
  assert.equal(v.count, 3);
  const d = v.contractions.map((k) => Math.round(k.depthPct));
  assert.ok(d[0] > d[1] && d[1] > d[2], `contracting: ${d}`);
  assert.ok(v.pivot > v.stop);
  assert.ok(v.stopPct < 8);
  assert.ok(['near', 'forming'].includes(v.stage));
  assert.ok(v.lastVolRatio < 0.7, 'volume dried up');
});

test('detectVCP rejects expanding contractions', () => {
  const k = textbookVcp();
  // make the last contraction deep (a loose, failing base)
  const n = k.length;
  for (let i = n - 8; i < n; i++) {
    k[i].low *= 0.85;
    k[i].close *= 0.88;
    k[i].high *= 0.9;
  }
  const v = detectVCP(columns(k));
  assert.equal(v.valid, false);
});

test('trend template on a steady uptrend', () => {
  const k = textbookVcp();
  const c = columns(k);
  const t = trendTemplate(c, c.close.length - 1, 90, movingAverages(c));
  assert.equal(t.pass, true, JSON.stringify(t.criteria.filter((x) => !x.pass)));
});

test('rank percentiles span 1–99', () => {
  const m = rankPercentiles([1, 2, 3, 4, 5].map((s, i) => ({ key: 'k' + i, score: s })));
  assert.equal(m.get('k0'), 1);
  assert.equal(m.get('k4'), 99);
});

test('stop rules: chart stop, skip when > 6%, widen when < 3%', () => {
  assert.equal(computeStop(100, 95).stop, 95);
  assert.equal(computeStop(100, 90).skip, true);
  assert.equal(computeStop(100, 90, { ...DEFAULT_RULES, wideStopAction: 'cap' }).stop, 94);
  assert.equal(computeStop(100, 99).stop, 97);
});

test('position size is 10% of equity and limited by cash', () => {
  assert.deepEqual(positionSize({ equity: 500000, cash: 500000, price: 1000 }).qty, 50);
  const s = positionSize({ equity: 500000, cash: 20000, price: 1000 });
  assert.equal(s.qty, 19);
  assert.equal(s.limitedByCash, true);
  assert.equal(capacityCheck({ openPositions: new Array(10).fill({}), industry: 'X' }).ok, false);
});

test('position management: stop, partial at +10% with breakeven, 21-EMA trail', () => {
  const pos = { entryPrice: 100, qtyOpen: 30, qtyInitial: 30, stop: 95, partialDone: false, highest: 100 };
  assert.equal(managePosition(pos, 94.9)[0].type, 'stop');
  const p = managePosition(pos, 110.5)[0];
  assert.equal(p.type, 'partial');
  assert.equal(p.qty, 10);
  assert.equal(p.newStop, 100);
  const after = { ...pos, qtyOpen: 20, stop: 100, partialDone: true };
  assert.equal(managePosition(after, 115, { isCloseCheck: false, trailLevel: 120 }).length, 0, 'trail only at the close check');
  assert.equal(managePosition(after, 115, { isCloseCheck: true, trailLevel: 120 })[0].type, 'trail');
  assert.equal(managePosition(after, 99.9)[0].type, 'stop', 'breakeven stop');
  // 10% trailing variant
  const t = managePosition({ ...after, highest: 130 }, 128, {}, { ...DEFAULT_RULES, trailMethod: 'pct10' });
  assert.equal(t[0].type, 'raiseStop');
  assert.equal(t[0].newStop, 117);
});

test('delivery charges are about 0.12% per side plus DP on sells', () => {
  const b = deliveryCharges('BUY', 100, 1000);
  const s = deliveryCharges('SELL', 100, 1000);
  assert.ok(b > 100 && b < 130, `buy ${b}`);
  assert.ok(s > 110 && s < 140, `sell ${s}`);
});

test('volume pace projects the full-day volume', () => {
  assert.equal(volumeFraction(375), 1);
  assert.ok(Math.abs(volumePace(270000, 60, 1_000_000) - 1) < 0.01);
});

test('score caps invalid setups at grade D', () => {
  const a = { trend: { pass: true, passCount: 8 }, rsRating: 99, vcp: { valid: false, count: 3, finalDepthPct: 3 } };
  assert.ok(scoreSetup(a).score <= 49);
});

test('stats: win rate, profit factor, drawdown', () => {
  const trades = [
    { symbol: 'A', entryDate: '2026-01-01', exitDate: '2026-01-10', entryPrice: 100, qtyInitial: 10, realized: 300, rMultiple: 6 },
    { symbol: 'B', entryDate: '2026-01-02', exitDate: '2026-01-05', entryPrice: 100, qtyInitial: 10, realized: -50, rMultiple: -1 },
  ];
  const s = computeStats(trades, [
    { date: '2026-01-01', equity: 1000 },
    { date: '2026-01-05', equity: 900 },
    { date: '2026-01-10', equity: 1250 },
  ]);
  assert.equal(s.winRate, 50);
  assert.equal(s.profitFactor, 6);
  assert.equal(s.maxDrawdownPct, -10);
  assert.equal(s.rDistribution[0].count, 1);
});

test('backtest runs end-to-end on a synthetic market', () => {
  const m = generateMarket({ seed: 3, stocks: 60, days: 520 });
  const r = runBacktest({ stocks: m.stocks, index: m.index, from: m.dates[260] });
  assert.ok(r.equity.length > 200);
  assert.ok(r.stats.trades >= 1, 'should take at least one trade');
  for (const t of r.trades) {
    assert.ok(t.rMultiple > -1.6, `loss limited by the stop (got ${t.rMultiple}R)`);
    assert.ok(t.qtyInitial * t.entryPrice <= 500000 * 0.11 * (1 + r.stats.totalReturnPct / 100) + 1000, 'position ≈ 10% of capital');
  }
});

test('15-minute backtest replays candle by candle with no look-ahead', async () => {
  const { findBreakoutDays, runBacktest15 } = await import('../server/engine/backtest15.js');
  const { bars15FromDaily } = await import('../server/demo/demoFeed.js');
  const { rng } = await import('../server/demo/synth.js');
  const m = generateMarket({ seed: 3, stocks: 60, days: 520 });
  const from = m.dates[260];
  const scan = findBreakoutDays({ stocks: m.stocks, index: m.index, from });
  assert.ok(scan.candidateDays > 0 && scan.ranges.length > 0);
  const byTok = new Map(m.stocks.map((s) => [s.token, s]));
  const getBars = (token, date) => {
    if (!scan.ranges.some((r) => r.token === token && date >= r.from && date <= r.to)) return [];
    const di = m.dates.indexOf(date);
    return bars15FromDaily(byTok.get(token).candles[di], rng(token * 7919 + di));
  };
  const r = runBacktest15({ stocks: m.stocks, index: m.index, from, getBars });
  assert.ok(r.stats.trades >= 1);
  assert.equal(r.coverage.entryPct, 100, 'every breakout day had 15-minute candles');
  for (const t of r.trades) {
    assert.match(t.entryTime, /^\d\d:\d\d$/);
    // the buy is the close of a candle that closed above the pivot (plus slippage)
    const bars = getBars(byTok.get(m.stocks.find((s) => s.symbol === t.symbol).token) && m.stocks.find((s) => s.symbol === t.symbol).token, t.entryDate);
    const bar = bars.find((b) => b.time === t.entryTime);
    assert.ok(bar && bar.close > t.pivot, 'entry candle closed above the pivot');
    assert.ok(Math.abs(t.fills[0].price - bar.close * 1.001) < 0.06, 'first buy filled at that candle close');
    const adds = t.fills.filter((f) => f.reason === 'second part');
    for (const f of adds) assert.equal(f.time, '15:00', 'second part bought on the 15:00–15:15 candle close');
    if (t.exitReason === 'failed') assert.ok(t.exitPrice < t.pivot, 'failed-breakout exit only below the pivot');
    assert.ok(t.rMultiple > -1.6, `loss limited by the stop (${t.rMultiple}R)`);
    if (t.exitDate === t.entryDate) assert.ok(t.exitTime > t.entryTime, 'same-day exit happens after the entry candle');
  }
});

test('confirmation checks: VWAP, range position, gap rule, candle hold', () => {
  const base = { ltp: 101, pivot: 100, dayOpen: 99, dayHigh: 101.5, dayLow: 98, vwap: 100, orHigh: 100.2, lastBar: { c: 100.8, bucket: 3 }, armedBucket: 3, minutes: 60, volPace: 2 };
  assert.equal(evaluateChecks(base).confirmed, true);
  assert.equal(evaluateChecks({ ...base, vwap: 101.5 }).checks.vwap, false);
  assert.equal(evaluateChecks({ ...base, dayHigh: 106 }).checks.rangePos, false, 'long upper wick');
  assert.equal(evaluateChecks({ ...base, lastBar: { c: 99.9, bucket: 3 } }).checks.holdCandle, false);
  assert.equal(evaluateChecks({ ...base, lastBar: { c: 100.8, bucket: 2 } }).checks.holdCandle, false, 'candle must be after the cross');
  assert.equal(evaluateChecks({ ...base, ltp: 100.1 }).checks.buffer, false, 'must clear the pivot by 0.3%');
  // gapped above the pivot: needs the 30-minute high
  assert.equal(evaluateChecks({ ...base, dayOpen: 100.5, orHigh: 101.3 }).checks.gap, false);
  assert.equal(evaluateChecks({ ...base, dayOpen: 100.5, orHigh: 100.9 }).checks.gap, true);
  assert.equal(evaluateChecks({ ...base, dayOpen: 100.5, minutes: 20 }).checks.gap, false);
  assert.equal(evaluateChecks(base, { ...DEFAULT_CONFIRM, vwap: false }).checks.vwap, null);
});

test('NSE holiday list: bundled 2026 dates are weekdays and NSE dates parse', async () => {
  const { BUNDLED_HOLIDAYS, parseNseDate } = await import('../server/core/holidays.js');
  assert.equal(BUNDLED_HOLIDAYS[2026].length, 15);
  for (const [d] of BUNDLED_HOLIDAYS[2026]) {
    const wd = new Date(d + 'T12:00:00Z').getUTCDay();
    assert.ok(wd >= 1 && wd <= 5, `${d} is a weekday`);
  }
  assert.equal(parseNseDate('26-Jan-2026'), '2026-01-26');
  assert.equal(parseNseDate('3-Mar-2026'), '2026-03-03');
  assert.equal(parseNseDate('bad'), null);
});

test('optimiser: walk-forward search keeps locked settings and never recommends something worse than current', async () => {
  const { optimize } = await import('../server/engine/optimize.js');
  const m = generateMarket({ seed: 7, stocks: 60, days: 800 });
  const r = optimize({ stocks: m.stocks, index: m.index, from: m.dates[260], baseRules: DEFAULT_RULES, trials: 30, locked: ['positionPct', 'maxStopPct'] });
  assert.ok(r.tested > 30);
  assert.ok(r.periods.train.to < r.periods.test.from, 'test period comes after the tuning period');
  assert.equal(r.recommended.params.positionPct, DEFAULT_RULES.positionPct, 'locked: position size');
  assert.equal(r.recommended.params.maxStopPct, DEFAULT_RULES.maxStopPct, 'locked: stop');
  assert.ok(r.keepCurrent || r.recommended.robust > r.current.robust, 'only recommends a more robust set');
  assert.equal(r.recommended.patch.rules.maxPositions, Math.round(100 / r.recommended.params.positionPct));
});
