// Trading performance statistics (used by the dashboard and reports).

import { round } from './vcp.js';

/**
 * @param trades  closed trades: { symbol, entryDate, exitDate, entryPrice, qtyInitial, initialStop,
 *                 realized (net ₹ incl. charges), charges, exitReason, grade, isReentry, holdDays, rMultiple }
 * @param equity  [{ date, equity }] daily equity curve (optional)
 * @param startCapital
 */
export function computeStats(trades, equity = [], startCapital = 0) {
  const t = trades.filter((x) => x.exitDate);
  const n = t.length;
  const pnlPct = (x) => (x.entryPrice * x.qtyInitial ? (x.realized / (x.entryPrice * x.qtyInitial)) * 100 : 0);
  const wins = t.filter((x) => x.realized > 0);
  const losses = t.filter((x) => x.realized <= 0);
  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
  const avg = (arr, f) => (arr.length ? sum(arr, f) / arr.length : 0);
  const grossProfit = sum(wins, (x) => x.realized);
  const grossLoss = -sum(losses, (x) => x.realized);
  const winRate = n ? wins.length / n : 0;
  const avgWin = avg(wins, pnlPct);
  const avgLoss = avg(losses, pnlPct);

  // streaks (chronological by exit date)
  const chrono = [...t].sort((a, b) => (a.exitDate < b.exitDate ? -1 : 1));
  let curW = 0,
    curL = 0,
    maxW = 0,
    maxL = 0;
  for (const x of chrono) {
    if (x.realized > 0) {
      curW++;
      curL = 0;
    } else {
      curL++;
      curW = 0;
    }
    maxW = Math.max(maxW, curW);
    maxL = Math.max(maxL, curL);
  }

  // Equity-curve metrics
  let maxDD = 0,
    peak = -Infinity,
    ddStart = null,
    maxDDPeriod = null;
  for (const p of equity) {
    if (p.equity > peak) {
      peak = p.equity;
      ddStart = p.date;
    }
    const dd = peak > 0 ? (p.equity / peak - 1) * 100 : 0;
    if (dd < maxDD) {
      maxDD = dd;
      maxDDPeriod = { from: ddStart, to: p.date };
    }
  }
  const startEq = equity[0]?.equity ?? startCapital;
  const endEq = equity[equity.length - 1]?.equity ?? startCapital + sum(t, (x) => x.realized);
  const totalReturnPct = startEq ? (endEq / startEq - 1) * 100 : 0;
  let cagr = null;
  if (equity.length > 60) {
    const days = (new Date(equity[equity.length - 1].date) - new Date(equity[0].date)) / 86400000;
    if (days > 0) cagr = (Math.pow(endEq / startEq, 365 / days) - 1) * 100;
  }

  // Monthly returns from equity curve
  const months = new Map();
  for (const p of equity) {
    const m = p.date.slice(0, 7);
    if (!months.has(m)) months.set(m, { first: p.equity, last: p.equity });
    months.get(m).last = p.equity;
  }
  const monthly = [];
  let prevLast = null;
  for (const [m, v] of months) {
    const base = prevLast ?? v.first;
    monthly.push({ month: m, returnPct: round((v.last / base - 1) * 100, 2) });
    prevLast = v.last;
  }

  const group = (keyFn) => {
    const g = new Map();
    for (const x of t) {
      const k = keyFn(x) ?? '—';
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(x);
    }
    return [...g.entries()].map(([key, arr]) => ({
      key,
      trades: arr.length,
      winRate: round((arr.filter((x) => x.realized > 0).length / arr.length) * 100, 1),
      avgPct: round(avg(arr, pnlPct), 2),
      net: round(sum(arr, (x) => x.realized), 0),
    }));
  };

  const rBuckets = [
    ['≤ -1R', -Infinity, -1],
    ['-1R to 0', -1, 0],
    ['0 to 1R', 0, 1],
    ['1R to 2R', 1, 2],
    ['2R to 3R', 2, 3],
    ['3R +', 3, Infinity],
  ].map(([label, a, b]) => ({ label, count: t.filter((x) => (x.rMultiple ?? 0) > a && (x.rMultiple ?? 0) <= b).length }));

  const best = [...t].sort((a, b) => pnlPct(b) - pnlPct(a))[0];
  const worst = [...t].sort((a, b) => pnlPct(a) - pnlPct(b))[0];
  const brief = (x) => x && { symbol: x.symbol, pct: round(pnlPct(x), 2), net: round(x.realized, 0), exitDate: x.exitDate };

  return {
    trades: n,
    wins: wins.length,
    losses: losses.length,
    winRate: round(winRate * 100, 1),
    netPnl: round(sum(t, (x) => x.realized), 0),
    charges: round(sum(t, (x) => x.charges || 0), 0),
    grossProfit: round(grossProfit, 0),
    grossLoss: round(grossLoss, 0),
    profitFactor: grossLoss ? round(grossProfit / grossLoss, 2) : grossProfit ? null : 0,
    avgWinPct: round(avgWin, 2),
    avgLossPct: round(avgLoss, 2),
    payoff: avgLoss ? round(avgWin / Math.abs(avgLoss), 2) : null,
    expectancyPct: round(winRate * avgWin + (1 - winRate) * avgLoss, 2),
    avgR: round(avg(t, (x) => x.rMultiple ?? 0), 2),
    avgHoldWin: round(avg(wins, (x) => x.holdDays || 0), 1),
    avgHoldLoss: round(avg(losses, (x) => x.holdDays || 0), 1),
    maxWinStreak: maxW,
    maxLossStreak: maxL,
    best: brief(best),
    worst: brief(worst),
    startEquity: round(startEq, 0),
    endEquity: round(endEq, 0),
    totalReturnPct: round(totalReturnPct, 2),
    cagrPct: cagr == null ? null : round(cagr, 1),
    maxDrawdownPct: round(maxDD, 2),
    maxDrawdownPeriod: maxDDPeriod,
    monthly,
    byGrade: group((x) => x.grade).sort((a, b) => ['A+', 'A', 'B', 'C', 'D', '—'].indexOf(a.key) - ['A+', 'A', 'B', 'C', 'D', '—'].indexOf(b.key)),
    byExit: group((x) => x.exitReason),
    byIndustry: group((x) => x.industry).sort((a, b) => b.net - a.net),
    byType: group((x) => (x.isReentry ? 'Re-entry' : 'First entry')),
    rDistribution: rBuckets,
  };
}
