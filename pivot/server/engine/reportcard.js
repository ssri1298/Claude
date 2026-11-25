// Rule report card: how your own closed trades did, grouped by the conditions at the time of buying,
// plus plain-English suggestions where a group clearly lost money while the rest made money.

import { round } from './vcp.js';

const band = (v, edges, labels) => {
  if (v == null || Number.isNaN(v)) return null;
  for (let i = 0; i < edges.length; i++) if (v < edges[i]) return labels[i];
  return labels[labels.length - 1];
};

const REASON = { stop: 'Stop-loss', trail: 'Trailing exit', manual: 'You sold', outside: 'Outside Pivot', partial: 'Partial', failed: 'Failed breakout', time: 'Time exit', climax: 'Climax sale' };

export const DIMENSIONS = [
  { key: 'score', label: 'Setup score', of: (t) => band(t.score, [65, 75, 85], ['Below 65', '65–74 (B)', '75–84 (A)', '85+ (A+)']), order: ['Below 65', '65–74 (B)', '75–84 (A)', '85+ (A+)'] },
  { key: 'regime', label: 'Market at entry', of: (t) => ({ uptrend: 'Confirmed uptrend', pressure: 'Under pressure', downtrend: 'Correction' })[t.ctx?.regime] || null, order: ['Confirmed uptrend', 'Under pressure', 'Correction'] },
  { key: 'sector', label: 'Sector strength', of: (t) => band(t.ctx?.sectorRs, [35, 70], ['Weak (bottom third)', 'Middle', 'Leading (top third)']), order: ['Leading (top third)', 'Middle', 'Weak (bottom third)'] },
  { key: 'stop', label: 'Stop size', of: (t) => band(t.stopPct, [4, 5, 6.01], ['Under 4%', '4–5%', '5–6%', 'Over 6%']), order: ['Under 4%', '4–5%', '5–6%', 'Over 6%'] },
  { key: 'volume', label: 'Breakout volume', of: (t) => band(t.ctx?.volPace ?? t.volPace, [1.5, 2, 3], ['Under 1.5×', '1.5–2×', '2–3×', '3× or more']), order: ['Under 1.5×', '1.5–2×', '2–3×', '3× or more'] },
  { key: 'base', label: 'Base depth', of: (t) => band(t.ctx?.baseDepth, [15, 25, 35], ['Under 15%', '15–25%', '25–35%', 'Over 35%']), order: ['Under 15%', '15–25%', '25–35%', 'Over 35%'] },
  { key: 'exit', label: 'How it ended', of: (t) => REASON[t.exitReason] || t.exitReason || null },
  { key: 'entry', label: 'Entry type', of: (t) => (t.isReentry ? 'Re-entry after a stop-out' : 'First breakout') },
];

function summarize(list) {
  const n = list.length;
  const wins = list.filter((t) => t.realized > 0).length;
  const sum = (f) => list.reduce((s, t) => s + f(t), 0);
  return {
    trades: n,
    winRate: n ? round((wins / n) * 100, 0) : null,
    avgPct: n ? round(sum((t) => t.pct) / n, 2) : null,
    avgR: n ? round(sum((t) => t.r) / n, 2) : null,
    pnl: round(sum((t) => t.realized), 0),
  };
}

/** rows: closed positions from the database (with setup JSON). */
export function reportCard(rows, { minTrades = 5, rules = {} } = {}) {
  const trades = rows.map((p) => {
    const setup = typeof p.setup === 'string' ? JSON.parse(p.setup || '{}') : p.setup || {};
    const risk = (p.entry_price - (p.initial_stop || p.stop)) * p.qty_initial;
    return {
      symbol: p.symbol,
      score: p.score,
      realized: p.realized || 0,
      pct: p.entry_price && p.qty_initial ? ((p.realized || 0) / (p.entry_price * p.qty_initial)) * 100 : 0,
      r: risk > 0 ? (p.realized || 0) / risk : 0,
      stopPct: p.entry_price && p.initial_stop ? (1 - p.initial_stop / p.entry_price) * 100 : null,
      exitReason: p.exit_reason,
      isReentry: !!p.is_reentry,
      volPace: setup.volPace,
      ctx: setup.entryCtx || null,
    };
  });
  const overall = summarize(trades);
  const dims = DIMENSIONS.map((d) => {
    const groups = new Map();
    for (const t of trades) {
      const k = d.of(t);
      if (k == null) continue;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(t);
    }
    let buckets = [...groups.entries()].map(([label, list]) => ({ label, ...summarize(list) }));
    if (d.order) buckets.sort((a, b) => d.order.indexOf(a.label) - d.order.indexOf(b.label));
    else buckets.sort((a, b) => b.trades - a.trades);
    return { key: d.key, label: d.label, buckets, covered: buckets.reduce((s, b) => s + b.trades, 0) };
  });

  // Suggestions: a group with enough trades that lost money while your trades overall made money
  const tips = [];
  if (overall.trades >= minTrades * 2 && overall.avgR > 0) {
    const bad = (key) => dims.find((x) => x.key === key)?.buckets.filter((b) => b.trades >= minTrades && b.avgR < 0) || [];
    const w = (b) => `${b.trades} trades, ${b.winRate}% wins, average ${b.avgR}R`;
    for (const b of bad('score')) {
      const next = { 'Below 65': 65, '65–74 (B)': 75, '75–84 (A)': 85 }[b.label];
      if (next && next > (rules.minScore || 0)) tips.push({ area: 'Buying rules', text: `Trades scoring ${b.label} lost money (${w(b)}). Consider raising the minimum score to ${next}.` });
    }
    for (const b of bad('regime')) {
      if (b.label === 'Under pressure') tips.push({ area: 'Buying rules', text: `Trades bought while the market was under pressure lost money (${w(b)}). Consider a higher extra score for that market, or pausing buys.` });
      if (b.label === 'Correction') tips.push({ area: 'Buying rules', text: `Trades bought during a correction lost money (${w(b)}). Set the market filter to "Pause new buys".` });
    }
    for (const b of bad('sector')) if (b.label.startsWith('Weak')) tips.push({ area: 'Buying rules', text: `Stocks from weak sectors lost money (${w(b)}). Turn on "Only buy in leading sectors".` });
    for (const b of bad('stop')) if (b.label === '5–6%' || b.label === 'Over 6%') tips.push({ area: 'Selling rules', text: `Trades with a ${b.label} stop lost money (${w(b)}). Consider a maximum stop of 5%.` });
    for (const b of bad('volume')) if (b.label === 'Under 1.5×' || b.label === '1.5–2×') tips.push({ area: 'Buying rules', text: `Breakouts on ${b.label} volume lost money (${w(b)}). Consider requiring 2× volume.` });
    for (const b of bad('base')) if (b.label === 'Over 35%' || b.label === '25–35%') tips.push({ area: 'Buying rules', text: `Bases deeper than ${b.label.replace('Over ', '').split('–')[0]} lost money (${w(b)}). Shallower bases have worked better for you.` });
    for (const b of bad('entry')) if (b.label.startsWith('Re-entry')) tips.push({ area: 'Buying rules', text: `Re-entries lost money (${w(b)}). Consider switching off "Re-buy after a stop-out".` });
  }
  return { overall, dimensions: dims, tips, minTrades, withContext: trades.filter((t) => t.ctx).length };
}
