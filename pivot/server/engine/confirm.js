// Breakout confirmation checks — used to avoid false alarms ("poke above the pivot and fail").
// Each check returns true (passed), false (failed) or null (not applicable / switched off).

export const DEFAULT_CONFIRM = {
  enabled: true,
  holdCandle: true, // a 15-minute candle must CLOSE above the pivot (after it was first crossed)
  candleMinutes: 15,
  vwap: true, // price above today's VWAP
  rangePos: true, // price in the top third of today's high–low range
  rangeTopFrac: 0.67,
  gapRule: true, // gapped above the pivot at the open → wait for the 30-minute high to break
  openingMinutes: 30,
  pivotBufferPct: 0.3, // must clear the pivot by this much
};

export const CHECK_LABELS = {
  buffer: 'Cleared the pivot by 0.3%+',
  holdCandle: '15-min candle closed above pivot',
  vwap: 'Above VWAP',
  rangePos: 'Top third of the day’s range',
  gap: 'Gap-up broke the 30-min high',
  volume: 'Volume pace 1.5×+',
};

/**
 * @param p { ltp, pivot, dayOpen, dayHigh, dayLow, vwap, orHigh, lastBar:{c,bucket}, armedBucket, minutes, volPace }
 * @param c confirm settings, minVolPace
 */
export function evaluateChecks(p, c = DEFAULT_CONFIRM, minVolPace = 1.5) {
  const thr = p.pivot * (1 + (c.pivotBufferPct || 0) / 100);
  const out = {};
  out.buffer = p.ltp >= thr;
  out.volume = p.volPace != null && p.volPace >= minVolPace;
  out.holdCandle = c.holdCandle ? !!(p.lastBar && p.armedBucket != null && p.lastBar.bucket >= p.armedBucket && p.lastBar.c >= thr) : null;
  out.vwap = c.vwap ? (p.vwap ? p.ltp > p.vwap : null) : null;
  if (c.rangePos) {
    const range = (p.dayHigh ?? p.ltp) - (p.dayLow ?? p.ltp);
    out.rangePos = range <= 0 ? true : p.ltp >= p.dayLow + c.rangeTopFrac * range;
  } else out.rangePos = null;
  if (c.gapRule && p.dayOpen != null && p.dayOpen > p.pivot) {
    out.gap = p.minutes >= (c.openingMinutes || 30) && p.orHigh != null ? p.ltp > p.orHigh : false;
  } else out.gap = null;
  const confirmed = Object.values(out).every((v) => v !== false);
  return { checks: out, confirmed };
}

export function describeChecks(checks) {
  return Object.entries(checks)
    .filter(([, v]) => v !== null)
    .map(([k, v]) => `${v ? '✓' : '✗'} ${CHECK_LABELS[k] || k}`);
}
