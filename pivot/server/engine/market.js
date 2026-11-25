// Market regime (Nifty 50 trend + Nifty 500 breadth) and intraday volume pace.

import { sma } from './indicators.js';
import { round } from './vcp.js';

/**
 * Regime:
 *  - 'uptrend'   : Nifty above a rising 50-DMA and above the 200-DMA, breadth healthy
 *  - 'pressure'  : mixed signals — trade only the best setups
 *  - 'downtrend' : Nifty below 50 & 200-DMA, or breadth collapsed — no new buys
 */
export function marketRegime(indexCandles, breadth = {}, aggVol = null) {
  if (!indexCandles || indexCandles.length < 210) {
    return { regime: 'unknown', label: 'Unknown', notes: ['Not enough index history'], breadth };
  }
  const closes = indexCandles.map((c) => c.close);
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  const e = closes.length - 1;
  const close = closes[e];
  const above50 = close > s50[e];
  const above200 = close > s200[e];
  const rising50 = s50[e] > s50[e - 10];
  const notes = [];
  // Distribution days (institutional selling): the Nifty falls ≥0.2% on higher total volume than the day
  // before, counted over the last 25 sessions. Nifty index volume isn't published, so the combined volume
  // of the Nifty 500 stocks is used. Without that, fall back to sharp (≥1%) down days.
  let downDays = 0;
  let distDays = null;
  const dates = indexCandles.map((c) => c.date);
  if (aggVol && aggVol.get(dates[e]) && aggVol.get(dates[e - 1])) {
    distDays = 0;
    for (let i = e - 24; i <= e; i++) {
      const v = aggVol.get(dates[i]);
      const pv = aggVol.get(dates[i - 1]);
      if (v && pv && closes[i] / closes[i - 1] - 1 <= -0.002 && v > pv) distDays++;
    }
  }
  for (let i = e - 24; i <= e; i++) if (closes[i] / closes[i - 1] - 1 <= -0.01) downDays++;
  const pressureDays = distDays ?? downDays;

  const pct50 = breadth.above50Pct;
  let score = 0;
  score += above50 ? 2 : -2;
  score += above200 ? 1 : -2;
  score += rising50 ? 1 : -1;
  if (pct50 != null) score += pct50 >= 60 ? 2 : pct50 >= 45 ? 0 : pct50 >= 30 ? -1 : -3;
  if (pressureDays >= 6) score -= 2;
  else if (pressureDays >= 4) score -= 1;

  notes.push(`Nifty ${above50 ? 'above' : 'below'} 50-DMA (${round(((close / s50[e]) - 1) * 100, 1)}%)`);
  notes.push(`Nifty ${above200 ? 'above' : 'below'} 200-DMA`);
  notes.push(`50-DMA ${rising50 ? 'rising' : 'falling'}`);
  if (pct50 != null) notes.push(`${Math.round(pct50)}% of Nifty 500 above their 50-DMA`);
  notes.push(distDays != null ? `${distDays} distribution days (falls on heavier volume) in 25 sessions${distDays >= 5 ? ' — institutions are selling' : ''}` : `${downDays} sharp down days (≥1%) in 25 sessions`);

  let regime;
  if ((!above50 && !above200) || score <= -3) regime = 'downtrend';
  else if (score >= 3 && above50) regime = 'uptrend';
  else regime = 'pressure';
  const label = { uptrend: 'Confirmed uptrend', pressure: 'Uptrend under pressure', downtrend: 'Correction' }[regime];
  return { regime, label, score, notes, close: round(close), sma50: round(s50[e]), sma200: round(s200[e]), downDays, distDays, breadth };
}

// Cumulative share of a full day's volume traded by N minutes after 09:15 (NSE U-shaped curve).
const CURVE = [
  [0, 0],
  [5, 0.06],
  [15, 0.12],
  [30, 0.18],
  [60, 0.27],
  [120, 0.42],
  [180, 0.54],
  [240, 0.66],
  [300, 0.78],
  [345, 0.88],
  [375, 1],
];

export function volumeFraction(minutesSinceOpen) {
  const m = Math.max(0, Math.min(375, minutesSinceOpen));
  for (let i = 1; i < CURVE.length; i++) {
    const [m1, f1] = CURVE[i];
    const [m0, f0] = CURVE[i - 1];
    if (m <= m1) return f0 + ((m - m0) / (m1 - m0)) * (f1 - f0);
  }
  return 1;
}

/** Projected full-day volume as a multiple of the 50-day average. */
export function volumePace(cumVolume, minutesSinceOpen, avgVol50) {
  if (!avgVol50 || minutesSinceOpen <= 0) return null;
  const f = Math.max(volumeFraction(minutesSinceOpen), 0.06);
  return cumVolume / f / avgVol50;
}
