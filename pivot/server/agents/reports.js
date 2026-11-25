// Morning brief and evening report: built as structured data, saved in the `reports` table (one per day and
// type) for the Reports page, and turned into a short message for app notifications and Telegram.

import { ist, tradingDaysBetween } from '../core/time.js';
import { round } from '../engine/vcp.js';
import { esc } from '../notify/telegram.js';
import { getOverrides } from '../core/overrides.js';

const inr = (x) => '₹' + Math.round(Number(x) || 0).toLocaleString('en-IN');
const signedInr = (x) => (x >= 0 ? '+₹' : '−₹') + Math.abs(Math.round(Number(x) || 0)).toLocaleString('en-IN');

const REASON = { stop: 'Stop-loss', trail: 'Trailing exit', manual: 'You sold', outside: 'Sold outside Pivot', partial: '⅓ profit', failed: 'Failed breakout', time: 'Time exit', climax: 'Climax sale' };

function marketView(ctx) {
  const m = ctx.market || {};
  return { regime: m.regime || 'unknown', label: m.label || 'Unknown', notes: m.notes || [], breadth: m.breadth ?? null, close: m.close ?? null };
}

/** Open positions with where they stand and what could happen next. */
function openPositions(ctx, kind, date) {
  const { db, settings } = ctx;
  const R = settings.rules;
  const holds = getOverrides(db).positions;
  return db.all("SELECT * FROM positions WHERE kind = ? AND status = 'open' ORDER BY entry_ts", kind).map((p) => {
    const last = ctx.quotes?.get(p.token)?.ltp || p.last_price || p.entry_price;
    const held = tradingDaysBetween(p.entry_date, date, settings.holidays);
    const h = holds[p.id] || {};
    const watch = [];
    if (!p.partial_done && R.failedExit?.enabled && !h.noFailedExit && held < (R.failedExit.days || 2)) watch.push(`Failed-breakout check until day ${R.failedExit.days || 2}`);
    if (!p.partial_done && R.timeExit?.enabled && !h.noTimeExit) {
      const left = (R.timeExit.days || 7) - held;
      watch.push(left > 0 ? `Time exit in ${left} trading ${left === 1 ? 'day' : 'days'}` : 'Time exit at today’s close');
    }
    if (p.partial_done) watch.push('⅓ booked · stop at breakeven or better');
    const res = ctx.flags?.results?.[p.symbol];
    if (res && res >= date) watch.push(`📅 Quarterly results on ${res} — consider booking profit or tightening the stop`);
    return {
      symbol: p.symbol,
      qty: p.qty_open,
      entry: p.entry_price,
      last: round(last),
      pnlPct: round((last / p.entry_price - 1) * 100, 1),
      pnl: round(p.qty_open * (last - p.entry_price) + (p.realized || 0)),
      stop: p.stop,
      toStopPct: round((p.stop / last - 1) * 100, 1),
      target: p.partial_done ? null : round(p.entry_price * (1 + R.partialAtPct / 100)),
      held,
      grade: p.grade,
      watch,
    };
  });
}

function setupView(a) {
  return {
    symbol: a.symbol,
    name: a.name,
    industry: a.industry,
    grade: a.grade,
    score: a.score,
    rs: a.rsRating,
    close: a.close,
    pivot: a.vcp?.pivot,
    distPct: a.vcp?.distToPivotPct != null ? round(a.vcp.distToPivotPct, 1) : null,
    stopPct: a.vcp?.stopPct ?? null,
    stage: a.stage,
  };
}

