// Minervini Trend Template + Volatility Contraction Pattern (VCP) detection.
//
// The detector works on completed daily candles. It finds the base (the highest high in the
// look-back window), then walks forward splitting the base into successive contractions:
//   high → lowest low after it → highest high after that low → lowest low after it → …
// A valid VCP has 2–6 contractions that get smaller from left to right, a tight final
// contraction, rising lows and drying-up volume. The pivot (buy point) is the high of the
// final contraction; the protective stop sits just under that contraction's low.

import { sma, ema, mean, pct } from './indicators.js';

export const DEFAULT_VCP_OPTIONS = {
  lookback: 250, // bars searched for the base high (~1 year)
  minBaseBars: 15, // ≥ 3 weeks
  maxBaseDepth: 40, // % — deeper bases are failure-prone
  maxFinalDepth: 12, // % — the last contraction must be tight
  minContractionDepth: 1.5, // % — smaller wiggles are noise inside the tight area
  swingPct: 3, // % pullback from a rally high that confirms a new contraction
  minContractions: 2,
  maxContractions: 6,
  shrinkTolerance: 1.15, // each contraction may be at most 15% larger than the previous one
  minPriorAdvance: 25, // % rise into the base (Minervini wants a prior uptrend)
  nearPivotPct: 5, // within 5% below pivot = "near pivot / ready"
  buyZonePct: 5, // up to 5% above pivot is still buyable
};

function argmax(arr, from, to) {
  let idx = from;
  for (let i = from; i <= to; i++) if (arr[i] > arr[idx]) idx = i;
  return idx;
}
function argmin(arr, from, to) {
  let idx = from;
  for (let i = from; i <= to; i++) if (arr[i] < arr[idx]) idx = i;
  return idx;
}

/**
 * Decompose a base starting at `h0` into contractions with a swing scan:
 * after each contraction low, the rally's high becomes the next contraction's start once
 * (a) the rally recovered ≥ 50% of the contraction and (b) price then fell ≥ swingPct from it.
 * Lower lows are merged into the previous contraction (that is still the left side of the base).
 */
function contractionsFrom(c, h0, end, opts) {
  const theta = opts.swingPct / 100;
  let list = [];
  let h = h0;
  while (h < end && list.length < 20) {
    let minIdx = h + 1;
    let rally = null;
    let next = null;
    for (let i = h + 1; i <= end; i++) {
      if (c.low[i] < c.low[minIdx]) {
        minIdx = i;
        rally = null;
        continue;
      }
      if (i > minIdx && (rally == null || c.high[i] > c.high[rally])) rally = i;
      if (
        rally != null &&
        i > rally &&
        c.low[i] <= c.high[rally] * (1 - theta) &&
        c.high[rally] - c.low[minIdx] >= 0.5 * (c.high[h] - c.low[minIdx])
      ) {
        next = rally;
        break;
      }
    }
    list.push({ h, l: minIdx });
    if (next == null) break;
    h = next;
  }
  // Merge lower lows into the earlier contraction
  let merged = true;
  while (merged) {
    merged = false;
    for (let k = 0; k + 1 < list.length; k++) {
      if (c.low[list[k + 1].l] <= c.low[list[k].l]) {
        const hk = c.high[list[k].h] >= c.high[list[k + 1].h] ? list[k].h : list[k + 1].h;
        list.splice(k, 2, { h: hk, l: list[k + 1].l });
        merged = true;
        break;
      }
    }
  }
  list = list.map((k) => ({ ...k, depth: ((c.high[k.h] - c.low[k.l]) / c.high[k.h]) * 100 }));
  // A final wiggle smaller than the noise threshold is part of the tight area, not a contraction
  while (list.length > 1 && list[list.length - 1].depth < opts.minContractionDepth) list.pop();
  return list;
}

