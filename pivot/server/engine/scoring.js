// Setup quality score (0–100) used by the Analyst agent to pick the best stock.
// Every point is explainable: each factor returns its points and a plain-English note.

import { round } from './vcp.js';

export const WEIGHTS = {
  trend: 12,
  rs: 18,
  contractions: 20,
  volume: 15,
  base: 10,
  proximity: 5,
  breakout: 10,
  sector: 5,
  risk: 5,
};

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export function scoreSetup(a, live = {}) {
  const v = a.vcp || {};
  const t = a.trend || {};
  const parts = [];
  const add = (key, label, pts, max, note) => parts.push({ key, label, points: round(clamp(pts, 0, max), 1), max, note });

  // 1. Trend template strength
  {
    let p = (t.passCount || 0) * 1.0; // up to 8
    if (t.ma200SlopePct > 2) p += 2;
    else if (t.ma200SlopePct > 0.5) p += 1;
    if (t.above200Pct > 15) p += 2;
    else if (t.above200Pct > 5) p += 1;
    add('trend', 'Trend template', p, WEIGHTS.trend, `${t.passCount || 0}/8 criteria · 200-DMA ${t.ma200SlopePct >= 0 ? 'rising' : 'falling'} ${t.ma200SlopePct ?? '–'}%/month`);
  }
  // 2. Relative strength
  {
    const rs = a.rsRating || 0;
    let p = rs >= 70 ? ((rs - 70) / 29) * 15 + 3 : rs >= 50 ? ((rs - 50) / 20) * 3 : 0;
    if (a.rsLineHigh) p += 3;
    add('rs', 'Relative strength', p, WEIGHTS.rs, `RS rating ${rs}${a.rsLineHigh ? ' · RS line at a new high (leader)' : ''}`);
  }
  // 3. Contraction quality
  {
    let p = 0;
    const n = v.count || 0;
    p += { 2: 5, 3: 8, 4: 9, 5: 8, 6: 7 }[n] || 0;
    const fd = v.finalDepthPct ?? 99;
    p += fd <= 4 ? 8 : fd <= 6 ? 7 : fd <= 8 ? 5 : fd <= 10 ? 3 : fd <= 12 ? 1 : 0;
    if (v.higherLows) p += 2;
    if (v.tightnessPct != null && v.tightnessPct < 4) p += 1;
    if (v.shrinkViolations) p -= 4 * v.shrinkViolations;
    const seq = (v.contractions || []).map((k) => Math.round(k.depthPct) + '%').join(' → ');
    add('contractions', 'Contractions (VCP)', p, WEIGHTS.contractions, n ? `${n} contractions ${seq}` : 'No contractions');
  }
  // 4. Volume dry-up / accumulation
  {
    let p = 0;
    const r = v.lastVolRatio ?? 1;
    p += r <= 0.5 ? 8 : r <= 0.65 ? 6 : r <= 0.8 ? 4 : r <= 1 ? 1 : 0;
    p += Math.min(4, (v.dryUpDays || 0) * 0.8);
    const ud = v.upDownVol ?? 1;
    p += ud >= 1.5 ? 3 : ud >= 1.15 ? 2 : ud >= 1 ? 1 : 0;
    add('volume', 'Volume behaviour', p, WEIGHTS.volume, `Last contraction at ${Math.round(r * 100)}% of avg volume · ${v.dryUpDays || 0} dry-up days · up/down volume ${ud}`);
  }
  // 5. Base depth & length
  {
    let p = 0;
    const d = v.depthPct ?? 99;
    p += d <= 15 ? 6 : d <= 25 ? 5 : d <= 33 ? 3 : d <= 40 ? 1 : 0;
    const w = (v.baseBars || 0) / 5;
    p += w >= 5 && w <= 30 ? 4 : w >= 3 && w <= 52 ? 2 : 0;
    add('base', 'Base structure', p, WEIGHTS.base, `${round(d, 0)}% deep · ${Math.round(w)} weeks long · prior advance +${round(v.priorAdvancePct ?? 0, 0)}%`);
  }
  // 6. Proximity to 52-week high
  {
    const f = -(t.fromHighPct ?? -99);
    const p = f <= 5 ? 5 : f <= 10 ? 3.5 : f <= 15 ? 2 : f <= 25 ? 1 : 0;
    add('proximity', 'Near 52-week high', p, WEIGHTS.proximity, `${round(f, 1)}% below 52-week high`);
  }
  // 7. Breakout quality (live) — or readiness before breakout
  {
    let p = 0;
    let note;
    if (live.volPace != null && live.price > (v.pivot || Infinity)) {
      const x = live.volPace;
      p = x >= 3 ? 10 : x >= 2 ? 8.5 : x >= 1.5 ? 6.5 : x >= 1.2 ? 3 : 0;
      note = `Breaking out on ${round(x, 1)}× projected volume`;
    } else {
      const d = v.distToPivotPct ?? -99;
      p = d >= -2 ? 4 : d >= -5 ? 2.5 : 0;
      note = d > -99 ? `${round(Math.abs(d), 1)}% ${d >= 0 ? 'above' : 'below'} pivot` : 'No pivot';
    }
    add('breakout', 'Breakout', p, WEIGHTS.breakout, note);
  }
  // 8. Sector / industry strength
  {
    const s = a.sectorRs ?? 50;
    const p = s >= 80 ? 5 : s >= 65 ? 3.5 : s >= 50 ? 2 : 0.5;
    add('sector', 'Industry strength', p, WEIGHTS.sector, `${a.industry || 'Industry'} group RS ${Math.round(s)}`);
  }
  // 9. Risk (stop distance from pivot)
  {
    const s = v.stopPct ?? 99;
    const p = s <= 4 ? 5 : s <= 5 ? 4 : s <= 6 ? 3 : s <= 8 ? 1 : 0;
    add('risk', 'Tight risk', p, WEIGHTS.risk, `Chart stop ${round(s, 1)}% below pivot`);
  }

  let total = round(clamp(parts.reduce((s, x) => s + x.points, 0), 0, 100), 0);
  if (!v.valid || !t.pass) total = Math.min(total, 49); // not a tradeable setup → never above grade D
  return { score: total, grade: grade(total), parts };
}

