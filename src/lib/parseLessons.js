// Turns raw OCR text from a video-lesson screenshot into [{ title, duration_min }].
// Pure functions — unit-tested in tests/parseLessons.test.js.

const DURATION_PATTERNS = [
  // 1:05:30 · 1.05.30
  { re: /\b(\d{1,2})[:.](\d{2})[:.](\d{2})\b/g, f: (m) => +m[1] * 60 + +m[2] + +m[3] / 60 },
  // 1h 20m · 1 hr 20 min · 2 hours 5 minutes
  { re: /\b(\d{1,2})\s*(?:h|hr|hrs|hour|hours)\.?\s*(\d{1,2})\s*(?:m|min|mins|minute|minutes)\b\.?/gi, f: (m) => +m[1] * 60 + +m[2] },
  // 45:12 (mm:ss)
  { re: /\b(\d{1,3}):(\d{2})\b/g, f: (m) => +m[1] + +m[2] / 60 },
  // 2h · 1 hr · 2 hours
  { re: /\b(\d{1,2}(?:\.\d)?)\s*(?:h|hr|hrs|hour|hours)\b\.?/gi, f: (m) => +m[1] * 60 },
  // 45 min · 45m · 45 mins · 45 minutes
  { re: /\b(\d{1,3})\s*(?:m|min|mins|minute|minutes)\b\.?/gi, f: (m) => +m[1] },
  // 45.12 at end of line (OCR read ":" as ".")
  { re: /\b(\d{1,3})\.(\d{2})\s*$/g, f: (m) => +m[1] + +m[2] / 60 },
];