export async function buildMorning(ctx) {
  const { parent, screener, analyst, executor } = ctx.agents;
  const date = ist(ctx.clock.now()).date;
  const kind = executor.mode;
  const c = screener.status.counts || {};
  const cap = await executor.capital(kind);
  const market = marketView(ctx);
  const s = ctx.settings;
  const notes = [];
  if (market.regime === 'downtrend' && s.marketFilter === 'pause' && getOverrides(ctx.db).allowCorrectionBuys !== date) notes.push('Market in a correction — new buys are paused today (stops still active).');
  if (market.regime === 'downtrend' && s.marketFilter === 'half') notes.push('Market in a correction — new positions are half size today.');
  if (market.regime === 'pressure') notes.push(`Uptrend under pressure — buys need a higher score (${s.rules.minScore + s.rules.pressureExtraScore}+).`);
  if (s.agentsPaused) notes.push('You paused new buys.');
  if (!s.confirmTrades) notes.push('Fully automatic — breakouts are bought without asking.');
  return {
    type: 'morning',
    date,
    kind,
    market,
    counts: { universe: c.total ?? ctx.analysis?.size ?? 0, trendPass: c.trendPass ?? 0, setups: c.setups ?? 0, near: c.near ?? 0 },
    capital: { equity: cap.equity, cash: cap.cash, openPnl: cap.openPnl, invested: cap.invested },
    positions: openPositions(ctx, kind, date),
    top: analyst.topSetups(8).map(setupView),
    notes,
    schedule: s.schedule,
    loggedIn: parent.dataReady(),
  };
}

export async function buildEvening(ctx) {
  const { db, settings } = ctx;
  const { executor, analyst } = ctx.agents;
  const date = ist(ctx.clock.now()).date;
  const kind = executor.mode;
  const cap = await executor.capital(kind);
  const prev = db.get('SELECT equity FROM equity WHERE kind = ? AND date < ? ORDER BY date DESC LIMIT 1', kind, date);
  const fills = db.all(
    "SELECT f.ts, f.side, f.qty, f.price, f.charges, f.reason, p.symbol, p.entry_price FROM fills f JOIN positions p ON p.id = f.position_id WHERE p.kind = ? AND f.ts >= ? ORDER BY f.ts",
    kind,
    ctx.clock.now().toISOString().slice(0, 10),
  ).filter((f) => ist(new Date(f.ts)).date === date);
  const buys = fills.filter((f) => f.side === 'BUY').map((f) => ({ symbol: f.symbol, qty: f.qty, price: f.price, value: round(f.qty * f.price), time: ist(new Date(f.ts)).hhmm }));
  const sells = fills
    .filter((f) => f.side === 'SELL')
    .map((f) => ({ symbol: f.symbol, qty: f.qty, price: f.price, pnl: round(f.qty * (f.price - f.entry_price) - (f.charges || 0)), pct: round((f.price / f.entry_price - 1) * 100, 1), reason: REASON[f.reason] || String(f.reason || 'Sold').split(' — ')[0], time: ist(new Date(f.ts)).hhmm }));
  const closed = db.all('SELECT symbol, realized, entry_price, exit_price, exit_reason, entry_date FROM positions WHERE kind = ? AND exit_date = ?', kind, date).map((p) => ({
    symbol: p.symbol,
    realized: round(p.realized),
    pct: round((p.exit_price / p.entry_price - 1) * 100, 1),
    reason: REASON[p.exit_reason] || p.exit_reason,
    days: tradingDaysBetween(p.entry_date, date, settings.holidays),
  }));
  const sigRows = db.all('SELECT symbol, score, grade, status, reason FROM signals WHERE date = ? ORDER BY id', date);
  const bought = sigRows.filter((x) => ['auto', 'approved', 'overruled'].includes(x.status));
  const skipped = sigRows.filter((x) => !['auto', 'approved', 'overruled', 'awaiting_approval'].includes(x.status));
  return {
    type: 'evening',
    date,
    kind,
    market: marketView(ctx),
    capital: { equity: cap.equity, cash: cap.cash, openPnl: cap.openPnl, invested: cap.invested },
    change: prev ? round(cap.equity - prev.equity) : null,
    changePct: prev ? round((cap.equity / prev.equity - 1) * 100, 2) : null,
    realizedToday: round(sells.reduce((s, x) => s + x.pnl, 0)),
    buys,
    sells,
    closed,
    signals: {
      total: sigRows.length,
      bought: bought.map((x) => ({ symbol: x.symbol, grade: x.grade, score: x.score })),
      skipped: skipped.map((x) => ({ symbol: x.symbol, grade: x.grade, score: x.score, reason: x.reason || x.status.replace(/_/g, ' ') })),
    },
    positions: openPositions(ctx, kind, date),
    watching: db.get("SELECT COUNT(*) AS n FROM watchlist WHERE status = 'watching'").n,
    tomorrow: analyst.topSetups(6).map(setupView),
  };
}

