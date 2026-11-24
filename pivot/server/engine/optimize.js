// Settings optimiser: searches the EXISTING rules for the combination with the best
// return-to-drawdown, using walk-forward validation to avoid fitting to noise.
//
//  1. Analyse history once (precomputeAnalyses).
//  2. Split dates: first ~70% = "training", last ~30% = "test" (never seen while tuning).
//  3. Random search + one-setting-at-a-time refinement on the training period.
//  4. The best training candidates are re-run on the test period; the winner is the one whose
//     WORSE period is best (robust), not the one with the flashiest training result.
//
// Score = annual return ÷ max drawdown (the "MAR" ratio), penalised when drawdown exceeds
// your limit or when there are too few trades to trust.

import { precomputeAnalyses, runBacktest } from './backtest.js';
import { rng } from '../demo/synth.js';
import { round } from './vcp.js';

/** The knobs that already exist in Pivot's rules, with sensible ranges. */
export const SEARCH_SPACE = {
  minScore: [55, 60, 65, 70, 75, 80],
  positionPct: [8, 10, 12.5, 15],
  maxStopPct: [5, 5.5, 6],
  partialAtPct: [8, 10, 12, 15, 20],
  trailMethod: ['ema21', 'sma50', 'pct10'],
  buyZonePct: [2, 3, 5],
  minVolPace: [1.2, 1.5, 2],
  marketFilter: ['pause', 'half'],
  confirm: [true, false],
  twoStage: [true, false],
  failedExit: [true, false],
  reentry: [true, false],
};

export const PARAM_LABELS = {
  minScore: 'Minimum setup score',
  positionPct: 'Position size (% of capital)',
  maxStopPct: 'Maximum stop (%)',
  partialAtPct: 'Sell ⅓ at (+%)',
  trailMethod: 'Trailing exit',
  buyZonePct: 'Buy zone above pivot (%)',
  minVolPace: 'Breakout volume (×)',
  marketFilter: 'In a market correction',
  confirm: 'Breakout confirmation',
  twoStage: 'Two-stage buy',
  failedExit: 'Sell failed breakouts',
  reentry: 'Re-entry after stop-out',
};

/** Read the current settings into a parameter set. */
export function paramsFromSettings(rules, marketFilter) {
  return {
    minScore: rules.minScore,
    positionPct: rules.positionPct,
    maxStopPct: rules.maxStopPct,
    partialAtPct: rules.partialAtPct,
    trailMethod: rules.trailMethod,
    buyZonePct: rules.buyZonePct,
    minVolPace: rules.minVolPace,
    marketFilter,
    confirm: !!rules.confirm?.enabled,
    twoStage: !!rules.twoStage?.enabled,
    failedExit: !!rules.failedExit?.enabled,
    reentry: !!rules.reentry?.enabled,
  };
}

/** Turn a parameter set into a settings patch (what "Apply" saves). */
export function settingsPatch(p, baseRules) {
  return {
    marketFilter: p.marketFilter,
    rules: {
      minScore: p.minScore,
      positionPct: p.positionPct,
      maxPositions: Math.max(1, Math.round(100 / p.positionPct)),
      maxStopPct: p.maxStopPct,
      partialAtPct: p.partialAtPct,
      trailMethod: p.trailMethod,
      buyZonePct: p.buyZonePct,
      minVolPace: p.minVolPace,
      confirm: { ...(baseRules.confirm || {}), enabled: p.confirm },
      twoStage: { ...(baseRules.twoStage || {}), enabled: p.twoStage },
      failedExit: { ...(baseRules.failedExit || {}), enabled: p.failedExit },
      reentry: { ...(baseRules.reentry || {}), enabled: p.reentry },
    },
  };
}

const key = (p) => JSON.stringify(Object.keys(SEARCH_SPACE).map((k) => p[k]));

