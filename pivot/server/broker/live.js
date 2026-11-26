// Real order execution through Kite with fill tracking. Used only in LIVE mode.

import { roundTick } from '../engine/indicators.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class LiveBroker {
  constructor(kite, log) {
    this.kite = kite;
    this.log = log;
  }

  /** Cash at Zerodha. `maxAgeMs` lets screens reuse a recent answer; buying decisions always ask afresh. */
  async funds({ maxAgeMs = 0 } = {}) {
    if (maxAgeMs && this._funds && Date.now() - this._funds.at < maxAgeMs) return this._funds.value;
    const m = await this.kite.margins();
    const value = { cash: Number(m?.available?.live_balance ?? m?.net ?? 0), net: Number(m?.net ?? 0) };
    this._funds = { at: Date.now(), value };
    return value;
  }

  /** Marketable LIMIT order; waits for the fill and re-prices if needed. */
  async execute({ symbol, side, qty, price, tick = 0.05, getLtp, maxWaitSec = side === 'BUY' ? 90 : 120, tag = 'pivot', limitCap }) {
    this._funds = null;
    const placed = await this.kite.placeOrder({
      tradingsymbol: symbol,
      transaction_type: side,
      quantity: qty,
      order_type: 'LIMIT',
      price: roundTick(price, tick),
      tag,
    });
    const id = placed.order_id;
    const start = Date.now();
    let lastModify = Date.now();
    let filled = 0,
      avg = 0,
      status = 'OPEN',
      message = '';
    while (Date.now() - start < maxWaitSec * 1000) {
      await sleep(2000);
      const hist = await this.kite.orderHistory(id).catch(() => null);
      const last = hist?.[hist.length - 1];
      if (!last) continue;
      status = last.status;
      filled = Number(last.filled_quantity || 0);
      avg = Number(last.average_price || 0);
      message = last.status_message || '';
      if (['COMPLETE', 'REJECTED', 'CANCELLED'].includes(status)) break;
      // re-price every 20 s to stay marketable
      if (Date.now() - lastModify > 20000 && getLtp) {
        const ltp = getLtp();
        if (ltp) {
          let np = side === 'BUY' ? ltp * 1.003 : ltp * 0.99;
          if (side === 'BUY' && limitCap) np = Math.min(np, limitCap);
          await this.kite.modifyOrder(id, { price: roundTick(np, tick), order_type: 'LIMIT', quantity: qty - filled }).catch(() => {});
          lastModify = Date.now();
        }
      }
    }
    if (!['COMPLETE', 'REJECTED', 'CANCELLED'].includes(status)) {
      await this.kite.cancelOrder(id).catch(() => {});
      const hist = await this.kite.orderHistory(id).catch(() => null);
      const last = hist?.[hist.length - 1];
      if (last) {
        filled = Number(last.filled_quantity || 0);
        avg = Number(last.average_price || 0);
      }
      status = filled ? 'PARTIAL' : 'CANCELLED';
    }
    return { orderId: id, status, filledQty: filled, avgPrice: avg, message };
  }

  async placeStopGtt({ symbol, qty, stop, ltp, tick }) {
    const r = await this.kite.placeGttStop({ symbol, qty, trigger: roundTick(stop, tick), limitPrice: roundTick(stop * 0.985, tick, 'down'), lastPrice: ltp });
    return String(r.trigger_id);
  }

  async modifyStopGtt(id, { symbol, qty, stop, ltp, tick }) {
    await this.kite.modifyGttStop(id, { symbol, qty, trigger: roundTick(stop, tick), limitPrice: roundTick(stop * 0.985, tick, 'down'), lastPrice: ltp });
  }

  async deleteGtt(id) {
    await this.kite.deleteGtt(id);
  }

  /** Shares held at the broker per symbol (holdings + today's CNC net). */
  async heldQuantities() {
    const [h, p] = await Promise.all([this.kite.holdings(), this.kite.positions()]);
    const map = new Map();
    for (const x of h || []) map.set(x.tradingsymbol, (map.get(x.tradingsymbol) || 0) + Number(x.quantity || 0) + Number(x.t1_quantity || 0));
    for (const x of p?.net || []) if (x.product === 'CNC') map.set(x.tradingsymbol, (map.get(x.tradingsymbol) || 0) + Number(x.quantity || 0));
    return map;
  }
}
