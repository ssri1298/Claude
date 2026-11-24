// Builds today's intraday picture for every stock from live ticks:
// 15-minute candles, VWAP and the opening-range high (first 30 minutes).

import { ist, MARKET } from './time.js';

export class IntradayTracker {
  constructor(clock, { candleMinutes = 15, openingMinutes = 30 } = {}) {
    this.clock = clock;
    this.candleMinutes = candleMinutes;
    this.openingMinutes = openingMinutes;
    this.date = null;
    this.data = new Map(); // token → state
  }

  minuteNow() {
    const t = ist(this.clock.now());
    if (t.date !== this.date) {
      this.date = t.date;
      this.data.clear();
    }
    return t.minutes - MARKET.open;
  }

  bucketOf(m) {
    return Math.floor(m / this.candleMinutes);
  }

  onTicks(ticks) {
    const m = this.minuteNow();
    if (m < 0 || m >= 375) return;
    const b = this.bucketOf(m);
    for (const t of ticks) {
      if (!t.ltp) continue;
      let s = this.data.get(t.token);
      if (!s) {
        s = { bars: new Map(), pv: 0, vol: 0, lastVol: null, vwap: null, orHigh: null, open: t.open ?? t.ltp };
        this.data.set(t.token, s);
      }
      const bar = s.bars.get(b);
      if (!bar) s.bars.set(b, { o: t.ltp, h: t.ltp, l: t.ltp, c: t.ltp });
      else {
        bar.h = Math.max(bar.h, t.ltp);
        bar.l = Math.min(bar.l, t.ltp);
        bar.c = t.ltp;
      }
      if (m < this.openingMinutes) s.orHigh = Math.max(s.orHigh ?? -Infinity, t.high ?? t.ltp, t.ltp);
      if (t.open) s.open = t.open;
      // VWAP: Kite sends the day's average traded price; otherwise build it from volume changes
      if (t.avgPrice) s.vwap = t.avgPrice;
      else if (t.volume != null) {
        const dv = s.lastVol == null ? t.volume : Math.max(0, t.volume - s.lastVol);
        s.lastVol = t.volume;
        if (dv > 0) {
          s.pv += dv * t.ltp;
          s.vol += dv;
          s.vwap = s.pv / s.vol;
        }
      }
    }
  }

  get(token) {
    return this.data.get(token);
  }

  /** The last fully completed candle (and its bucket number). */
  lastClosedBar(token) {
    const s = this.data.get(token);
    if (!s) return null;
    const cur = this.bucketOf(this.minuteNow());
    for (let b = cur - 1; b >= 0; b--) {
      const bar = s.bars.get(b);
      if (bar) return { ...bar, bucket: b };
    }
    return null;
  }
}
