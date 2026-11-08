import TABLE from '../data/neetss-surgical.js';

const norm = (s) => ` ${String(s).toLowerCase().replace(/[^a-z0-9+\- ]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Pre-compile keyword regexes. Short keywords need whole-word matches; long ones may be prefixes
// (e.g. "laparoscop" matches "laparoscopic").
const COMPILED = TABLE.areas.map((a) => ({
  ...a,
  rx: a.keywords.map((k) => {
    // "~word" marks a broad keyword (e.g. "~breast"): it places a title only when nothing more specific matches.
    const broad = k.startsWith('~');
    const kw = (broad ? k.slice(1) : k).trim();
    const body = esc(kw).replace(/ /g, '[ -]?');
    return { len: broad ? 1 : kw.length, re: new RegExp(kw.length >= 6 ? `\\b${body}` : `\\b${body}\\b`) };
  }),
}));

function bigrams(s) {
  const t = s.replace(/\s+/g, '');
  const out = new Set();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}
export function dice(a, b) {
  const A = bigrams(norm(a)), B = bigrams(norm(b));
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const x of A) if (B.has(x)) n++;
  return (2 * n) / (A.size + B.size);
}

const UNCLASSIFIED = { area: 'Unclassified', subject: 'General', weight: 4, score: 0 };

function classifyText(title) {
  const t = norm(title);
  let best = null;
  for (const a of COMPILED) {
    let score = 0;
    for (const k of a.rx) if (k.re.test(t)) score += k.len;
    if (score > 0 && a.priority) return { area: a.area, subject: a.subject, weight: a.weight, score };
    if (score > 0 && (!best || score > best.score || (score === best.score && a.weight > best.weight))) {
      best = { area: a.area, subject: a.subject, weight: a.weight, score };
    }
  }
  if (best) return best;
  // Fuzzy fallback on area names, only for close matches
  let fz = null;
  for (const a of TABLE.areas) {
    const d = dice(title, a.area);
    if (d > 0.6 && (!fz || d > fz.d)) fz = { area: a.area, subject: a.subject, weight: a.weight, d };
  }
  if (fz) return { area: fz.area, subject: fz.subject, weight: fz.weight, score: 0 };
  return UNCLASSIFIED;
}

/**
 * Classify a video title against the NEET SS Surgical frequency table. `hint` (e.g. the course
 * section the video sits under) is used only when the title alone can't be placed.
 */
export function classify(title, hint) {
  const c = classifyText(title);
  if (c !== UNCLASSIFIED || !hint) return c;
  return classifyText(hint);
}

export const effectiveWeight = (t) => (t.yield_override ?? t.yield_weight);

export function yieldBand(w) {
  return w >= 8 ? 'high' : w >= 5 ? 'medium' : 'low';
}

/**
 * Study-next score: past-exam frequency dominates; shorter videos and the original course order
 * break ties; topics carried over from a missed day jump the queue.
 */
export function scoreTopic(t, idx, total) {
  const w = effectiveWeight(t);
  const d = t.duration_min || 0;
  const shortBonus = d <= 20 ? 5 : d <= 40 ? 3 : d <= 60 ? 1 : 0;
  const orderBonus = total > 1 ? 3 * (1 - idx / (total - 1)) : 3;
  const carry = t.carryover ? 100 : 0;
  return Math.round((w * 10 + shortBonus + orderBonus + carry) * 10) / 10;
}

export function rankTopics(topics) {
  const pending = topics.filter((t) => t.status === 'pending').sort((a, b) => a.order_idx - b.order_idx || a.id - b.id);
  return pending
    .map((t, i) => ({ ...t, weight: effectiveWeight(t), band: yieldBand(effectiveWeight(t)), score: scoreTopic(t, i, pending.length) }))
    .sort((a, b) => b.score - a.score);
}

/** Parse "topic,count" CSV lines from a past-paper analysis into weight overrides (1–10). */
export function parseFrequencyCsv(csv) {
  const rows = [];
  for (const line of String(csv).split(/\r?\n/)) {
    const m = line.match(/^\s*"?(.+?)"?\s*[,;\t]\s*(\d+(?:\.\d+)?)\s*$/);
    if (m && !/^topic$/i.test(m[1].trim())) rows.push({ topic: m[1].trim(), count: Number(m[2]) });
  }
  const max = Math.max(1, ...rows.map((r) => r.count));
  return rows.map((r) => ({ ...r, weight: Math.max(1, Math.round((r.count / max) * 10)) }));
}

export class YieldAgent {
  name = 'yield';
  handles = ['yield.classify', 'yield.rank', 'yield.importCsv', 'yield.table'];
  constructor(store) {
    this.store = store;
  }

  handle({ type, payload }) {
    switch (type) {
      case 'yield.classify':
        return classify(payload.title, payload.hint);
      case 'yield.table':
        return TABLE;
      case 'yield.rank': {
        const topics = this.store.all('topics');
        const ranked = rankTopics(topics);
        const th = payload.lowYieldThreshold ?? 3;
        return {
          ranked: ranked.filter((t) => !(t.weight <= th && !t.skip_dismissed)),
          suggestedSkips: ranked.filter((t) => t.weight <= th && !t.skip_dismissed),
        };
      }
      case 'yield.importCsv': {
        const rows = parseFrequencyCsv(payload.csv);
        const topics = this.store.all('topics');
        let matched = 0;
        for (const t of topics) {
          let best = null;
          for (const r of rows) {
            const s = Math.max(dice(t.title, r.topic), t.yield_area ? dice(t.yield_area, r.topic) : 0,
              norm(t.title).includes(norm(r.topic).trim()) ? 1 : 0);
            if (s > 0.55 && (!best || s > best.s)) best = { ...r, s };
          }
          if (best) {
            this.store.update('topics', t.id, { yield_override: best.weight });
            matched++;
          }
        }
        this.bus?.log('yield', 'csv.imported', `${rows.length} rows, ${matched} topics re-weighted`);
        return { rows: rows.length, matched };
      }
    }
  }
}
