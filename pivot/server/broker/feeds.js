// Market-data feeds. KiteFeed = real Zerodha data; DemoFeed (demo/demoFeed.js) = simulated.
// Both expose: universe(), history(token, from, to), indexHistory(from, to), start(tokens), status()

import { EventEmitter } from 'node:events';
import { KiteTicker, parseCsv } from './kite.js';

export const NIFTY50_TOKEN = 256265;

/** Which stocks the agents watch and trade. */
export const UNIVERSES = {
  nifty500: { label: 'Nifty 500', short: 'Nifty 500', min: 400, urls: ['https://archives.nseindia.com/content/indices/ind_nifty500list.csv', 'https://www.niftyindices.com/IndexConstituent/ind_nifty500list.csv'] },
  total: { label: 'Nifty Total Market (~750 stocks)', short: 'Total Market', min: 600, urls: ['https://archives.nseindia.com/content/indices/ind_niftytotalmarket_list.csv', 'https://www.niftyindices.com/IndexConstituent/ind_niftytotalmarket_list.csv'] },
  all: { label: 'All NSE stocks (~2,000)', short: 'All NSE', min: 0, urls: [] },
};
export const universeLabel = (kind) => (UNIVERSES[kind] || UNIVERSES.nifty500).short;

// Kite's live price stream takes at most 3,000 instruments per connection
const MAX_STREAM = 2900;

/** NSE equity shares only: no ETFs, bonds, SME/BE/trade-to-trade series (symbols ending -BE, -SM, -ST …). */
export function isPlainEquity(i) {
  if (i.segment !== 'NSE' || i.instrument_type !== 'EQ') return false;
  const sym = String(i.tradingsymbol || '');
  if (/-[A-Z0-9]{1,2}$/.test(sym)) return false; // series suffix
  if (/(BEES|ETF|IETF)$/.test(sym)) return false;
  if (/\bETF\b|BEES|LIQUID|GOLD ?ETF|\bINAV\b|\bSDL\b|GSEC|\bBONDS?\b/i.test(String(i.name || ''))) return false;
  return true;
}

export async function fetchIndexList(kind = 'nifty500') {
  const u = UNIVERSES[kind] || UNIVERSES.nifty500;
  let lastErr;
  for (const url of u.urls) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', Accept: 'text/csv,*/*' },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const rows = parseNifty500Csv(await res.text());
      if (rows.length > u.min) return rows;
      throw new Error(`only ${rows.length} rows`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Could not download the ${u.short} list from NSE (${lastErr?.message}). Upload it in Settings → App & data.`);
}
export const fetchNifty500 = () => fetchIndexList('nifty500');

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

  /**
   * The stocks to watch, mapped to Kite instrument tokens. Refreshed weekly, or when you change the choice.
   *  nifty500 / total: NSE index lists (with industries)
   *  all: every plain NSE equity from Kite's instrument list (industries filled in where NSE lists know them)
   */
  async universe({ force = false, kind = 'nifty500' } = {}) {
    const cached = this.db.all('SELECT * FROM universe WHERE active = 1');
    const fetchedAt = this.db.kvGet('universeFetchedAt');
    const stale = !fetchedAt || Date.now() - fetchedAt > 6 * 86400000;
    const sameKind = (this.db.kvGet('universeKind') || 'nifty500') === kind;
    if (cached.length > 100 && !stale && !force && sameKind) return cached;
    const inst = await this.kite.instruments('NSE');
    const bySym = new Map(inst.filter((i) => i.segment === 'NSE' && i.instrument_type === 'EQ').map((i) => [i.tradingsymbol, i]));
    let list;
    if (kind === 'all') {
      // industries: from the saved universe, then NSE's Total Market list if it can be downloaded
      const ind = new Map(this.db.all("SELECT symbol, name, industry FROM universe WHERE industry IS NOT NULL AND industry != '' AND industry != 'Unclassified'").map((r) => [r.symbol, r]));
      try {
        for (const r of await fetchIndexList('total')) ind.set(r.symbol, r);
      } catch {}
      list = inst.filter(isPlainEquity).map((i) => ({ symbol: i.tradingsymbol, name: ind.get(i.tradingsymbol)?.name || i.name || i.tradingsymbol, industry: ind.get(i.tradingsymbol)?.industry || 'Unclassified' }));
      this.log?.(`Watching all NSE stocks: ${list.length} equities (ETFs, bonds and SME/trade-to-trade series left out)`);
    } else {
      try {
        list = await fetchIndexList(kind);
      } catch (e) {
        // NSE sites sometimes block servers outside India: fall back to an uploaded list, then the saved one
        const manual = this.db.kvGet('nifty500Manual');
        const manualAt = this.db.kvGet('nifty500ManualAt') || 0;
        if (manual && (!cached.length || manualAt > (fetchedAt || 0) || !sameKind)) {
          list = parseNifty500Csv(manual);
          this.log?.(`Using the stock list you uploaded (${list.length} stocks)`);
        } else if (cached.length && sameKind) {
          this.log?.('Could not refresh the stock list from NSE — using the saved list. You can upload a fresh one in Settings → App & data.', 'warn');
          return cached;
        } else throw e;
      }
    }
    const rows = [];
    for (const r of list) {
      const i = bySym.get(r.symbol);
      if (!i) continue;
      rows.push({ symbol: r.symbol, name: r.name, industry: r.industry, token: Number(i.instrument_token), tick: Number(i.tick_size) || 0.05 });
    }
    if (rows.length > MAX_STREAM) {
      this.log?.(`Kite streams at most ${MAX_STREAM} stocks — keeping the first ${MAX_STREAM}`, 'warn');
      rows.length = MAX_STREAM;
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
    this.db.kvSet('universeKind', kind);
    // start streaming prices for any newly added stocks right away
    if (this.ticker) this.ticker.subscribe(rows.map((r) => r.token));
    return rows;
  }

  history(token, from, to) {
    return this.kite.historical(token, from, to, 'day');
  }

  /** 15-minute candles (Kite allows up to 200 days per request). */
  async history15(token, from, to) {
    const out = [];
    let start = from;
    while (start <= to) {
      const end = addDaysIso(start, 190) < to ? addDaysIso(start, 190) : to;
      out.push(...(await this.kite.historical(token, start, end, '15minute')));
      start = addDaysIso(end, 1);
    }
    return out;
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

function addDaysIso(date, n) {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