export function grade(s) {
  return s >= 85 ? 'A+' : s >= 75 ? 'A' : s >= 65 ? 'B' : s >= 55 ? 'C' : 'D';
}

/** Plain-English summary bullets for the stock card. */
export function explain(a, scored) {
  const good = [];
  const bad = [];
  const v = a.vcp || {};
  if (a.trend?.pass) good.push('Passes all 8 points of the Minervini trend template');
  else if (a.trend) bad.push(`Trend template ${a.trend.passCount}/8 — ${a.trend.criteria.filter((c) => !c.pass).map((c) => c.label.toLowerCase()).join(', ')}`);
  if (a.rsRating >= 85) good.push(`Market leader — RS rating ${a.rsRating}`);
  if (a.rsLineHigh) good.push('RS line is at a new high before price — classic leadership sign');
  (v.positives || []).forEach((p) => good.push(p));
  (v.reasons || []).forEach((r) => bad.push(r));
  if (v.stopPct > 6) bad.push(`Stop would be ${v.stopPct}% away — wider than your 6% limit`);
  if (a.sectorRs >= 75) good.push(`Strong industry group (${a.industry})`);
  else if (a.sectorRs != null && a.sectorRs < 40) bad.push(`Weak industry group (${a.industry})`);
  for (const p of scored.parts) if (p.points / p.max < 0.25 && p.key !== 'breakout') bad.push(`Low on ${p.label.toLowerCase()}`);
  return { good: [...new Set(good)], bad: [...new Set(bad)] };
}