export function detectVCP(c, end = c.close.length - 1, options = {}) {
  const o = { ...DEFAULT_VCP_OPTIONS, ...options };
  const res = { valid: false, reasons: [], positives: [] };
  if (end < 60) {
    res.reasons.push('Not enough price history');
    return res;
  }
  const start = Math.max(0, end - o.lookback + 1);
  let h0 = argmax(c.high, start, end);

  // Cup-with-handle style: the right side made a slightly higher high only recently.
  // Use the earlier left-side high as the base start if it is within 5%.
  if (end - h0 < o.minBaseBars && h0 - o.minBaseBars > start) {
    const earlier = argmax(c.high, start, h0 - o.minBaseBars);
    if (c.high[earlier] >= c.high[h0] * 0.95) h0 = earlier;
  }
  const baseBars = end - h0 + 1;
  if (end - h0 < o.minBaseBars) {
    res.reasons.push(end - h0 <= 2 ? 'Making new highs — no base yet' : `Base only ${baseBars} days old (needs ≥ ${o.minBaseBars})`);
    res.stage = end - h0 <= 2 ? 'extended' : 'forming';
    return res;
  }

  const priorLowIdx = argmin(c.low, Math.max(0, h0 - 120), h0);
  const priorAdvance = pct(c.high[h0], c.low[priorLowIdx]);

  const raw = contractionsFrom(c, h0, end, o);
  const avgVol = sma(c.volume, 50);
  const av = avgVol[end] || mean(c.volume.slice(Math.max(0, end - 49), end + 1));

  const contractions = raw.map((k, i) => {
    const stop = i + 1 < raw.length ? raw[i + 1].h - 1 : end;
    const vols = c.volume.slice(k.h, stop + 1);
    return {
      highDate: c.date[k.h],
      high: c.high[k.h],
      lowDate: c.date[k.l],
      low: c.low[k.l],
      depthPct: round(k.depth),
      bars: stop - k.h + 1,
      volRatio: round(mean(vols) / av, 2),
      hIdx: k.h,
      lIdx: k.l,
    };
  });

  const baseHigh = Math.max(...contractions.map((k) => k.high), c.high[h0]);
  const baseLowIdx = argmin(c.low, h0, end);
  const baseLow = c.low[baseLowIdx];
  const depth = ((baseHigh - baseLow) / baseHigh) * 100;
  const lastK = contractions[contractions.length - 1];
  const pivot = lastK ? lastK.high : baseHigh;
  const pivotIdx = lastK ? lastK.hIdx : h0;
  const lastLow = lastK ? lastK.low : baseLow;
  const stop = lastLow * 0.995;
  const close = c.close[end];

  // Volume behaviour
  const lastVolRatio = lastK ? lastK.volRatio : 1;
  const last10 = c.volume.slice(end - 9, end + 1);
  const dryUpDays = last10.filter((v) => v < av * 0.6).length;
  let upVol = 0,
    downVol = 0;
  for (let i = h0 + 1; i <= end; i++) {
    if (c.close[i] >= c.close[i - 1]) upVol += c.volume[i];
    else downVol += c.volume[i];
  }
  const upDownVol = downVol ? upVol / downVol : 2;

  // Tightness of the last ~7 closes
  const recent = c.close.slice(end - 6, end + 1);
  const tightness = ((Math.max(...recent) - Math.min(...recent)) / Math.min(...recent)) * 100;

  // Shape checks
  let violations = 0;
  for (let i = 1; i < contractions.length; i++) {
    if (contractions[i].depthPct > contractions[i - 1].depthPct * o.shrinkTolerance) violations++;
  }
  const higherLows = contractions.length > 1 && lastLow > contractions[0].low;

  Object.assign(res, {
    baseStartDate: c.date[h0],
    baseStartIdx: h0,
    baseBars,
    baseHigh: round(baseHigh),
    baseLow: round(baseLow),
    depthPct: round(depth),
    priorAdvancePct: round(priorAdvance),
    contractions,
    count: contractions.length,
    pivot: round(pivot),
    pivotDate: c.date[pivotIdx],
    pivotIdx,
    lastLow: round(lastLow),
    stop: round(stop),
    stopPct: round(((pivot - stop) / pivot) * 100),
    finalDepthPct: lastK ? lastK.depthPct : null,
    lastVolRatio,
    dryUpDays,
    upDownVol: round(upDownVol, 2),
    tightnessPct: round(tightness),
    shrinkViolations: violations,
    higherLows,
    avgVol50: Math.round(av),
    distToPivotPct: round(pct(close, pivot)),
  });

  // Validation
  if (contractions.length < o.minContractions) res.reasons.push(`Only ${contractions.length} contraction — needs ${o.minContractions}+`);
  if (contractions.length > o.maxContractions) res.reasons.push(`${contractions.length} contractions — too choppy`);
  if (depth > o.maxBaseDepth) res.reasons.push(`Base too deep (${round(depth)}% > ${o.maxBaseDepth}%)`);
  if (lastK && lastK.depthPct > o.maxFinalDepth) res.reasons.push(`Last contraction not tight yet (${lastK.depthPct}%)`);
  if (violations > 0) res.reasons.push('Contractions are not getting smaller');
  if (contractions.length > 1 && !higherLows) res.reasons.push('Lows are not rising');
  if (priorAdvance < o.minPriorAdvance) res.reasons.push(`Weak prior uptrend (+${round(priorAdvance)}%)`);
  if (close < lastLow) res.reasons.push('Price has broken below the last contraction low');
  res.valid = res.reasons.length === 0;

  if (res.valid) {
    res.positives.push(`${contractions.length} contractions: ${contractions.map((k) => k.depthPct.toFixed(0) + '%').join(' → ')}`);
    if (lastVolRatio < 0.7) res.positives.push(`Volume dried up to ${Math.round(lastVolRatio * 100)}% of average in the last contraction`);
    if (tightness < 5) res.positives.push(`Very tight closes (${round(tightness)}% range over 7 days)`);
  }

  const d = res.distToPivotPct;
  if (!res.valid) res.stage = 'none';
  else if (d > o.buyZonePct) res.stage = 'extended';
  else if (d > 0) res.stage = 'breakout';
  else if (d >= -o.nearPivotPct) res.stage = 'near';
  else res.stage = 'forming';
  return res;
}

