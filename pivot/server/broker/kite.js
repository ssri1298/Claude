// Minimal Zerodha Kite Connect v3 client (REST + binary WebSocket ticker).
// Docs: https://kite.trade/docs/connect/v3/

import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';

const ROOT = 'https://api.kite.trade';
const LOGIN = 'https://kite.zerodha.com/connect/login';

export class KiteError extends Error {
  constructor(message, status, type) {
    super(message);
    this.status = status;
    this.type = type;
  }
}

/** Simple per-endpoint-class rate limiter (Kite: historical 3/s, quote 1/s, orders 10/s, others 10/s). */
class Limiter {
  constructor(perSec) {
    this.gap = 1000 / perSec;
    this.next = 0;
  }
  async wait() {
    const now = Date.now();
    const t = Math.max(now, this.next);
    this.next = t + this.gap;
    if (t > now) await new Promise((r) => setTimeout(r, t - now));
  }
}

export class KiteClient {
  constructor({ apiKey, apiSecret, accessToken } = {}) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.accessToken = accessToken;
    this.limits = { historical: new Limiter(2.8), quote: new Limiter(0.9), orders: new Limiter(8), other: new Limiter(8) };
  }

  loginUrl() {
    return `${LOGIN}?v=3&api_key=${encodeURIComponent(this.apiKey)}`;
  }

  async createSession(requestToken) {
    const checksum = createHash('sha256').update(this.apiKey + requestToken + this.apiSecret).digest('hex');
    const data = await this.request('POST', '/session/token', { api_key: this.apiKey, request_token: requestToken, checksum }, { auth: false });
    this.accessToken = data.access_token;
    return data; // { user_id, user_name, access_token, ... }
  }

  async request(method, path, params = {}, { auth = true, limiter = 'other', raw = false } = {}) {
    await this.limits[limiter].wait();
    const headers = { 'X-Kite-Version': '3' };
    if (auth) headers.Authorization = `token ${this.apiKey}:${this.accessToken}`;
    let url = ROOT + path;
    let body;
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
      else qs.append(k, String(v));
    }
    if (method === 'GET' || method === 'DELETE') {
      if ([...qs].length) url += '?' + qs.toString();
    } else {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = qs.toString();
    }
    const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(20000) });
    if (raw) {
      if (!res.ok) throw new KiteError(`Kite ${res.status}`, res.status);
      return res.text();
    }
    let json;
    try {
      json = await res.json();
    } catch {
      throw new KiteError(`Kite returned ${res.status}`, res.status);
    }
    if (!res.ok || json.status === 'error') throw new KiteError(json.message || `Kite error ${res.status}`, res.status, json.error_type);
    return json.data;
  }

  profile() {
    return this.request('GET', '/user/profile');
  }
  margins() {
    return this.request('GET', '/user/margins/equity');
  }
  holdings() {
    return this.request('GET', '/portfolio/holdings');
  }
  positions() {
    return this.request('GET', '/portfolio/positions');
  }
  orders() {
    return this.request('GET', '/orders', {}, { limiter: 'orders' });
  }
  orderHistory(id) {
    return this.request('GET', `/orders/${id}`, {}, { limiter: 'orders' });
  }
  async instruments(exchange = 'NSE') {
    const csv = await this.request('GET', `/instruments/${exchange}`, {}, { raw: true });
    return parseCsv(csv);
  }
  quote(instruments) {
    return this.request('GET', '/quote', { i: instruments }, { limiter: 'quote' });
  }
  ltp(instruments) {
    return this.request('GET', '/quote/ltp', { i: instruments }, { limiter: 'quote' });
  }
  async historical(token, from, to, interval = 'day') {
    const data = await this.request('GET', `/instruments/historical/${token}/${interval}`, { from: `${from} 00:00:00`, to: `${to} 23:59:59` }, { limiter: 'historical' });
    return (data.candles || []).map(([ts, o, h, l, c, v]) => ({ date: String(ts).slice(0, 10), time: String(ts).slice(11, 16), open: o, high: h, low: l, close: c, volume: v || 0 }));
  }
  placeOrder(p) {
    // p: { tradingsymbol, exchange, transaction_type, quantity, order_type, price, product, validity, tag }
    return this.request('POST', '/orders/regular', { exchange: 'NSE', product: 'CNC', validity: 'DAY', ...p }, { limiter: 'orders' });
  }
  modifyOrder(id, p) {
    return this.request('PUT', `/orders/regular/${id}`, p, { limiter: 'orders' });
  }
  cancelOrder(id) {
    return this.request('DELETE', `/orders/regular/${id}`, {}, { limiter: 'orders' });
  }
  /** Single-leg GTT stop: sell `qty` with a limit order once price trades at/below `trigger`. */
  placeGttStop({ symbol, qty, trigger, limitPrice, lastPrice }) {
    return this.request('POST', '/gtt/triggers', gttBody({ symbol, qty, trigger, limitPrice, lastPrice }));
  }
  modifyGttStop(id, args) {
    return this.request('PUT', `/gtt/triggers/${id}`, gttBody(args));
  }
  deleteGtt(id) {
    return this.request('DELETE', `/gtt/triggers/${id}`);
  }
}

