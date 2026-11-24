// Market-data feeds. KiteFeed = real Zerodha data; DemoFeed (demo/demoFeed.js) = simulated.
// Both expose: universe(), history(token, from, to), indexHistory(from, to), start(tokens), status()

import { EventEmitter } from 'node:events';
import { KiteTicker, parseCsv } from './kite.js';

export const NIFTY50_TOKEN = 256265;
const NIFTY500_URLS = [
  'https://archives.nseindia.com/content/indices/ind_nifty500list.csv',
  'https://www.niftyindices.com/IndexConstituent/ind_nifty500list.csv',
];

export async function fetchNifty500() {
  let lastErr;
  for (const url of NIFTY500_URLS) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', Accept: 'text/csv,*/*' },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const rows = parseNifty500Csv(await res.text());
      if (rows.length > 400) return rows;
      throw new Error(`only ${rows.length} rows`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Could not download the Nifty 500 list from NSE (${lastErr?.message}). Upload it in Settings → Data.`);
}

export function parseNifty500Csv(text) {
  return parseCsv(text)
    .map((r) => ({ symbol: (r.Symbol || '').trim(), name: (r['Company Name'] || '').trim(), industry: (r.Industry || '').trim(), series: (r.Series || '').trim() }))
    .filter((r) => r.symbol && (!r.series || r.series === 'EQ'));
}

export class KiteFeed extends EventEmitter {
  constructor({ kite, db, quotes, log }) {
    super();
    this.kind = 'kite';
    this.kite = kite;
    this.db = db;
    this.quotes = quotes;
    this.log = log;
    this.ticker = null;
    this.lastTick = 0;
  }

  /** Nifty 500 constituents mapped to Kite instrument tokens. Refreshed weekly. */
  async universe({ force = false } = {}) {
    const cached = this.db.all('SELECT * FROM universe WHERE active = 1');
    const fetchedAt = this.db.kvGet('universeFetchedAt');
    const stale = !fetchedAt || Date.now() - fetchedAt > 6 * 86400000;
    if (cached.length > 400 && !stale && !force) return cached;
    let list;
    try {
      list = await fetchNifty500();
    } catch (e) {
      // NSE sites sometimes block servers outside India: fall back to an uploaded list, then the saved one
      const manual = this.db.kvGet('nifty500Manual');
      const manualAt = this.db.kvGet('nifty500ManualAt') || 0;
      if (manual && (!cached.length || manualAt > (fetchedAt || 0))) {
        list = parseNifty500Csv(manual);
        this.log?.(`Using the Nifty 500 list you uploaded (${list.length} stocks)`);
      } else if (cached.length) {
        this.log?.('Could not refresh the Nifty 500 list from NSE — using the saved list. You can upload a fresh one in Settings → Data.', 'warn');
        return cached;
      } else throw e;
    }
    const inst = await this.kite.instruments('NSE');
    const bySym = new Map(inst.filter((i) => i.segment === 'NSE' && i.instrument_type === 'EQ').map((i) => [i.tradingsymbol, i]));
    const rows = [];
    for (const r of list) {
      const i = bySym.get(r.symbol);
      if (!i) continue;
      rows.push({ symbol: r.symbol, name: r.name, industry: r.industry, token: Number(i.instrument_token), tick: Number(i.tick_size) || 0.05 });
    }
    this.db.tx(() => {
      this.db.run('UPDATE universe SET active = 0');
      for (const r of rows)
        this.db.run(
          'INSERT INTO universe(symbol,name,industry,token,tick,active) VALUES(?,?,?,?,?,1) ON CONFLICT(symbol) DO UPDATE SET name=excluded.name, industry=excluded.industry, token=excluded.token, tick=excluded.tick, active=1',
          r.symbol,
          r.name,
          r.industry,
          r.token,
          r.tick,
        );
    });
    this.db.kvSet('universeFetchedAt', Date.now());
    return rows;
  }

  history(token, from, to) {
    return this.kite.historical(token, from, to, 'day');
  }

  indexHistory(from, to) {
    return this.kite.historical(NIFTY50_TOKEN, from, to, 'day');
  }

  start(tokens) {
    if (this.ticker) this.ticker.close();
    this.ticker = new KiteTicker({ apiKey: this.kite.apiKey, accessToken: this.kite.accessToken });
    this.ticker.on('ticks', (ticks) => {
      this.lastTick = Date.now();
      const ts = Date.now();
      for (const t of ticks) this.quotes.set(t.token, { ...this.quotes.get(t.token), ...t, ts });
      this.emit('ticks', ticks);
    });
    this.ticker.on('order', (o) => this.emit('order', o));
    this.ticker.on('connect', () => this.log?.('Live price stream connected'));
    this.ticker.on('disconnect', () => this.log?.('Live price stream disconnected — reconnecting', 'warn'));
    this.ticker.on('error', (e) => this.log?.(`Price stream: ${e.message}`, 'warn'));
    this.ticker.connect();
    this.ticker.subscribe([...tokens, NIFTY50_TOKEN]);
  }

  stop() {
    this.ticker?.close();
    this.ticker = null;
  }

  status() {
    return { connected: !!this.ticker?.connected, lastTick: this.lastTick };
  }
}