export function saveReport(db, r) {
  db.run(
    'INSERT INTO reports(date, type, ts, kind, data) VALUES(?,?,?,?,?) ON CONFLICT(date, type) DO UPDATE SET ts = excluded.ts, kind = excluded.kind, data = excluded.data',
    r.date,
    r.type,
    new Date().toISOString(),
    r.kind,
    JSON.stringify(r),
  );
}

export function morningText(r) {
  const lines = [
    `☀️ <b>Morning brief</b> · ${r.date}${r.kind === 'paper' ? ' <i>[paper]</i>' : ''}`,
    `Market: <b>${esc(r.market.label)}</b>`,
    `${r.counts.trendPass} stocks pass the trend template · ${r.counts.setups} VCP setups`,
    `Capital ${inr(r.capital.equity)} · free cash ${inr(r.capital.cash)} · ${r.positions.length} open positions`,
    ...r.notes.map((n) => `⚠︎ ${esc(n)}`),
    '',
    r.top.length ? '<b>Top setups</b>' : 'No high-quality setups today.',
    ...r.top.slice(0, 6).map((a, i) => `${i + 1}. <b>${esc(a.symbol)}</b> ${a.grade} (${a.score}) · pivot ₹${a.pivot} · ${Math.abs(a.distPct ?? 0)}% away`),
  ];
  return lines.join('\n');
}

export function eveningText(r) {
  const lines = [
    `🌙 <b>Evening report</b> · ${r.date}${r.kind === 'paper' ? ' <i>[paper]</i>' : ''}`,
    `Equity ${inr(r.capital.equity)}${r.change != null ? ` (${signedInr(r.change)} today)` : ''} · free cash ${inr(r.capital.cash)}`,
    `Buys: ${r.buys.length} · Sells: ${r.sells.length} · Booked ${signedInr(r.realizedToday)}`,
    ...r.sells.map((x) => `• ${esc(x.symbol)} ${x.reason} ${x.pct >= 0 ? '+' : ''}${x.pct}%`),
    `Signals: ${r.signals.total} (${r.signals.bought.length} bought, ${r.signals.skipped.length} skipped)`,
    `Holding ${r.positions.length} · watching ${r.watching} setups for tomorrow.`,
  ];
  return lines.join('\n');
}


// ------------------------------------------------------------------ weekly / monthly
export function periodRange(type, date) {
  const d = new Date(date + 'T12:00:00Z');
  if (type === 'month') {
    const from = date.slice(0, 8) + '01';
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12));
    return { from, to: end.toISOString().slice(0, 10), label: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
  }
  const day = (d.getUTCDay() + 6) % 7;
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() - day);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  const f = (x) => x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return { from: mon.toISOString().slice(0, 10), to: sun.toISOString().slice(0, 10), label: `${f(mon)} – ${f(sun)}` };
}