/** Find all duration tokens in a line. Returns [{ minutes, index, length }], non-overlapping. */
export function findDurations(line) {
  const found = [];
  for (const { re, f } of DURATION_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(line))) {
      const start = m.index, end = m.index + m[0].length;
      if (found.some((x) => start < x.index + x.length && end > x.index)) continue;
      const minutes = f(m);
      if (minutes > 0 && minutes <= 600) found.push({ minutes, index: start, length: m[0].length });
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

export function parseDuration(str) {
  const d = findDurations(String(str));
  return d.length ? Math.ceil(Math.max(...d.map((x) => x.minutes))) : null;
}

const NOISE_WORDS = /\b(watched|completed|complete|resume|continue|play|new|free|notes?|pdf|locked|unlocked|download(?:ed)?|bookmark(?:ed)?|in progress|not started|duration|views?|mark as done|start)\b/gi;

export function cleanTitle(s) {
  let t = String(s)
    .replace(/[|•●○◦▶►▸➤✓✔☑✅⏵⏯★☆]+/g, ' ')
    .replace(/\b\d{1,3}\s?%/g, ' ')
    .replace(NOISE_WORDS, ' ')
    .replace(/^\s*(?:lecture|lesson|video|class|part|module|ch(?:apter)?|session|l)\s*[-#:.]?\s*\d+\s*[-:.)]?\s*/i, '')
    .replace(/^\s*[#(\[]?\d{1,3}[)\].:\-]?\s+/, '')
    .replace(/[\s\-–—:·,.;/]+$/g, '')
    .replace(/^[\s\-–—:·,.;/>)\]]+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (/^(?:video|lecture|lesson|class|module|recorded|live|recording|session|chapter|topic)s?$/i.test(t)) return '';
  return t;
}

const letters = (s) => (s.match(/[a-z]/gi) || []).length;

// Course-app chrome that is never a lesson title: filter tabs, status words, badges.
const UI_WORDS = new Set(['all', 'paused', 'completed', 'complete', 'unattempted', 'attempted', 'in', 'progress', 'not', 'started', 'watched', 'resume', 'continue', 'pro', 'free', 'new', 'locked']);
const TAB_WORDS = new Set(['all', 'paused', 'completed', 'unattempted', 'attempted', 'ongoing', 'bookmarked', 'downloaded']);
function isChrome(raw, cleaned) {
  const words = raw.toLowerCase().match(/[a-z]+/g) || [];
  if (words.length && words.every((w) => UI_WORDS.has(w) || w.length < 2)) return true;
  // Filter-tab bars survive OCR only partly ("( All . iscd Completed Unattempted").
  if (words.filter((w) => TAB_WORDS.has(w)).length >= 2) return true;
  // ALL-CAPS line without a duration: a section heading or a badge such as PRO.
  if (letters(raw) >= 2 && !/[a-z]/.test(raw)) return true;
  return letters(cleaned) < 3;
}

// OCR often reads Roman numerals I / II / III as "|", "l", "ll" or "li". Fix them when they
// stand alone at the end of a title or before ":" / ")".
export function fixRomanNumerals(s) {
  return String(s)
    .replace(/\bG[l|1](?=\b)/g, 'GI') // "Upper Gl Hemorrhage" → GI
    .replace(/(^|[\s:(\-–])([|lI]{1,3}|li|Il|lI)(?=\s*(?:$|[:)\-–,]))/g, (_, pre, tok) => pre + 'I'.repeat(tok.length));
}

/**
 * Parse OCR text into lesson rows: [{ title, duration_min }].
 * Tesseract separates blocks with blank lines, so a title is the paragraph of text just before
 * (or on the same line as) its duration. Multi-line titles are joined; ratings, badges, filter
 * tabs and section headings are ignored.
 */
const UNFINISHED = /(?:[(&\-–:,/]|\b(?:and|of|or|the|with|in|to|&))\s*$/i;
const openParen = (s) => (s.match(/\(/g) || []).length > (s.match(/\)/g) || []).length;

export function parseLessons(text, { ignore = [] } = {}) {
  const ignored = new Set(ignore.map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, '')));
  const out = [];
  let para = []; // title lines in the current paragraph
  let prev = []; // title lines of the previous paragraph (if no duration has claimed them)

  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    if (!line) {
      if (para.length) {
        // Keep an unfinished title together with its continuation: "Plastic Surgery (MCQ" + "Discussion)".
        const joins = prev.length && (openParen(prev.join(' ')) || UNFINISHED.test(prev[prev.length - 1]));
        prev = joins ? [...prev, ...para] : para;
        para = [];
      }
      continue;
    }
    const durs = findDurations(line);
    if (!durs.length) {
      const c = cleanTitle(fixRomanNumerals(line));
      if (!isChrome(line, c) && !ignored.has(c.toLowerCase().replace(/[^a-z0-9]/g, ''))) para.push(c);
      continue;
    }
    // Strip durations (and a leading star rating like "★ 4.6 |") to see what's left as a title.
    let rest = line;
    for (const d of [...durs].reverse()) rest = rest.slice(0, d.index) + ' ' + rest.slice(d.index + d.length);
    rest = rest.replace(/\b\d(?:[.,]\d)?\s*\|?\s*$/, ' ');
    let title = cleanTitle(fixRomanNumerals(rest));
    if (letters(title) < 4) {
      let lines = para.length ? para : prev;
      // A title split across two blocks: "Plastic Surgery (MCQ" … "Discussion)".
      if (para.length && prev.length && (openParen(prev.join(' ')) || UNFINISHED.test(prev[prev.length - 1]))) lines = [...prev, ...para];
      lines = lines.slice(-3);
      title = lines.join(' ').replace(/\s+([:)])/g, '$1').replace(/\s{2,}/g, ' ').trim();
    }
    para = [];
    prev = [];
    if (letters(title) < 3) continue;
    const minutes = Math.ceil(Math.max(...durs.map((d) => d.minutes)));
    out.push({ title, duration_min: minutes });
  }

  // De-duplicate overlapping screenshots: same title AND same length. ("Part II" and a misread
  // "Part III" can share a title, so the duration keeps them apart.)
  const seen = new Set();
  return out.filter((r) => {
    const k = r.title.toLowerCase().replace(/[^a-z0-9]/g, '') + '|' + r.duration_min;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * The page header (e.g. the course name) repeats at the top of every screenshot of a list.
 * Returns title-like lines that open at least two of the given OCR texts, to pass as `ignore`.
 */
export function detectHeaders(texts) {
  const counts = new Map();
  for (const text of texts) {
    const firsts = new Set();
    for (const raw of String(text).split(/\r?\n/).slice(0, 12)) {
      const line = raw.replace(/\s+/g, ' ').trim();
      if (!line || findDurations(line).length) continue;
      const c = cleanTitle(line);
      if (!isChrome(line, c)) firsts.add(c);
    }
    for (const c of firsts) counts.set(c, (counts.get(c) || 0) + 1);
  }
  const min = Math.max(2, Math.ceil(texts.length / 2));
  return [...counts].filter(([, n]) => n >= min).map(([c]) => c);
}

const normKey = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
function similar(a, b) {
  const A = normKey(a), B = normKey(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  const grams = (s) => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) || 0) + 1); return m; };
  const ga = grams(A), gb = grams(B);
  let hit = 0;
  for (const [g, n] of ga) hit += Math.min(n, gb.get(g) || 0);
  return (2 * hit) / (A.length + B.length - 2 || 1);
}

/**
 * Merge a second OCR pass (different image scale) into the first pass of the same screenshot.
 * A second-pass row is added only when it fills a gap: the rows just before and after it were
 * both found by the first pass, next to each other. That recovers a lesson the first pass
 * dropped without letting header noise or misreads in.
 */
export function mergePasses(primary, secondary) {
  const matchIdx = (r) => primary.findIndex((p) => p.duration_min === r.duration_min && similar(p.title, r.title) >= 0.6);
  const out = primary.map((r) => ({ ...r }));
  const inserts = []; // [afterPrimaryIndex, row]
  for (let i = 1; i < secondary.length - 1; i++) {
    if (matchIdx(secondary[i]) !== -1) continue;
    const before = matchIdx(secondary[i - 1]);
    const after = matchIdx(secondary[i + 1]);
    if (before !== -1 && after === before + 1) inserts.push([before, { ...secondary[i], recovered: true }]);
  }
  for (const [at, row] of inserts.reverse()) out.splice(at + 1, 0, row);
  return out;
}

/**
 * Course lists number parts in order (I, II, III). When OCR repeats a numeral for consecutive
 * parts of the same title ("Breast: I", "Breast: II", "Breast: II"), renumber them in order.
 */
export function repairNumeralSequence(rows) {
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
  const split = (t) => {
    const m = String(t).match(/^(.*?)[\s:]*\b(I{1,3}|IV|V|VI{0,3})\s*$/);
    return m ? { base: normKey(m[1]), num: ROMAN.indexOf(m[2]) + 1 } : null;
  };
  const out = rows.map((r) => ({ ...r }));
  let i = 0;
  while (i < out.length) {
    const first = split(out[i].title);
    if (!first) { i++; continue; }
    let j = i + 1;
    while (j < out.length && split(out[j].title)?.base === first.base) j++;
    const run = out.slice(i, j).map((r) => split(r.title));
    const increasing = run.every((p, k) => k === 0 || p.num > run[k - 1].num);
    if (run.length > 1 && !increasing && run[0].num === 1) {
      for (let k = 0; k < run.length; k++) {
        out[i + k].title = out[i + k].title.replace(/\b(I{1,3}|IV|V|VI{0,3})\s*$/, ROMAN[k]);
        out[i + k].renumbered = true;
      }
    }
    i = j;
  }
  return out;
}
