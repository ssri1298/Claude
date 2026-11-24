// Basic technical indicators. All functions take plain number arrays (oldest → newest)
// and return arrays of the same length, with `null` where there is not enough data.

export function sma(values, n) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

export function ema(values, n) {
  const out = new Array(values.length).fill(null);
  if (values.length < n) return out;
  const k = 2 / (n + 1);
  let prev = 0;
  for (let i = 0; i < n; i++) prev += values[i];
  prev /= n;
  out[n - 1] = prev;
  for (let i = n; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Next EMA value given the previous EMA and a new price (used for live "if it closed now"). */
export function emaNext(prevEma, price, n) {
  const k = 2 / (n + 1);
  return price * k + prevEma * (1 - k);
}

export function atr(highs, lows, closes, n = 14) {
  const tr = highs.map((h, i) =>
    i === 0 ? h - lows[i] : Math.max(h - lows[i], Math.abs(h - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])),
  );
  return sma(tr, n);
}

export function rollingMax(values, n) {
  const out = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    let m = -Infinity;
    for (let j = Math.max(0, i - n + 1); j <= i; j++) if (values[j] > m) m = values[j];
    out[i] = m;
  }
  return out;
}

export function rollingMin(values, n) {
  const out = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    let m = Infinity;
    for (let j = Math.max(0, i - n + 1); j <= i; j++) if (values[j] < m) m = values[j];
    out[i] = m;
  }
  return out;
}

export function roc(values, n) {
  return values.map((v, i) => (i >= n && values[i - n] > 0 ? v / values[i - n] - 1 : null));
}

export function last(arr, back = 0) {
  return arr[arr.length - 1 - back];
}

export function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

export const pct = (a, b) => (b ? (a / b - 1) * 100 : 0);

/** Round a price to the exchange tick size (NSE equity: ₹0.05; Kite gives per-instrument tick). */
export function roundTick(price, tick = 0.05, mode = 'nearest') {
  const x = price / tick;
  const n = mode === 'up' ? Math.ceil(x - 1e-9) : mode === 'down' ? Math.floor(x + 1e-9) : Math.round(x);
  return Number((n * tick).toFixed(2));
}

/** Split candle objects into column arrays. */
export function columns(candles) {
  return {
    date: candles.map((c) => c.date),
    open: candles.map((c) => c.open),
    high: candles.map((c) => c.high),
    low: candles.map((c) => c.low),
    close: candles.map((c) => c.close),
    volume: candles.map((c) => c.volume),
  };
}
