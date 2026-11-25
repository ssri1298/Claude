// How much luck is in a backtest?
//  monteCarlo:  replay the same trades in thousands of random orders → a realistic range of final returns
//               and worst drawdowns (the historical order is only one of many that could have happened).
//  byPeriod:    results per year (or half-year for short tests) → is the edge steady, or did one lucky
//               stretch make all the money? Also compares the first half of the test with the second.

import { round } from './vcp.js';

/** Deterministic pseudo-random numbers so the same backtest gives the same Monte Carlo result. */
function rng(seed = 12345) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pctile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];

/** Each trade's effect on the whole account: P&L ÷ account value on its entry day. */
function contributions(trades, equity, startCapital) {
  const eqByDate = new Map(equity.map((e) => [e.date, e.equity]));
  return trades
    .filter((t) => t.exitDate)
    .map((t) => t.realized / (eqByDate.get(t.entryDate) || startCapital || 1))
    .filter((x) => Number.isFinite(x));
}

export function monteCarlo(trades, equity, startCapital, runs = 2000) {
  const c = contributions(trades, equity, startCapital);
  if (c.length < 10) return { runs: 0, trades: c.length, note: 'Needs at least 10 closed trades' };
  const rand = rng(c.length * 7919);
  const finals = [];
  const dds = [];
  for (let r = 0; r < runs; r++) {
    const a = c.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    let eq = 1,
      peak = 1,
      dd = 0;
    for (const x of a) {
      eq *= 1 + x;
      if (eq > peak) peak = eq;
      dd = Math.max(dd, 1 - eq / peak);
    }
    finals.push((eq - 1) * 100);
    dds.push(dd * 100);
  }
  finals.sort((x, y) => x - y);
  dds.sort((x, y) => x - y);
  return {
    runs,
    trades: c.length,
    returnPct: { p5: round(pctile(finals, 0.05), 1), p50: round(pctile(finals, 0.5), 1), p95: round(pctile(finals, 0.95), 1) },
    maxDrawdownPct: { p50: round(pctile(dds, 0.5), 1), p95: round(pctile(dds, 0.95), 1), worst: round(dds[dds.length - 1], 1) },
    lossChancePct: round((finals.filter((x) => x < 0).length / runs) * 100, 1),
  };
}

export function byPeriod(trades, equity, startCapital) {
  if (!equity.length) return { periods: [], halves: null };
  const first = equity[0].date;
  const last = equity[equity.length - 1].date;
  const years = (new Date(last) - new Date(first)) / (365.25 * 86400000);
  const key = years >= 2 ? (d) => d.slice(0, 4) : (d) => `${d.slice(0, 4)} ${Number(d.slice(5, 7)) <= 6 ? 'H1' : 'H2'}`;
  const groups = new Map();
  for (const e of equity) {
    const k = key(e.date);
    if (!groups.has(k)) groups.set(k, { period: k, startEq: e.equity, endEq: e.equity, peak: e.equity, maxDD: 0, from: e.date, to: e.date, trades: [] });
    const g = groups.get(k);
    g.endEq = e.equity;
    g.to = e.date;
    g.peak = Math.max(g.peak, e.equity);
    g.maxDD = Math.max(g.maxDD, 1 - e.equity / g.peak);
  }
  // a period's start value = the previous period's end value
  let prevEnd = startCapital || equity[0].equity;
  for (const g of groups.values()) {
    g.startEq = prevEnd;
    prevEnd = g.endEq;
  }
  for (const t of trades.filter((x) => x.exitDate)) groups.get(key(t.exitDate))?.trades.push(t);
  const periods = [...groups.values()].map((g) => {
    const n = g.trades.length;
    const wins = g.trades.filter((t) => t.realized > 0).length;
    const avgR = n ? g.trades.reduce((s, t) => s + (t.rMultiple || 0), 0) / n : null;
    return { period: g.period, from: g.from, to: g.to, returnPct: round((g.endEq / g.startEq - 1) * 100, 1), maxDrawdownPct: round(g.maxDD * 100, 1), trades: n, winRate: n ? round((wins / n) * 100, 0) : null, avgR: avgR == null ? null : round(avgR, 2) };
  });
  const closed = trades.filter((x) => x.exitDate).sort((a, b) => (a.exitDate < b.exitDate ? -1 : 1));
  const mid = Math.floor(closed.length / 2);
  const half = (arr) => (arr.length ? { trades: arr.length, winRate: round((arr.filter((t) => t.realized > 0).length / arr.length) * 100, 0), avgR: round(arr.reduce((s, t) => s + (t.rMultiple || 0), 0) / arr.length, 2) } : null);
  const halves = closed.length >= 10 ? { first: half(closed.slice(0, mid)), second: half(closed.slice(mid)) } : null;
  const losing = periods.filter((p) => p.trades > 0 && p.returnPct < 0).length;
  let verdict;
  if (!halves) verdict = 'Too few trades to judge consistency.';
  else if (halves.first.avgR > 0 && halves.second.avgR > 0 && losing <= Math.floor(periods.length / 3)) verdict = 'Consistent: the rules made money in both halves of the test and in most periods.';
  else if (halves.first.avgR > 0 !== halves.second.avgR > 0) verdict = 'Inconsistent: the rules worked in one half of the test but not the other — results may depend on one market phase.';
  else verdict = 'Mixed: several losing periods — expect long flat or losing stretches.';
  return { periods, halves, verdict };
}
