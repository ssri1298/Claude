// Full-universe analysis: RS ratings → trend template → VCP → score.
// Used by the Screener agent (live) and the Backtester (historical, bar by bar).

import { columns, mean } from './indicators.js';
import { detectVCP, trendTemplate, rsRawScore, rankPercentiles, movingAverages, rsLine, round } from './vcp.js';
import { scoreSetup, explain } from './scoring.js';
import { marketRegime } from './market.js';

/** Pre-compute column arrays + moving averages for each stock once. */
export function prepareUniverse(stocks) {
  // stocks: [{ symbol, name, industry, token, candles: [{date,open,high,low,close,volume}] }]
  return stocks
    .filter((s) => s.candles && s.candles.length >= 60)
    .map((s) => {
      const c = columns(s.candles);
      const idx = new Map(c.date.map((d, i) => [d, i]));
      return { ...s, c, m: movingAverages(c), idx };
    });
}

/**
 * Analyse every stock as of `date` (inclusive, completed bars only).
 * When `date` is omitted each stock uses its latest bar.
 */
export function analyzeUniverse(prepared, { indexCandles, date, vcpOptions } = {}) {
  const indexByDate = indexCandles ? new Map(indexCandles.map((c) => [c.date, c.close])) : null;
  const rows = [];
  for (const s of prepared) {
    let end = s.c.date.length - 1;
    if (date) {
      end = s.idx.get(date);
      if (end == null) {
        // find last bar on/before date
        end = -1;
        for (let i = s.c.date.length - 1; i >= 0; i--)
          if (s.c.date[i] <= date) {
            end = i;
            break;
          }
      }
    }
    if (end < 60) continue;
    rows.push({ s, end, raw: rsRawScore(s.c.close, end) });
  }
  const rsMap = rankPercentiles(rows.map((r) => ({ key: r.s.symbol, score: r.raw })));

  // Industry group strength = mean RS of members, then ranked
  const byInd = new Map();
  for (const r of rows) {
    const k = r.s.industry || 'Other';
    if (!byInd.has(k)) byInd.set(k, []);
    byInd.get(k).push(rsMap.get(r.s.symbol));
  }
  const indRank = rankPercentiles([...byInd.entries()].map(([k, v]) => ({ key: k, score: mean(v) })));

  let above50 = 0,
    ttPass = 0;
  const out = [];
  for (const { s, end } of rows) {
    const rsRating = rsMap.get(s.symbol);
    const trend = trendTemplate(s.c, end, rsRating, s.m);
    const close = s.c.close[end];
    if (s.m.sma50[end] && close > s.m.sma50[end]) above50++;
    if (trend.pass) ttPass++;
    const a = {
      symbol: s.symbol,
      name: s.name,
      industry: s.industry,
      token: s.token,
      asOf: s.c.date[end],
      close: round(close),
      changePct: round((close / s.c.close[end - 1] - 1) * 100),
      rsRating,
      sectorRs: indRank.get(s.industry || 'Other'),
      trend,
      sma50: round(s.m.sma50[end]),
      sma150: round(s.m.sma150[end]),
      sma200: round(s.m.sma200[end]),
      ema10: round(s.m.ema10[end]),
      ema21: round(s.m.ema21[end]),
      avgVol50: Math.round(s.m.vol50[end] || 0),
      turnoverCr: turnoverCr(s.c, end),
    };
    // Only run the (more expensive) VCP detector on stocks that are in a Stage 2 uptrend-ish.
    if (trend.passCount >= 6) {
      a.vcp = detectVCP(s.c, end, vcpOptions);
      const rl = rsLine(s.c, end, indexByDate);
      a.rsLineHigh = rl.newHigh;
    } else {
      a.vcp = { valid: false, stage: 'none', reasons: ['Not in a Stage 2 uptrend'] };
    }
    a.stage = a.trend.pass ? a.vcp.stage || 'none' : 'none';
    const sc = scoreSetup(a);
    a.score = sc.score;
    a.grade = sc.grade;
    a.scoreParts = sc.parts;
    a.explain = explain(a, sc);
    out.push(a);
  }
  const breadth = {
    above50Pct: rows.length ? (above50 / rows.length) * 100 : null,
    trendTemplatePct: rows.length ? (ttPass / rows.length) * 100 : null,
    total: rows.length,
  };
  let market = null;
  if (indexCandles) {
    const ic = date ? indexCandles.filter((c) => c.date <= date) : indexCandles;
    market = marketRegime(ic, breadth, aggregateVolume(prepared));
  }
  const sectors = sectorTable(out, indRank);
  out.sort((x, y) => y.score - x.score);
  return { stocks: out, breadth, market, sectors };
}

/** Combined daily volume of the whole universe (cached on the prepared array). */
export function aggregateVolume(prepared) {
  if (prepared._aggVol) return prepared._aggVol;
  const m = new Map();
  for (const s of prepared) for (let i = 0; i < s.c.date.length; i++) m.set(s.c.date[i], (m.get(s.c.date[i]) || 0) + (s.c.volume[i] || 0));
  Object.defineProperty(prepared, '_aggVol', { value: m, enumerable: false });
  return m;
}

/** Industry groups ranked by strength: average RS, % of stocks in an uptrend, setups, leaders. */
export function sectorTable(stocks, indRank) {
  const g = new Map();
  for (const a of stocks) {
    const k = a.industry || 'Other';
    if (!g.has(k)) g.set(k, { industry: k, count: 0, rsSum: 0, uptrend: 0, above50: 0, setups: 0, top: [] });
    const x = g.get(k);
    x.count++;
    x.rsSum += a.rsRating || 0;
    if (a.trend?.pass) x.uptrend++;
    if (a.sma50 && a.close > a.sma50) x.above50++;
    if (a.trend?.pass && a.vcp?.valid) x.setups++;
    x.top.push(a);
  }
  return [...g.values()]
    .map((x) => ({
      industry: x.industry,
      rank: indRank?.get(x.industry) ?? null,
      count: x.count,
      avgRs: Math.round(x.rsSum / x.count),
      uptrendPct: Math.round((x.uptrend / x.count) * 100),
      above50Pct: Math.round((x.above50 / x.count) * 100),
      setups: x.setups,
      leaders: x.top
        .sort((p, q) => (q.rsRating || 0) - (p.rsRating || 0))
        .slice(0, 3)
        .map((a) => ({ symbol: a.symbol, rs: a.rsRating })),
    }))
    .sort((p, q) => (q.rank ?? 0) - (p.rank ?? 0));
}

/** Average ₹ crore traded per day over the last 50 sessions (liquidity). */
export function turnoverCr(c, end, n = 50) {
  let sum = 0,
    k = 0;
  for (let i = Math.max(0, end - n + 1); i <= end; i++) {
    sum += c.close[i] * (c.volume[i] || 0);
    k++;
  }
  return k ? round(sum / k / 1e7, 1) : null;
}

/** Is this analysed stock a tradeable candidate (setup valid, in or near buy zone)? */
export function isCandidate(a) {
  return a.trend?.pass && a.vcp?.valid && ['near', 'breakout', 'forming'].includes(a.stage);
}
