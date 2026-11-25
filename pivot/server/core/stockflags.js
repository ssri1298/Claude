// Stock flags the agents check before buying (refreshed every morning and evening):
//   results       upcoming quarterly-results dates (NSE board meetings / event calendar)
//   surveillance  stocks on NSE's ASM / GSM surveillance lists
//   bands         circuit band % for stocks with a fixed price band (from Kite quotes)
//   fno           stocks in the F&O segment (no fixed circuit band)
// Liquidity (₹ crore traded per day) is computed from daily candles during analysis.

import { parseNseDate } from './holidays.js';
import { tradingDaysBetween } from './time.js';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

/** NSE's API needs browser-like cookies: open a normal page first, then call the API with them. */
export async function nseSession(page = 'https://www.nseindia.com/companies-listing/corporate-filings-event-calendar') {
  const home = await fetch(page, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(20000) });
  const cookies = (home.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  return async (path) => {
    const res = await fetch('https://www.nseindia.com' + path, { headers: { 'User-Agent': UA, Accept: 'application/json', Referer: page, Cookie: cookies }, signal: AbortSignal.timeout(25000) });
    if (!res.ok) throw new Error(`NSE answered ${res.status} for ${path.split('?')[0]}`);
    return res.json();
  };
}

/** "28-Nov-2026" or "2026-11-28" → "2026-11-28" */
function anyDate(s) {
  const v = String(s || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return parseNseDate(v.split(' ')[0]);
}

/** Walk any JSON and collect objects that have a `symbol`-like field. */
function collectRows(json, out = []) {
  if (Array.isArray(json)) json.forEach((x) => collectRows(x, out));
  else if (json && typeof json === 'object') {
    if (typeof (json.symbol ?? json.bm_symbol) === 'string') out.push(json);
    else Object.values(json).forEach((x) => collectRows(x, out));
  }
  return out;
}

const isResults = (txt) => /result/i.test(String(txt || ''));

/** Upcoming results dates: { SYMBOL: 'YYYY-MM-DD' } (earliest upcoming date per stock). */
export async function fetchResultsDates(nse, today) {
  const out = {};
  const add = (sym, date) => {
    if (!sym || !date || date < today) return;
    if (!out[sym] || date < out[sym]) out[sym] = date;
  };
  let ok = 0;
  try {
    for (const r of collectRows(await nse('/api/event-calendar'))) if (isResults(r.purpose) || isResults(r.bm_desc)) add(r.symbol, anyDate(r.date));
    ok++;
  } catch {}
  try {
    for (const r of collectRows(await nse('/api/corporate-board-meetings?index=equities'))) if (isResults(r.bm_purpose) || isResults(r.bm_desc)) add(r.bm_symbol || r.symbol, anyDate(r.bm_date || r.date));
    ok++;
  } catch {}
  if (!ok) throw new Error('could not read the NSE results calendar');
  return out;
}

/** Stocks under surveillance: { SYMBOL: 'ASM (long term)' | 'GSM' … } */
export async function fetchSurveillance(nse) {
  const out = {};
  let ok = 0;
  try {
    const asm = await nse('/api/reportASM');
    for (const [k, v] of Object.entries(asm || {})) for (const r of collectRows(v)) out[r.symbol] = `ASM${/long/i.test(k) ? ' (long term)' : /short/i.test(k) ? ' (short term)' : ''}`;
    ok++;
  } catch {}
  try {
    for (const r of collectRows(await nse('/api/reportGSM'))) out[r.symbol] = 'GSM';
    ok++;
  } catch {}
  if (!ok) throw new Error('could not read the NSE surveillance lists');
  return out;
}

/** Circuit bands from Kite quotes (500 instruments per call) and the F&O list from Kite instruments. */
export async function fetchBands(kite, symbols) {
  const fno = new Set();
  try {
    for (const r of await kite.instruments('NFO')) if (r.name) fno.add(String(r.name).toUpperCase());
  } catch {}
  const bands = {};
  for (let i = 0; i < symbols.length; i += 450) {
    const chunk = symbols.slice(i, i + 450).map((s) => 'NSE:' + s);
    const q = await kite.quote(chunk);
    for (const [k, v] of Object.entries(q || {})) {
      const sym = k.replace(/^NSE:/, '');
      const ref = v.ohlc?.close || v.last_price;
      if (v.upper_circuit_limit && ref) bands[sym] = Math.round((v.upper_circuit_limit / ref - 1) * 100);
    }
  }
  return { bands, fno: [...fno] };
}

/** Deterministic made-up flags for demo mode, so every filter can be seen working. */
function demoFlags(ctx, today) {
  const syms = [...(ctx.analysis?.keys() || [])].sort();
  const results = {};
  const surveillance = {};
  const bands = {};
  syms.forEach((s, i) => {
    if (i % 11 === 3) results[s] = addDays(today, 2 + (i % 4));
    if (i % 29 === 7) surveillance[s] = 'ASM (short term)';
    if (i % 23 === 5) bands[s] = i % 2 ? 5 : 10;
  });
  return { results, surveillance, bands, fno: syms.filter((_, i) => i % 3 === 0) };
}

function addDays(d, n) {
  const x = new Date(d + 'T12:00:00Z');
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

/** Refresh all flags; keeps the previous value of any part that fails. */
export async function refreshFlags(ctx, { log } = {}) {
  const today = new Date(ctx.clock.now().getTime() + 5.5 * 3600000).toISOString().slice(0, 10);
  const prev = ctx.db.kvGet('stockFlags', {}) || {};
  let next = { ...prev };
  const problems = [];
  if (ctx.demo) next = { ...demoFlags(ctx, today), sources: { results: 'demo', surveillance: 'demo', bands: 'demo' } };
  else {
    next.sources = { ...(prev.sources || {}) };
    try {
      const nse = await nseSession();
      try {
        next.results = await fetchResultsDates(nse, today);
        next.sources.results = new Date().toISOString();
      } catch (e) {
        problems.push(`results calendar (${e.message})`);
      }
      try {
        next.surveillance = await fetchSurveillance(nse);
        next.sources.surveillance = new Date().toISOString();
      } catch (e) {
        problems.push(`surveillance lists (${e.message})`);
      }
    } catch (e) {
      problems.push(`NSE website (${e.message})`);
    }
    if (ctx.kite?.accessToken) {
      try {
        const symbols = [...(ctx.analysis?.keys() || [])];
        if (symbols.length) {
          const b = await fetchBands(ctx.kite, symbols);
          next.bands = b.bands;
          if (b.fno.length) next.fno = b.fno;
          next.sources.bands = new Date().toISOString();
        }
      } catch (e) {
        problems.push(`circuit bands (${e.message})`);
      }
    }
  }
  next.updated = new Date().toISOString();
  next.problems = problems;
  ctx.db.kvSet('stockFlags', next);
  ctx.flags = buildIndex(next);
  if (problems.length) log?.(`Could not refresh ${problems.join(', ')} — using the last saved lists`, 'warn');
  else log?.(`Stock filters refreshed: ${Object.keys(next.results || {}).length} upcoming results, ${Object.keys(next.surveillance || {}).length} stocks under surveillance`);
  return next;
}

export function loadFlags(ctx) {
  ctx.flags = buildIndex(ctx.db.kvGet('stockFlags', {}) || {});
  return ctx.flags;
}

function buildIndex(raw) {
  return { results: raw.results || {}, surveillance: raw.surveillance || {}, bands: raw.bands || {}, fno: new Set(raw.fno || []), updated: raw.updated, sources: raw.sources || {}, problems: raw.problems || [] };
}

/**
 * Why a stock may not be bought because of a filter, or null.
 * Returns { code, reason } — code is one of results | surveillance | band | liquidity.
 */
export function filterBlock(ctx, a, date) {
  const F = ctx.settings.rules.filters || {};
  const fl = ctx.flags || {};
  const res = fl.results?.[a.symbol];
  if (F.results?.enabled && res && res >= date) {
    const days = tradingDaysBetween(date, res, ctx.settings.holidays);
    if (days <= (F.results.daysBefore ?? 5)) return { code: 'results', reason: `Quarterly results on ${res} (${days === 0 ? 'today' : `in ${days} trading ${days === 1 ? 'day' : 'days'}`}) — no new buys just before results` };
  }
  if (F.surveillance && fl.surveillance?.[a.symbol]) return { code: 'surveillance', reason: `On NSE's ${fl.surveillance[a.symbol]} surveillance list` };
  const band = fl.bands?.[a.symbol];
  if (F.minBandPct && band && band < F.minBandPct && !fl.fno?.has(a.symbol)) return { code: 'band', reason: `${band}% circuit band — the stop may not fill if it gets stuck at the lower circuit` };
  if (F.minSectorRank && a.sectorRs != null && a.sectorRs < F.minSectorRank) return { code: 'sector', reason: `${a.industry || 'Its industry'} is a lagging group (strength ${a.sectorRs}/100; you buy only ${F.minSectorRank}+)` };
  if (F.minTurnoverCr && a.turnoverCr != null && a.turnoverCr < F.minTurnoverCr) return { code: 'liquidity', reason: `Only ₹${a.turnoverCr} crore traded per day (your minimum is ₹${F.minTurnoverCr} crore)` };
  return null;
}

/** Flags to show on a stock (even when the filters are switched off). */
export function stockBadges(ctx, a, date) {
  const fl = ctx.flags || {};
  const out = [];
  const res = fl.results?.[a.symbol];
  if (res && res >= date) out.push({ code: 'results', label: `Results ${res.slice(8)}/${res.slice(5, 7)}`, date: res });
  if (fl.surveillance?.[a.symbol]) out.push({ code: 'surveillance', label: fl.surveillance[a.symbol] });
  const band = fl.bands?.[a.symbol];
  if (band && band < 20 && !fl.fno?.has(a.symbol)) out.push({ code: 'band', label: `${band}% band` });
  if (a.turnoverCr != null && a.turnoverCr < (ctx.settings.rules.filters?.minTurnoverCr || 10)) out.push({ code: 'liquidity', label: `₹${a.turnoverCr} cr/day` });
  return out;
}