export function buildPeriodReport(ctx, type, date, kindArg) {
  const { db, settings } = ctx;
  const kind = kindArg || ctx.agents.executor.mode;
  const { from, to, label } = periodRange(type, date);
  const startRow = db.get('SELECT equity FROM equity WHERE kind = ? AND date < ? ORDER BY date DESC LIMIT 1', kind, from);
  const endRow = db.get('SELECT date, equity FROM equity WHERE kind = ? AND date <= ? ORDER BY date DESC LIMIT 1', kind, to);
  const startEq = startRow?.equity ?? (kind === 'paper' ? settings.paperCapital : db.get('SELECT equity FROM equity WHERE kind = ? AND date >= ? ORDER BY date LIMIT 1', kind, from)?.equity ?? null);
  const endEq = endRow && endRow.date >= from ? endRow.equity : null;
  const closedRows = db.all('SELECT * FROM positions WHERE kind = ? AND status = \'closed\' AND exit_date BETWEEN ? AND ? ORDER BY exit_date', kind, from, to);
  const closed = closedRows.map((p) => {
    const risk = (p.entry_price - (p.initial_stop || p.stop)) * p.qty_initial;
    return {
      symbol: p.symbol,
      entryDate: p.entry_date,
      exitDate: p.exit_date,
      realized: round(p.realized),
      pct: round((p.realized / (p.entry_price * p.qty_initial)) * 100, 1),
      r: risk > 0 ? round(p.realized / risk, 2) : null,
      reason: REASON[p.exit_reason] || p.exit_reason,
      days: tradingDaysBetween(p.entry_date, p.exit_date, settings.holidays),
    };
  });
  const fills = db
    .all('SELECT f.side, f.qty, f.price, f.charges, f.ts, p.entry_price FROM fills f JOIN positions p ON p.id = f.position_id WHERE p.kind = ? AND f.ts >= ? ORDER BY f.ts', kind, from)
    .filter((f) => {
      const d = ist(new Date(f.ts)).date;
      return d >= from && d <= to;
    });
  const booked = round(fills.filter((f) => f.side === 'SELL').reduce((s, f) => s + f.qty * (f.price - f.entry_price) - (f.charges || 0), 0));
  const charges = round(fills.reduce((s, f) => s + (f.charges || 0), 0));
  const sigs = db.all('SELECT status, reason FROM signals WHERE date BETWEEN ? AND ?', from, to);
  const skipped = {};
  for (const x of sigs) if (!['auto', 'approved', 'overruled', 'awaiting_approval'].includes(x.status)) skipped[x.status] = (skipped[x.status] || 0) + 1;
  const wins = closed.filter((x) => x.realized > 0);
  const rs = closed.filter((x) => x.r != null);
  const journal = db.all('SELECT j.*, p.kind FROM journal j LEFT JOIN positions p ON p.id = j.position_id WHERE j.date BETWEEN ? AND ? ORDER BY j.ts', from, to).map((j) => ({ symbol: j.symbol, date: j.date, text: j.text, tags: JSON.parse(j.tags || '[]') }));
  const best = closed.slice().sort((a, b) => b.realized - a.realized)[0] || null;
  const worst = closed.slice().sort((a, b) => a.realized - b.realized)[0] || null;
  return {
    type,
    kind,
    date,
    from,
    to,
    label,
    startEquity: startEq,
    endEquity: endEq,
    change: startEq != null && endEq != null ? round(endEq - startEq) : null,
    changePct: startEq && endEq != null ? round((endEq / startEq - 1) * 100, 2) : null,
    closed,
    stats: { trades: closed.length, winRate: closed.length ? Math.round((wins.length / closed.length) * 100) : null, avgR: rs.length ? round(rs.reduce((s, x) => s + x.r, 0) / rs.length, 2) : null, booked, charges, buys: fills.filter((f) => f.side === 'BUY').length, sells: fills.filter((f) => f.side === 'SELL').length },
    best,
    worst,
    signals: { total: sigs.length, bought: sigs.filter((x) => ['auto', 'approved', 'overruled'].includes(x.status)).length, skipped },
    journal,
  };
}

export function periodText(r) {
  const head = r.type === 'month' ? '📆 <b>Monthly report</b>' : '🗓 <b>Weekly report</b>';
  return [
    `${head} · ${esc(r.label)}${r.kind === 'paper' ? ' <i>[paper]</i>' : ''}`,
    r.change != null ? `Account ${signedInr(r.change)} (${r.changePct >= 0 ? '+' : ''}${r.changePct}%) → ${inr(r.endEquity)}` : '',
    `Closed ${r.stats.trades} trades${r.stats.trades ? ` · ${r.stats.winRate}% wins · average ${r.stats.avgR ?? '—'}R` : ''}`,
    `Booked ${signedInr(r.stats.booked)} · charges ${inr(r.stats.charges)}`,
    r.best && r.best.realized > 0 ? `Best: ${esc(r.best.symbol)} ${signedInr(r.best.realized)}` : '',
    r.worst && r.worst.realized < 0 ? `Worst: ${esc(r.worst.symbol)} ${signedInr(r.worst.realized)}` : '',
    `Breakouts: ${r.signals.total} (${r.signals.bought} bought)`,
  ]
    .filter(Boolean)
    .join('\n');
}