// ---------------------------------------------------------------------------------------------

export const TT_LABELS = {
  aboveLongMAs: 'Price above 150 & 200-day average',
  ma150over200: '150-day average above 200-day',
  ma200rising: '200-day average rising for 1 month+',
  ma50overLong: '50-day above 150 & 200-day',
  above50: 'Price above 50-day average',
  above52wLow: 'At least 30% above 52-week low',
  near52wHigh: 'Within 25% of 52-week high',
  rsStrong: 'Relative Strength rating 70+',
};

/** Minervini's 8-point Trend Template. */
export function trendTemplate(c, end, rsRating, m) {
  const close = c.close[end];
  const s50 = m.sma50[end],
    s150 = m.sma150[end],
    s200 = m.sma200[end];
  const s200ago = m.sma200[end - 22];
  const from = Math.max(0, end - 251);
  const hi52 = Math.max(...c.high.slice(from, end + 1));
  const lo52 = Math.min(...c.low.slice(from, end + 1));
  const crit = {
    aboveLongMAs: s150 != null && s200 != null && close > s150 && close > s200,
    ma150over200: s150 != null && s200 != null && s150 > s200,
    ma200rising: s200 != null && s200ago != null && s200 > s200ago,
    ma50overLong: s50 != null && s150 != null && s200 != null && s50 > s150 && s50 > s200,
    above50: s50 != null && close > s50,
    above52wLow: close >= lo52 * 1.3,
    near52wHigh: close >= hi52 * 0.75,
    rsStrong: rsRating >= 70,
  };
  const passCount = Object.values(crit).filter(Boolean).length;
  return {
    criteria: Object.entries(crit).map(([key, pass]) => ({ key, label: TT_LABELS[key], pass })),
    passCount,
    pass: passCount === 8,
    hi52: round(hi52),
    lo52: round(lo52),
    fromHighPct: round(pct(close, hi52)),
    fromLowPct: round(pct(close, lo52)),
    above200Pct: s200 ? round(pct(close, s200)) : null,
    ma200SlopePct: s200 && s200ago ? round(pct(s200, s200ago)) : null,
  };
}

/** IBD-style weighted 12-month performance; rank it across the universe to get an RS rating. */
export function rsRawScore(closes, end = closes.length - 1) {
  const r = (n) => {
    const i = Math.max(0, end - n);
    return closes[i] > 0 ? closes[end] / closes[i] - 1 : 0;
  };
  return 0.4 * r(63) + 0.2 * r(126) + 0.2 * r(189) + 0.2 * r(252);
}

/** Turn raw scores into 1–99 percentile ratings. */
export function rankPercentiles(entries) {
  const sorted = [...entries].sort((a, b) => a.score - b.score);
  const n = sorted.length;
  const out = new Map();
  sorted.forEach((e, i) => out.set(e.key, n <= 1 ? 50 : Math.max(1, Math.min(99, Math.round((i / (n - 1)) * 98 + 1)))));
  return out;
}

/** Moving averages used throughout. */
export function movingAverages(c) {
  return {
    sma50: sma(c.close, 50),
    sma150: sma(c.close, 150),
    sma200: sma(c.close, 200),
    ema10: ema(c.close, 10),
    ema21: ema(c.close, 21),
    vol50: sma(c.volume, 50),
  };
}

/** RS line (stock ÷ index). Returns whether it is at a 52-week high. */
export function rsLine(c, end, indexByDate) {
  if (!indexByDate) return { newHigh: false, values: [] };
  const from = Math.max(0, end - 251);
  const vals = [];
  for (let i = from; i <= end; i++) {
    const ix = indexByDate.get(c.date[i]);
    if (ix) vals.push(c.close[i] / ix);
  }
  if (vals.length < 50) return { newHigh: false, values: vals };
  const lastV = vals[vals.length - 1];
  return { newHigh: lastV >= Math.max(...vals) * 0.99, values: vals };
}

export function round(x, d = 2) {
  return Number.isFinite(x) ? Number(x.toFixed(d)) : x;
}
