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

/** Parse OCR text into lesson rows. */
export function parseLessons(text) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const out = [];
  let pending = []; // candidate title lines waiting for a duration

  for (const line of lines) {
    const durs = findDurations(line);
    if (!durs.length) {
      const c = cleanTitle(line);
      if (letters(c) >= 3) pending.push(c);
      if (pending.length > 3) pending.shift();
      continue;
    }
    // Strip durations out of the line to see what's left as a title
    let rest = line;
    for (const d of [...durs].reverse()) rest = rest.slice(0, d.index) + ' ' + rest.slice(d.index + d.length);
    let title = cleanTitle(rest);
    if (letters(title) < 4 && pending.length) {
      // Duration sits on its own line — title is the line(s) above.
      let last = pending.pop();
      if (pending.length && /^[a-z(&]/.test(last)) last = `${pending.pop()} ${last}`;
      title = last;
    }
    pending = [];
    if (letters(title) < 3) continue;
    const minutes = Math.ceil(Math.max(...durs.map((d) => d.minutes)));
    out.push({ title, duration_min: minutes });
  }

  // De-duplicate (screenshots often overlap when scrolling)
  const seen = new Set();
  return out.filter((r) => {
    const k = r.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