// ------------------------------------------------------------------ tax statement (capital gains)
/** Indian financial year 'YYYY' = 1 April YYYY – 31 March YYYY+1. One row per sale. */
export function taxRows(ctx, fy, kind = 'live') {
  const from = `${fy}-04-01`;
  const to = `${Number(fy) + 1}-03-31`;
  const sells = ctx.db
    .all("SELECT f.*, p.symbol, p.entry_date, p.entry_price, p.qty_initial, p.id AS pid FROM fills f JOIN positions p ON p.id = f.position_id WHERE p.kind = ? AND f.side = 'SELL' ORDER BY f.ts", kind)
    .filter((f) => {
      const d = ist(new Date(f.ts)).date;
      return d >= from && d <= to;
    });
  const buyCharges = new Map();
  for (const b of ctx.db.all("SELECT f.position_id, SUM(f.charges) AS c, SUM(f.qty) AS q FROM fills f JOIN positions p ON p.id = f.position_id WHERE p.kind = ? AND f.side = 'BUY' GROUP BY f.position_id", kind)) buyCharges.set(b.position_id, b);
  return sells.map((f) => {
    const sellDate = ist(new Date(f.ts)).date;
    const bc = buyCharges.get(f.pid);
    const buyCh = bc && bc.q ? (bc.c * f.qty) / bc.q : 0;
    const held = Math.round((new Date(sellDate) - new Date(f.entry_date)) / 86400000);
    const buyValue = f.qty * f.entry_price;
    const sellValue = f.qty * f.price;
    return {
      symbol: f.symbol,
      buyDate: f.entry_date,
      sellDate,
      qty: f.qty,
      buyPrice: round(f.entry_price),
      buyValue: round(buyValue),
      sellPrice: round(f.price),
      sellValue: round(sellValue),
      buyCharges: round(buyCh),
      sellCharges: round(f.charges || 0),
      gain: round(sellValue - buyValue - buyCh - (f.charges || 0)),
      holdingDays: held,
      term: held > 365 ? 'LTCG' : 'STCG',
    };
  });
}

export function taxCsv(rows, fy, kind) {
  const head = ['Symbol', 'Buy date', 'Sell date', 'Quantity', 'Buy price', 'Buy value', 'Sell price', 'Sell value', 'Buy charges', 'Sell charges', 'Gain / loss', 'Holding days', 'Type'];
  const lines = [head.join(',')];
  for (const r of rows) lines.push([r.symbol, r.buyDate, r.sellDate, r.qty, r.buyPrice, r.buyValue, r.sellPrice, r.sellValue, r.buyCharges, r.sellCharges, r.gain, r.holdingDays, r.term].join(','));
  const sum = (f) => round(rows.reduce((s, r) => s + f(r), 0));
  lines.push('');
  lines.push(`Short-term gains (STCG),,,,,,,,,,${sum((r) => (r.term === 'STCG' ? r.gain : 0))}`);
  lines.push(`Long-term gains (LTCG),,,,,,,,,,${sum((r) => (r.term === 'LTCG' ? r.gain : 0))}`);
  lines.push(`Total charges,,,,,,,,,,${sum((r) => r.buyCharges + r.sellCharges)}`);
  lines.push(`"Financial year ${fy}-${String(Number(fy) + 1).slice(2)} · ${kind === 'paper' ? 'PAPER trades (not real)' : 'live trades placed by Pivot'} · buy price is the average cost of the position. Check against your Zerodha tax P&L before filing."`);
  return lines.join('\n');
}
