// Synthetic market generator for DEMO mode and tests.
// Produces a fictional universe of stocks with realistic trends, planted VCP bases
// (some succeed, some fail) and a matching index. Nothing here is real market data.

import { addDays, isWeekend } from '../core/time.js';

export function rng(seed = 42) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.normal = () => {
    let u = 0,
      v = 0;
    while (u === 0) u = next();
    while (v === 0) v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  next.range = (a, b) => a + next() * (b - a);
  next.int = (a, b) => Math.floor(a + next() * (b - a + 1));
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  return next;
}

const PREFIX = ['AURA', 'BLUE', 'CEDAR', 'DELTA', 'EMBER', 'FERN', 'GLINT', 'HALO', 'IRIS', 'JADE', 'KITE', 'LUMEN', 'MAPLE', 'NOVA', 'ORBIT', 'PEARL', 'QUILL', 'RIVER', 'SOLAR', 'TEAK', 'UMBRA', 'VEDA', 'WREN', 'XENO', 'YARA', 'ZEN'];
const SUFFIX = ['TECH', 'PHARM', 'FIN', 'AUTO', 'CHEM', 'INFRA', 'POWER', 'FOODS', 'STEEL', 'CEM', 'LABS', 'RETAIL'];
const IND = {
  TECH: 'Information Technology',
  PHARM: 'Healthcare',
  FIN: 'Financial Services',
  AUTO: 'Automobile',
  CHEM: 'Chemicals',
  INFRA: 'Construction',
  POWER: 'Power',
  FOODS: 'FMCG',
  STEEL: 'Metals & Mining',
  CEM: 'Construction Materials',
  LABS: 'Healthcare',
  RETAIL: 'Consumer Services',
};

/** Trading dates (weekdays) ending at `endDate` inclusive, `n` of them. */
export function tradingDates(endDate, n) {
  const out = [];
  let d = endDate;
  while (out.length < n) {
    if (!isWeekend(d)) out.unshift(d);
    d = addDays(d, -1);
  }
  return out;
}

/** Brownian-bridge path from a to b over L steps (returns L values, ending at b). */
function bridge(r, a, b, L, sigma) {
  const w = [0];
  for (let i = 1; i <= L; i++) w.push(w[i - 1] + r.normal() * sigma);
  const out = [];
  for (let i = 1; i <= L; i++) {
    const t = i / L;
    out.push(a + (b - a) * t + (w[i] - t * w[L]) * a);
  }
  return out;
}

/**
 * Build one stock's close/volume path of length n using segments.
 * Returns { closes, volFactor, events: [{type:'vcp', start, pivotIdx, breakoutIdx, outcome}] }
 */
function buildPath(r, n, indexRet, beta, opts) {
  const closes = [];
  const volF = [];
  const events = [];
  let p = r.range(80, 2500);
  const push = (arr, vf) => {
    for (let i = 0; i < arr.length && closes.length < n; i++) {
      closes.push(Math.max(1, arr[i]));
      volF.push(typeof vf === 'function' ? vf(i, arr.length) : vf);
    }
    p = closes[closes.length - 1];
  };
  const sigma = r.range(0.012, 0.022);
  while (closes.length < n) {
    const roll = r();
    if (roll < opts.vcpRate && closes.length > 40) {
      // --- Prior advance
      const advL = r.int(35, 70);
      push(bridge(r, p, p * r.range(1.3, 1.7), advL, sigma * 0.8), () => r.range(1.0, 1.5));
      // --- VCP base
      const start = closes.length;
      const H = p * r.range(1.0, 1.03);
      push(bridge(r, p, H, r.int(2, 4), sigma * 0.5), 1.2);
      const k = r.int(2, 4);
      let depth = r.range(0.14, 0.3);
      let pivotIdx = closes.length - 1;
      for (let j = 0; j < k; j++) {
        const last = j === k - 1;
        const low = H * (1 - depth) * r.range(1.0, 1.01);
        const downL = Math.max(3, Math.round(depth * 100 * r.range(0.5, 0.8)));
        const vfDown = r.range(0.9, 1.1) * (1 - j * 0.18);
        push(bridge(r, p, low, downL, sigma * 0.35), vfDown);
        const upTo = last ? H * r.range(0.975, 0.99) : H * r.range(0.96, 0.995);
        const upL = Math.max(3, Math.round(downL * r.range(0.8, 1.3)));
        pivotIdx = closes.length + upL - 1;
        push(bridge(r, p, upTo, upL, sigma * 0.3), vfDown * 0.85);
        if (last) {
          // tight area just under the pivot on very low volume
          const tightL = r.int(3, 7);
          push(bridge(r, p, p * r.range(0.99, 1.005), tightL, sigma * 0.12), r.range(0.35, 0.5));
        }
        depth *= r.range(0.42, 0.62);
      }
      // --- Outcome
      const breakoutIdx = closes.length;
      const success = r() < opts.successRate;
      events.push({ type: 'vcp', start, pivotIdx, breakoutIdx, outcome: success ? 'success' : 'failure' });
      if (success) {
        push([H * r.range(1.025, 1.045)], r.range(2.0, 3.5));
        push(bridge(r, p, p * r.range(1.15, 1.6), r.int(25, 60), sigma * 0.8), () => r.range(1.0, 1.6));
      } else {
        push([H * r.range(1.01, 1.03)], r.range(1.5, 2.4));
        push(bridge(r, p, H * r.range(0.86, 0.92), r.int(4, 9), sigma * 0.5), 1.4);
      }
    } else {
      const L = r.int(20, 60);
      const drift = r.range(-0.002, 0.0025);
      const seg = [];
      let q = p;
      for (let i = 0; i < L; i++) {
        const idx = closes.length + i;
        q *= 1 + drift + beta * (indexRet[idx] || 0) + r.normal() * sigma;
        seg.push(q);
      }
      push(seg, () => r.range(0.7, 1.3));
    }
  }
  return { closes, volF, events, sigma };
}

