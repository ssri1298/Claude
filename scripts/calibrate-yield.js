// Recalibrates the NEET SS Surgical topic-area weights in core/data/neetss-surgical.js from the
// evidence in core/data/yield-evidence.json (past-paper recall counts + high-yield mentions).
//
//   node scripts/calibrate-yield.js          → rewrite the table and print a before/after report
//   node scripts/calibrate-yield.js --dry    → report only
//
// Method (per topic area):
//   q        = average questions per paper in the recalls, scaled to a 150-question paper
//   evidence = 2 + 8 · sqrt(q / q_max)           (busiest area → 10, never seen → 2)
//            + 1 if two or more independent sources name the area as high-yield
//   weight   = round(0.6 · evidence + 0.4 · prior), clamped to 1–10
// Areas the recalls can't speak to (textbook updates & tables) keep their weight.
// The original estimate is kept as `prior_weight`, so re-running is deterministic.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const EVIDENCE_SHARE = 0.6;

const fmt = (x) => (Math.round(x * 10) / 10).toString();

export function calibrate(table, evidence, { newAreas = [] } = {}) {
  const years = Object.keys(evidence.recallTotals);
  const papers = years.length;
  const answered = years.reduce((a, y) => a + evidence.recallTotals[y], 0);
  const scale = (150 * papers) / Math.max(1, answered); // recalls hold ~140–146 of 150 questions
  const perPaper = (area) => {
    const r = evidence.recall[area];
    return r ? (years.reduce((a, y) => a + (r[y] || 0), 0) / papers) * scale : 0;
  };
  const qMax = Math.max(...table.areas.map((a) => perPaper(a.area)));
  const yearRange = `${years[0]}–${String(years[years.length - 1]).slice(-2)}`;

  const areas = table.areas.map((a) => {
    const prior = a.prior_weight ?? a.weight;
    if (a.priority) {
      return { ...a, prior_weight: prior, weight: prior, confidence: 'low', evidence: 'Not an exam topic area: groups recent-edition update and table videos. 2025 analyses report more questions on recent guidelines and updates.' };
    }
    const r = evidence.recall[a.area];
    const counts = r ? years.map((y) => r[y] || 0) : years.map(() => 0);
    const total = counts.reduce((x, y) => x + y, 0);
    const q = perPaper(a.area);
    const named = [...new Set(evidence.mentions[a.area] || [])];
    const bonus = named.length >= 2 ? 1 : 0;
    const ev = Math.min(10, 2 + 8 * Math.sqrt(q / qMax) + bonus);
    const base = newAreas.includes(a.area) ? ev : prior;
    const weight = Math.max(1, Math.min(10, Math.round(EVIDENCE_SHARE * ev + (1 - EVIDENCE_SHARE) * base)));
    const confidence = total >= 6 ? 'high' : total >= 2 || named.length >= 2 ? 'medium' : 'low';
    const parts = [`${yearRange} recalls: ${counts.join(' / ')} questions (≈${fmt(q)} per paper)`];
    if (named.length) parts.push(`named high-yield by ${named.length} source${named.length > 1 ? 's' : ''}`);
    return { ...a, prior_weight: prior, weight, confidence, evidence: parts.join(' · '), sources: [...years.map((y) => `dt-${y}`).filter(() => total > 0), ...named] };
  });
  return { ...table, version: evidence.checked, calibrated: { checked: evidence.checked, method: evidence.method, evidenceShare: EVIDENCE_SHARE, sources: evidence.sources }, areas };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = new URL('..', import.meta.url);
  const tablePath = new URL('core/data/neetss-surgical.js', root);
  const { default: table } = await import(tablePath.href + '?' + Date.now());
  const evidence = JSON.parse(readFileSync(new URL('core/data/yield-evidence.json', root), 'utf8'));
  const NEW_AREAS = ['Congenital heart disease', 'Neurosurgery — ICP, neuroanatomy & neurocritical care', 'Vascular anomalies & haemangioma', 'Congenital limb, chest-wall & craniofacial anomalies', 'Maxillofacial trauma & reconstruction'];
  const out = calibrate(table, evidence, { newAreas: NEW_AREAS });

  const rows = out.areas.map((a) => ({ area: a.area, before: a.prior_weight, after: a.weight, conf: a.confidence, ev: a.evidence })).sort((x, y) => y.after - x.after || y.before - x.before);
  console.log('After  Before  Conf    Area — evidence');
  for (const r of rows) console.log(`${String(r.after).padStart(5)}  ${String(r.before).padStart(6)}  ${r.conf.padEnd(6)}  ${r.area} — ${r.ev}`);
  const c = (k) => out.areas.filter((a) => a.confidence === k).length;
  console.log(`\nconfidence: high ${c('high')} · medium ${c('medium')} · low ${c('low')}`);

  if (!process.argv.includes('--dry')) {
    const src = readFileSync(tablePath, 'utf8');
    const header = `// NEET SS Surgical topic areas with past-exam frequency weights (1-10).
// Calibrated ${evidence.checked} by scripts/calibrate-yield.js from core/data/yield-evidence.json:
// 2022–2024 surgical-group recall papers (DocTutorials) plus published 2025 paper analyses and
// high-yield topic lists. Each area records its evidence, confidence and the earlier estimate.
// An area with "priority" wins whenever one of its keywords matches (used for textbook-update videos).
// A keyword starting with "~" is a broad word that only counts a little.
`;
    writeFileSync(tablePath, header + 'export default ' + JSON.stringify(out, null, 1) + ';\n');
    console.log(`\nwrote ${fileURLToPath(tablePath)}`);
    void src;
  }
}
