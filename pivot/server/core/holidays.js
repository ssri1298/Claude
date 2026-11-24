// NSE trading holidays (equity / Capital Market segment).
// A built-in list ships with the app; the server also downloads the official list from NSE
// (weekly), so next year's holidays appear as soon as NSE publishes them.

export const BUNDLED_HOLIDAYS = {
  // NSE equity-segment trading holidays 2026 (weekdays). Source: NSE circular "Trading holidays
  // for the calendar year 2026", as reported by brokers; checked against several sources.
  2026: [
    ['2026-01-26', 'Republic Day'],
    ['2026-03-03', 'Holi'],
    ['2026-03-26', 'Shri Ram Navami'],
    ['2026-03-31', 'Shri Mahavir Jayanti'],
    ['2026-04-03', 'Good Friday'],
    ['2026-04-14', 'Dr. Baba Saheb Ambedkar Jayanti'],
    ['2026-05-01', 'Maharashtra Day'],
    ['2026-05-28', 'Bakri Id'],
    ['2026-06-26', 'Muharram'],
    ['2026-09-14', 'Ganesh Chaturthi'],
    ['2026-10-02', 'Mahatma Gandhi Jayanti'],
    ['2026-10-20', 'Dussehra'],
    ['2026-11-10', 'Diwali Balipratipada'],
    ['2026-11-24', 'Prakash Gurpurb Sri Guru Nanak Dev'],
    ['2026-12-25', 'Christmas'],
  ],
};

const MONTHS = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };

/** "26-Jan-2026" → "2026-01-26" */
export function parseNseDate(s) {
  const m = String(s || '').match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m || !MONTHS[m[2]]) return null;
  return `${m[3]}-${MONTHS[m[2]]}-${m[1].padStart(2, '0')}`;
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

/** Download the official list from NSE. NSE requires browser-like cookies, so visit the site first. */
export async function fetchNseHolidays() {
  const home = await fetch('https://www.nseindia.com/resources/exchange-communication-holidays', { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(20000) });
  const cookies = (home.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  const res = await fetch('https://www.nseindia.com/api/holiday-master?type=trading', {
    headers: { 'User-Agent': UA, Accept: 'application/json', Referer: 'https://www.nseindia.com/resources/exchange-communication-holidays', Cookie: cookies },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`NSE answered ${res.status}`);
  const json = await res.json();
  const list = (json.CM || json.CBM || []).map((h) => [parseNseDate(h.tradingDate), String(h.description || '').trim()]).filter(([d]) => d);
  if (list.length < 5) throw new Error('NSE returned an unexpected holiday list');
  return list;
}

/** Merge holidays into settings + a date → name map. Returns how many were new. */
export function mergeHolidays(ctx, list, source) {
  const names = { ...ctx.db.kvGet('holidayNames', {}) };
  const set = new Set(ctx.settings.holidays || []);
  let added = 0;
  for (const [date, name] of list) {
    if (!set.has(date)) {
      set.add(date);
      added++;
    }
    if (name) names[date] = name;
  }
  ctx.db.kvSet('holidayNames', names);
  ctx.updateSettings({ holidays: [...set].sort() });
  ctx.db.kvSet('holidaySync', { at: Date.now(), source, count: list.length });
  return added;
}

/** On startup: add the built-in list once, then keep it fresh from NSE (weekly). */
export async function syncHolidays(ctx, { force = false } = {}) {
  if (!ctx.db.kvGet('bundledHolidays2026')) {
    mergeHolidays(ctx, BUNDLED_HOLIDAYS[2026], 'built-in list');
    ctx.db.kvSet('bundledHolidays2026', true);
  }
  if (ctx.demo) return { ok: true, source: 'built-in list' };
  const last = ctx.db.kvGet('holidaySync');
  if (!force && last?.source === 'NSE' && Date.now() - last.at < 7 * 86400000) return { ok: true, skipped: true };
  try {
    const list = await fetchNseHolidays();
    const added = mergeHolidays(ctx, list, 'NSE');
    if (added) ctx.bus.log('Parent', `Downloaded NSE trading holidays — ${added} new date${added > 1 ? 's' : ''} added`, { level: 'success' });
    return { ok: true, added, count: list.length };
  } catch (e) {
    if (force) ctx.bus.log('Parent', `Could not download holidays from NSE (${e.message}) — using the saved list`, { level: 'warn' });
    return { ok: false, error: e.message };
  }
}