function gttBody({ symbol, qty, trigger, limitPrice, lastPrice }) {
  return {
    type: 'single',
    condition: JSON.stringify({ exchange: 'NSE', tradingsymbol: symbol, trigger_values: [trigger], last_price: lastPrice }),
    orders: JSON.stringify([
      { exchange: 'NSE', tradingsymbol: symbol, transaction_type: 'SELL', quantity: qty, order_type: 'LIMIT', product: 'CNC', price: limitPrice },
    ]),
  };
}

export function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const head = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((l) => {
    const cells = splitCsvLine(l);
    const o = {};
    head.forEach((h, i) => (o[h] = cells[i]));
    return o;
  });
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

// ------------------------------------------------------------------------------------------
// WebSocket ticker (binary protocol). Emits 'ticks' with [{ token, ltp, volume, open, high, low, prevClose, lastTradeTime }]
// and 'order' with order-update postbacks.

export class KiteTicker extends EventEmitter {
  constructor({ apiKey, accessToken }) {
    super();
    this.apiKey = apiKey;
    this.accessToken = accessToken;
    this.tokens = new Set();
    this.ws = null;
    this.closedByUser = false;
    this.retry = 0;
    this.connected = false;
  }

  connect() {
    this.closedByUser = false;
    const url = `wss://ws.kite.trade?api_key=${this.apiKey}&access_token=${this.accessToken}`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.binaryType = 'arraybuffer';
    ws.on('open', () => {
      this.connected = true;
      this.retry = 0;
      this.emit('connect');
      if (this.tokens.size) this._send([...this.tokens]);
    });
    ws.on('message', (data, isBinary) => {
      if (!isBinary) {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'order') this.emit('order', msg.data);
          else if (msg.type === 'error') this.emit('error', new Error(msg.data));
        } catch {
          /* ignore */
        }
        return;
      }
      const buf = Buffer.from(data);
      if (buf.length < 2) return; // heartbeat
      const ticks = parseBinary(buf);
      if (ticks.length) this.emit('ticks', ticks);
    });
    ws.on('close', () => {
      this.connected = false;
      this.emit('disconnect');
      if (!this.closedByUser) {
        const delay = Math.min(30000, 1000 * 2 ** this.retry++);
        setTimeout(() => this.connect(), delay);
      }
    });
    ws.on('error', (e) => this.emit('error', e));
  }

  subscribe(tokens) {
    tokens.forEach((t) => this.tokens.add(Number(t)));
    if (this.connected) this._send(tokens.map(Number));
  }

  _send(tokens) {
    for (let i = 0; i < tokens.length; i += 500) {
      const chunk = tokens.slice(i, i + 500);
      this.ws.send(JSON.stringify({ a: 'subscribe', v: chunk }));
      this.ws.send(JSON.stringify({ a: 'mode', v: ['quote', chunk] }));
    }
  }

  close() {
    this.closedByUser = true;
    this.ws?.close();
  }
}

export function parseBinary(buf) {
  const n = buf.readInt16BE(0);
  let off = 2;
  const out = [];
  for (let i = 0; i < n; i++) {
    const len = buf.readInt16BE(off);
    off += 2;
    const p = buf.subarray(off, off + len);
    off += len;
    const token = p.readUInt32BE(0);
    const seg = token & 0xff;
    const div = seg === 3 ? 10000000 : 100; // CDS uses a different divisor
    const isIndex = seg === 9;
    if (len === 8) {
      out.push({ token, ltp: p.readInt32BE(4) / div });
    } else if (isIndex && (len === 28 || len === 32)) {
      out.push({
        token,
        ltp: p.readInt32BE(4) / div,
        high: p.readInt32BE(8) / div,
        low: p.readInt32BE(12) / div,
        open: p.readInt32BE(16) / div,
        prevClose: p.readInt32BE(20) / div,
        volume: 0,
        isIndex: true,
      });
    } else if (len >= 44) {
      out.push({
        token,
        ltp: p.readInt32BE(4) / div,
        lastQty: p.readInt32BE(8),
        avgPrice: p.readInt32BE(12) / div,
        volume: p.readUInt32BE(16),
        open: p.readInt32BE(28) / div,
        high: p.readInt32BE(32) / div,
        low: p.readInt32BE(36) / div,
        prevClose: p.readInt32BE(40) / div,
        lastTradeTime: len >= 48 ? p.readInt32BE(44) : null,
      });
    }
  }
  return out;
}
