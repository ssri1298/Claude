// DEMO market feed: replays a synthetic market minute by minute on a simulated clock.

import { EventEmitter } from 'node:events';
import { generateMarket, intradayPath, rng } from './synth.js';
import { volumeFraction } from '../engine/market.js';
import { ist, MARKET } from '../core/time.js';

export const DEMO_INDEX_TOKEN = 256265;

export class DemoFeed extends EventEmitter {
  constructor({ quotes, clock, seed = 11, historyDays = 540 }) {
    super();
    this.kind = 'demo';
    this.quotes = quotes;
    this.clock = clock;
    this.market = generateMarket({ seed, stocks: 140, days: 900, endDate: '2029-12-31', vcpRate: 0.03, successRate: 0.55 });
    this.startDate = this.market.dates[historyDays];
    this.r = rng(seed + 1);
    this.dayPaths = null;
    this.pathDate = null;
    this.byToken = new Map(this.market.stocks.map((s) => [s.token, s]));
  }

  /** First simulated trading day (the clock starts here). */
  firstDay() {
    return this.startDate;
  }

  async universe() {
    return this.market.stocks.map(({ symbol, name, industry, token, tick }) => ({ symbol, name, industry, token, tick }));
  }

  /** Only completed days are visible: bars strictly before today (or today after the close). */
  visibleUntil() {
    const t = ist(this.clock.now());
    return t.minutes >= MARKET.close ? t.date : prevDate(this.market.dates, t.date);
  }

  async history(token, from, to) {
    const s = this.byToken.get(token);
    const until = this.visibleUntil();
    return s.candles.filter((c) => c.date >= from && c.date <= to && c.date <= until);
  }

  /** Deterministic 15-minute candles for the simulated market (same day → same candles every time). */
  async history15(token, from, to) {
    const s = this.byToken.get(token);
    const until = this.visibleUntil();
    const out = [];
    this.market.dates.forEach((date, di) => {
      if (date < from || date > to || date > until) return;
      out.push(...bars15FromDaily(s.candles[di], rng(token * 7919 + di)));
    });
    return out;
  }

  async indexHistory(from, to) {
    const until = this.visibleUntil();
    return this.market.index.filter((c) => c.date >= from && c.date <= to && c.date <= until);
  }

  start() {
    /* quotes are produced by onClock() */
  }
  stop() {}
  status() {
    return { connected: true, lastTick: this.clock.now().getTime(), demo: true };
  }

  /** Called by the demo driver after every clock step. Updates quotes for the current minute. */
  onClock() {
    const t = ist(this.clock.now());
    const di = this.market.dates.indexOf(t.date);
    if (di < 0) return;
    if (t.minutes < MARKET.open) return;
    if (this.pathDate !== t.date) this.buildPaths(t.date, di);
    const m = Math.min(375, t.minutes - MARKET.open);
    const ticks = [];
    for (const s of this.market.stocks) {
      const p = this.dayPaths.get(s.token);
      const c = s.candles[di];
      const prev = s.candles[di - 1];
      const ltp = p.prices[m];
      const hi = p.hi[m];
      const lo = p.lo[m];
      const q = { token: s.token, ltp, volume: p.cumVol[m], open: c.open, high: hi, low: lo, prevClose: prev.close, ts: this.clock.now().getTime() };
      this.quotes.set(s.token, q);
      ticks.push(q);
    }
    const ic = this.market.index[di];
    const ip = this.indexPath;
    this.quotes.set(DEMO_INDEX_TOKEN, { token: DEMO_INDEX_TOKEN, ltp: ip[m], open: ic.open, high: ic.high, low: ic.low, prevClose: this.market.index[di - 1].close, isIndex: true });
    this.emit('ticks', ticks);
  }

  buildPaths(date, di) {
    this.pathDate = date;
    this.dayPaths = new Map();
    for (const s of this.market.stocks) {
      const p = intradayPath(this.r, s.candles[di], (m) => volumeFraction(m));
      p.hi = [];
      p.lo = [];
      p.prices.forEach((x, i) => {
        p.hi.push(i ? Math.max(p.hi[i - 1], x) : x);
        p.lo.push(i ? Math.min(p.lo[i - 1], x) : x);
      });
      this.dayPaths.set(s.token, p);
    }
    this.indexPath = intradayPath(this.r, { ...this.market.index[di], volume: 0 }, () => 0).prices;
  }

  /** The demo's trading calendar. */
  isTradingDate(date) {
    return this.market.dates.includes(date);
  }
  nextTradingDate(date) {
    return this.market.dates.find((d) => d > date);
  }
}

function prevDate(dates, date) {
  let lo = null;
  for (const d of dates) {
    if (d < date) lo = d;
    else break;
  }
  return lo;
}

/** Split one daily candle into 25 fifteen-minute candles that match its open/high/low/close/volume. */
export function bars15FromDaily(candle, r) {
  const p = intradayPath(r, candle, (m) => volumeFraction(m));
  const bars = [];
  for (let b = 0; b < 25; b++) {
    const seg = p.prices.slice(b * 15, b * 15 + 16);
    const mins = 555 + b * 15;
    bars.push({
      date: candle.date,
      time: `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`,
      open: seg[0],
      high: Math.max(...seg),
      low: Math.min(...seg),
      close: seg[seg.length - 1],
      volume: Math.max(0, p.cumVol[Math.min(375, (b + 1) * 15)] - p.cumVol[b * 15]),
    });
  }
  // make the candles reproduce the day's exact high and low
  const hi = bars.reduce((a, b) => (b.high > a.high ? b : a));
  const lo = bars.reduce((a, b) => (b.low < a.low ? b : a));
  hi.high = candle.high;
  lo.low = candle.low;
  return bars;
}