/** Daily OHLC around a close path. */
function toCandles(r, dates, closes, volF, baseVol, sigma) {
  const out = [];
  for (let i = 0; i < closes.length; i++) {
    const c = closes[i];
    const prev = i ? closes[i - 1] : c;
    const o = prev * (1 + r.normal() * sigma * 0.3);
    const span = Math.abs(r.normal()) * sigma * 0.6 + sigma * 0.25;
    const h = Math.max(o, c) * (1 + span * r.range(0.2, 1));
    const l = Math.min(o, c) * (1 - span * r.range(0.2, 1));
    out.push({
      date: dates[i],
      open: r2(o),
      high: r2(h),
      low: r2(l),
      close: r2(c),
      volume: Math.max(1000, Math.round(baseVol * volF[i] * r.range(0.75, 1.25))),
    });
  }
  return out;
}

const r2 = (x) => Math.round(x * 20) / 20; // ₹0.05 ticks

/**
 * Generate a full synthetic market.
 * @param {object} o  { seed, stocks, days, endDate }
 */
export function generateMarket(o = {}) {
  const { seed = 7, stocks = 120, days = 700, endDate = '2027-06-30', vcpRate = 0.025, successRate = 0.55 } = o;
  const r = rng(seed);
  const dates = tradingDates(endDate, days);
  // Index: gentle uptrend with a correction in the middle
  const indexRet = [];
  const idxCloses = [];
  let ix = 22000;
  for (let i = 0; i < days; i++) {
    const phase = i / days;
    const drift = phase > 0.42 && phase < 0.52 ? -0.0018 : 0.0007;
    const ret = drift + r.normal() * 0.008;
    indexRet.push(ret);
    ix *= 1 + ret;
    idxCloses.push(ix);
  }
  const index = toCandles(r, dates, idxCloses, idxCloses.map(() => 1), 0, 0.006).map((c) => ({ ...c, volume: 0 }));

  const used = new Set();
  const list = [];
  for (let s = 0; s < stocks; s++) {
    let sym;
    do sym = r.pick(PREFIX) + r.pick(SUFFIX);
    while (used.has(sym));
    used.add(sym);
    const suffix = SUFFIX.find((x) => sym.endsWith(x));
    const beta = r.range(0.6, 1.4);
    const path = buildPath(r, days, indexRet, beta, { vcpRate, successRate });
    const baseVol = Math.round(r.range(2e5, 4e6));
    const candles = toCandles(r, dates, path.closes, path.volF, baseVol, path.sigma);
    list.push({
      symbol: sym,
      name: sym.charAt(0) + sym.slice(1).toLowerCase().replace(suffix.toLowerCase(), '') + ' ' + IND[suffix].split(' ')[0] + ' Ltd (demo)',
      industry: IND[suffix],
      token: 900000 + s,
      tick: 0.05,
      candles,
      events: path.events.map((e) => ({ ...e, date: dates[e.breakoutIdx] })),
      sigma: path.sigma,
    });
  }
  return { dates, index, stocks: list };
}

/**
 * Minute-by-minute path for one day's candle (375 minutes, 09:15–15:29).
 * Returns arrays of prices and cumulative volume such that open/high/low/close match the candle.
 */
export function intradayPath(r, candle, fractionFn) {
  const N = 375;
  const { open, high, low, close, volume } = candle;
  const w = [0];
  for (let i = 1; i <= N; i++) w.push(w[i - 1] + r.normal());
  const base = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    base.push(w[i] - t * w[N]); // bridge 0 → 0
  }
  // place the extremes: stretch positive excursions to hit high, negative to hit low
  const maxB = Math.max(...base) || 1;
  const minB = Math.min(...base) || -1;
  const prices = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const lin = open + (close - open) * t;
    const b = base[i];
    const up = high - Math.max(open, close);
    const dn = Math.min(open, close) - low;
    let p = lin + (b > 0 ? (b / maxB) * up : (b / -minB) * dn);
    p = Math.min(high, Math.max(low, p));
    prices.push(r2(p));
  }
  prices[0] = open;
  prices[N] = close;
  const cumVol = [];
  for (let i = 0; i <= N; i++) cumVol.push(Math.round(volume * fractionFn(i)));
  return { prices, cumVol };
}