export function optimize({ stocks, index, from, to, capital = 500000, baseRules, baseMarketFilter = 'pause', maxDrawdownPct = 15, trials = 160, minTrades = 12, seed = 1, locked = ['positionPct'], changePenalty = 0.05, onProgress }) {
  const progress = (phase, p) => onProgress?.({ phase, progress: p });
  const pre = precomputeAnalyses({ stocks, index, from, to, onProgress: (p) => progress('analyse', p * 0.45) });
  const dates = pre.dates;
  if (dates.length < 250) throw new Error('Not enough history to optimise — at least ~2 years is needed (use “Get 5 years of data”).');
  const split = dates[Math.floor(dates.length * 0.7)];
  const train = { from: dates[0], to: split };
  const test = { from: dates[Math.floor(dates.length * 0.7) + 1], to: dates[dates.length - 1] };

  const cache = new Map();
  const run = (p, period) => {
    const k = key(p) + period.from;
    if (cache.has(k)) return cache.get(k);
    const patch = settingsPatch(p, baseRules);
    const r = runBacktest({ pre, from: period.from, to: period.to, capital, rules: { ...baseRules, ...patch.rules }, marketFilter: patch.marketFilter });
    const s = r.stats;
    const years = Math.max(0.25, (new Date(period.to) - new Date(period.from)) / (365 * 86400000));
    const annual = (Math.pow(Math.max(0.01, 1 + s.totalReturnPct / 100), 1 / years) - 1) * 100;
    const dd = Math.abs(s.maxDrawdownPct);
    let score = s.trades ? annual / Math.max(dd, 3) : 0; // no trades = no evidence either way
    if (score > 0 && s.trades < minTrades) score *= s.trades / minTrades; // too few trades to trust: shrink towards 0
    if (dd > maxDrawdownPct) score -= (dd - maxDrawdownPct) * 0.25; // over your drawdown limit
    const m = { score: round(score, 3), annualPct: round(annual, 2), returnPct: s.totalReturnPct, maxDrawdownPct: s.maxDrawdownPct, trades: s.trades, winRate: s.winRate, profitFactor: s.profitFactor, avgWinPct: s.avgWinPct, avgLossPct: s.avgLossPct };
    cache.set(k, m);
    return m;
  };

  const r = rng(seed);
  const current = paramsFromSettings(baseRules, baseMarketFilter);
  const tried = [];
  const consider = (p) => {
    const m = run(p, train);
    tried.push({ p, train: m });
    return m.score;
  };

  // 1) random search (always includes your current settings). Locked settings keep your value.
  consider(current);
  const names = Object.keys(SEARCH_SPACE).filter((n) => !locked.includes(n));
  const space = Object.fromEntries(Object.keys(SEARCH_SPACE).map((n) => [n, locked.includes(n) ? [current[n]] : SEARCH_SPACE[n]]));
  for (let i = 0; i < trials; i++) {
    const p = Object.fromEntries(Object.keys(space).map((n) => [n, r.pick(space[n])]));
    consider(p);
    if (i % 5 === 0) progress('search', 0.45 + 0.3 * (i / trials));
  }
  // 2) refine the best few: change one setting at a time while it keeps improving
  const ranked = () => [...new Map(tried.map((t) => [key(t.p), t])).values()].sort((a, b) => b.train.score - a.train.score);
  const seeds = ranked().slice(0, 3).map((t) => t.p);
  seeds.forEach((start, si) => {
    let best = { ...start };
    let bestScore = run(best, train).score;
    for (let pass = 0; pass < 2; pass++) {
      let improved = false;
      for (const n of names) {
        for (const v of space[n]) {
          if (v === best[n]) continue;
          const cand = { ...best, [n]: v };
          const sc = consider(cand);
          if (sc > bestScore + 1e-6) {
            best = cand;
            bestScore = sc;
            improved = true;
          }
        }
      }
      if (!improved) break;
    }
    progress('refine', 0.75 + 0.15 * ((si + 1) / seeds.length));
  });

  // 3) validate the top candidates on the unseen test period; choose the most robust
  const finalists = ranked().slice(0, 10);
  const nChanges = (p) => names.filter((n) => p[n] !== current[n]).length;
  for (const f of finalists) {
    f.test = run(f.p, test);
    // robust = the worse of the two periods, minus a little for every setting changed
    f.robust = round(Math.min(f.train.score, f.test.score) - changePenalty * nChanges(f.p), 3);
    // never recommend settings that lost money in either period or broke the drawdown limit
    f.eligible = f.train.annualPct > 0 && f.test.annualPct > 0 && Math.abs(f.test.maxDrawdownPct) <= maxDrawdownPct;
  }
  progress('validate', 0.97);
  finalists.sort((a, b) => (b.eligible - a.eligible) || b.robust - a.robust);
  const cur = { p: current, train: run(current, train), test: run(current, test) };
  cur.robust = round(Math.min(cur.train.score, cur.test.score), 3);
  const best = finalists.find((f) => f.eligible);
  const keepCurrent = !best || best.robust <= cur.robust;

  // full-period result for the recommendation and for your current settings
  const fullOf = (p) => {
    const patch = settingsPatch(p, baseRules);
    const res = runBacktest({ pre, capital, rules: { ...baseRules, ...patch.rules }, marketFilter: patch.marketFilter });
    return { stats: res.stats, equity: thin(res.equity) };
  };
  const recommended = keepCurrent ? cur : best;
  const changes = Object.keys(SEARCH_SPACE).filter((n) => recommended.p[n] !== current[n]).map((n) => ({ key: n, label: PARAM_LABELS[n], from: current[n], to: recommended.p[n] }));
  progress('done', 1);
  return {
    periods: { train, test },
    tested: new Set(tried.map((t) => key(t.p))).size,
    locked,
    maxDrawdownPct,
    current: { params: current, train: cur.train, test: cur.test, robust: cur.robust, full: fullOf(current) },
    recommended: { params: recommended.p, train: recommended.train, test: recommended.test, robust: recommended.robust, full: fullOf(recommended.p), patch: settingsPatch(recommended.p, baseRules) },
    keepCurrent,
    changes,
    finalists: finalists.map((f) => ({ params: f.p, train: f.train, test: f.test, robust: f.robust, eligible: f.eligible })),
    reason: !best ? 'None of the alternatives made money in both the tuning and the unseen test period within your drawdown limit.' : keepCurrent ? 'No alternative was clearly more robust than your current settings.' : null,
  };
}

function thin(eq) {
  const step = Math.max(1, Math.floor(eq.length / 300));
  return eq.filter((_, i) => i % step === 0 || i === eq.length - 1).map((e) => ({ date: e.date, equity: e.equity }));
}
