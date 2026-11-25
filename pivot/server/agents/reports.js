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

