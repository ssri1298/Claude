import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime } from '../server/runtime.js';
import { istDate, toMinutes } from '../server/core/time.js';

async function setup() {
  const ctx = await createRuntime({ dbFile: ':memory:', demo: true, autostart: false });
  ctx.telegram?.stop();
  ctx.clock.set(istDate('2028-03-15', toMinutes('10:30')));
  ctx.db.run("INSERT OR REPLACE INTO universe(symbol,name,industry,token,tick) VALUES('TEST','Test Ltd','Tech',1,0.05)");
  const a = {
    symbol: 'TEST',
    name: 'Test Ltd',
    industry: 'Tech',
    token: 1,
    close: 99,
    rsRating: 95,
    sectorRs: 80,
    rsLineHigh: true,
    ema21: 90,
    sma50: 85,
    avgVol50: 100000,
    trend: { pass: true, passCount: 8, criteria: [], ma200SlopePct: 3, above200Pct: 20, fromHighPct: -2 },
    vcp: { valid: true, stage: 'near', count: 3, finalDepthPct: 4, contractions: [{ depthPct: 20 }, { depthPct: 10 }, { depthPct: 4 }], pivot: 100, stop: 95.5, lastLow: 96, stopPct: 4.5, lastVolRatio: 0.5, dryUpDays: 4, upDownVol: 1.6, depthPct: 20, baseBars: 40, priorAdvancePct: 60, higherLows: true, tightnessPct: 3, distToPivotPct: -1 },
    stage: 'near',
  };
  ctx.analysis = new Map([['TEST', a]]);
  ctx.market = { regime: 'uptrend', label: 'Confirmed uptrend' };
  ctx.parent.newDay('2028-03-15');
  return { ctx, a, ex: ctx.agents.executor, an: ctx.agents.analyst };
}

const quote = (ctx, ltp, extra = {}) => ctx.quotes.set(1, { token: 1, ltp, volume: 200000, prevClose: 99, high: ltp, low: 98, ...extra });
const signal = (a, price) => ({ type: 'breakout', symbol: 'TEST', a, price, pivot: 100, chartStop: 95.5, volPace: 2.2 });
const tick = async (ex, opts) => {
  await ex.onTick(opts);
  await new Promise((r) => setTimeout(r, 20));
};

test('approval → buy → ⅓ at +10% → breakeven → 21-EMA trailing exit', async () => {
  const { ctx, a, ex, an } = await setup();
  ctx.updateSettings({ rules: { twoStage: { enabled: false } } });
  quote(ctx, 101);
  const [s] = an.rank([signal(a, 101)]);
  assert.equal(s.status, 'ranked');
  assert.ok(s.score >= 65, `score ${s.score}`);
  await ex.consider(s);
  const ap = ctx.db.get("SELECT * FROM approvals WHERE status = 'pending'");
  assert.ok(ap, 'approval requested');
  const prop = JSON.parse(ap.data);
  assert.equal(prop.qty, Math.floor(50000 / prop.price), '10% of ₹5L');
  assert.ok(prop.stopPct <= 6);

  const msg = await ex.decide(ap.id, 'approve', 'test');
  assert.match(msg, /Buying/);
  await new Promise((r) => setTimeout(r, 20));
  let pos = ctx.db.get("SELECT * FROM positions WHERE kind = 'paper'");
  assert.equal(pos.status, 'open');
  const q0 = pos.qty_initial;

  quote(ctx, 112);
  await tick(ex);
  pos = ctx.db.get('SELECT * FROM positions WHERE id = ?', pos.id);
  assert.equal(pos.partial_done, 1);
  assert.equal(pos.qty_open, q0 - Math.round(q0 / 3));
  assert.ok(pos.stop >= pos.entry_price, 'stop moved to breakeven');

  // above breakeven but closes under the 21-EMA at the 15:20 check
  a.ema21 = 120;
  quote(ctx, 115);
  await tick(ex);
  assert.equal(ctx.db.get('SELECT status FROM positions WHERE id = ?', pos.id).status, 'open', 'no trail exit before the close check');
  await tick(ex, { isCloseCheck: true });
  pos = ctx.db.get('SELECT * FROM positions WHERE id = ?', pos.id);
  assert.equal(pos.status, 'closed');
  assert.equal(pos.exit_reason, 'trail');
  assert.ok(pos.realized > 0, 'profitable trade');
  assert.equal(ctx.db.all('SELECT * FROM fills WHERE position_id = ?', pos.id).length, 3);
});

test('stop-loss exits the whole position automatically', async () => {
  const { ctx, a, ex, an } = await setup();
  ctx.updateSettings({ confirmTrades: false, rules: { failedExit: { enabled: false } } });
  quote(ctx, 101);
  const [s] = an.rank([signal(a, 101)]);
  await ex.consider(s);
  await new Promise((r) => setTimeout(r, 20));
  let pos = ctx.db.get("SELECT * FROM positions WHERE kind = 'paper'");
  assert.ok(pos, 'auto-bought');
  quote(ctx, pos.stop - 0.5);
  await tick(ex);
  pos = ctx.db.get('SELECT * FROM positions WHERE id = ?', pos.id);
  assert.equal(pos.status, 'closed');
  assert.equal(pos.exit_reason, 'stop');
  const lossPct = pos.realized / (pos.entry_price * pos.qty_initial);
  assert.ok(lossPct > -0.07 && lossPct < 0, `loss ${lossPct}`);
});

test('no free capital → signal becomes a shadow trade', async () => {
  const { ctx, a, ex, an } = await setup();
  ctx.updateSettings({ paperCapital: 50 });
  quote(ctx, 101);
  const [s] = an.rank([signal(a, 101)]);
  await ex.consider(s);
  assert.equal(ctx.db.get("SELECT COUNT(*) AS n FROM positions WHERE kind = 'paper'").n, 0);
  assert.equal(ctx.db.get("SELECT COUNT(*) AS n FROM positions WHERE kind = 'shadow'").n, 1);
  assert.equal(ctx.db.get('SELECT status FROM signals WHERE id = ?', s.id).status, 'skipped_capital');
});

test('market correction pauses new buys', async () => {
  const { ctx, a, ex, an } = await setup();
  ctx.market = { regime: 'downtrend' };
  quote(ctx, 101);
  const [s] = an.rank([signal(a, 101)]);
  assert.equal(s.status, 'skipped_regime');
  await ex.consider(s);
  assert.equal(ctx.db.get("SELECT COUNT(*) AS n FROM approvals").n, 0);
});

test('approval expires when price runs past the buy zone', async () => {
  const { ctx, a, ex, an } = await setup();
  quote(ctx, 101);
  const [s] = an.rank([signal(a, 101)]);
  await ex.consider(s);
  quote(ctx, 106);
  ex.expireApprovals();
  assert.equal(ctx.db.get('SELECT status FROM approvals').status, 'expired');
});

test('screener flags a breakout only with enough volume (confirmation off)', async () => {
  const { ctx } = await setup();
  ctx.updateSettings({ rules: { confirm: { enabled: false } } });
  const sc = ctx.agents.screener;
  quote(ctx, 101, { volume: 5000 }); // weak volume at 10:30
  assert.equal(sc.scanMinute().length, 0);
  ctx.parent.newDay('2028-03-15');
  quote(ctx, 101, { volume: 150000 });
  const sig = sc.scanMinute();
  assert.equal(sig.length, 1);
  assert.equal(sig[0].type, 'breakout');
});

const at = (ctx, hhmm) => ctx.clock.set(istDate('2028-03-15', toMinutes(hhmm)));
const feedTick = (ctx, ltp, extra = {}) => {
  const t = { token: 1, ltp, volume: 200000, prevClose: 99, open: 99.5, high: Math.max(ltp, 100.6), low: 98, ...extra };
  ctx.quotes.set(1, t);
  ctx.intraday.onTicks([t]);
};

test('breakout must be confirmed: first tick only arms it, a 15-min close above the pivot confirms', async () => {
  const { ctx } = await setup();
  const sc = ctx.agents.screener;
  at(ctx, '10:31'); // bucket 5 (10:30–10:45)
  feedTick(ctx, 100.5);
  assert.equal(sc.scanMinute().length, 0, 'first tick above the pivot is not enough');
  assert.ok(ctx.day.armed.has('TEST'));
  assert.equal(ctx.db.get("SELECT COUNT(*) AS n FROM positions WHERE kind = 'probe'").n, 1, 'probe opened to measure first-tick buying');
  at(ctx, '10:40');
  feedTick(ctx, 100.6);
  assert.equal(sc.scanMinute().length, 0, 'candle not closed yet');
  at(ctx, '10:46'); // 10:30–10:45 candle closed at 100.6 (above 100 × 1.003)
  feedTick(ctx, 100.7);
  const sig = sc.scanMinute();
  assert.equal(sig.length, 1);
  assert.equal(sig[0].checks.holdCandle, true);
  assert.equal(sig[0].checks.vwap, true);
  const probe = JSON.parse(ctx.db.get("SELECT setup FROM positions WHERE kind = 'probe'").setup);
  assert.equal(probe.confirmed, true);
});

test('a poke above the pivot that falls back is a false alarm — no signal', async () => {
  const { ctx } = await setup();
  const sc = ctx.agents.screener;
  at(ctx, '10:31');
  feedTick(ctx, 100.5);
  sc.scanMinute();
  at(ctx, '10:38');
  feedTick(ctx, 99.6);
  sc.scanMinute();
  assert.equal(ctx.day.armed.has('TEST'), false, 'disarmed');
  at(ctx, '10:46');
  feedTick(ctx, 99.7);
  assert.equal(sc.scanMinute().length, 0);
  assert.ok(ctx.db.get("SELECT id FROM events WHERE message LIKE '%false alarm avoided%'"));
});

test('two-stage buy: half now, the rest at 15:15 only if the breakout holds', async () => {
  const { ctx, a, ex, an } = await setup();
  ctx.updateSettings({ confirmTrades: false });
  quote(ctx, 101);
  const [s] = an.rank([signal(a, 101)]);
  await ex.consider(s);
  await new Promise((r) => setTimeout(r, 20));
  let pos = ctx.db.get("SELECT * FROM positions WHERE kind = 'paper'");
  const full = Math.floor(50000 / 101.2);
  assert.ok(Math.abs(pos.qty_initial - Math.floor(full / 2)) <= 1, `first half (${pos.qty_initial} of ~${full})`);
  at(ctx, '15:15');
  quote(ctx, 102.5, { volume: 400000 });
  await ex.stageTwo();
  pos = ctx.db.get('SELECT * FROM positions WHERE id = ?', pos.id);
  assert.ok(pos.qty_initial >= full - 2, `full size after the add (${pos.qty_initial})`);
  assert.ok(pos.entry_price > 101 && pos.entry_price < 102.7, 'average entry');
  assert.equal(JSON.parse(pos.setup).stage, 2);
});

test('two-stage buy skips the second part when the breakout fails', async () => {
  const { ctx, a, ex, an } = await setup();
  ctx.updateSettings({ confirmTrades: false });
  quote(ctx, 101);
  const [s] = an.rank([signal(a, 101)]);
  await ex.consider(s);
  await new Promise((r) => setTimeout(r, 20));
  const q0 = ctx.db.get("SELECT qty_initial FROM positions WHERE kind = 'paper'").qty_initial;
  at(ctx, '15:15');
  quote(ctx, 99.5);
  await ex.stageTwo();
  const pos = ctx.db.get("SELECT * FROM positions WHERE kind = 'paper'");
  assert.equal(pos.qty_initial, q0);
  assert.equal(JSON.parse(pos.setup).stage, 0);
});

test('failed-breakout exit: closing back below the pivot sells early', async () => {
  const { ctx, a, ex, an } = await setup();
  ctx.updateSettings({ confirmTrades: false });
  quote(ctx, 101);
  const [s] = an.rank([signal(a, 101)]);
  await ex.consider(s);
  await new Promise((r) => setTimeout(r, 20));
  at(ctx, '15:20');
  quote(ctx, 99.2); // below pivot 100, above the stop
  await tick(ex, { isCloseCheck: true });
  const pos = ctx.db.get("SELECT * FROM positions WHERE kind = 'paper'");
  assert.equal(pos.status, 'closed');
  assert.equal(pos.exit_reason, 'failed');
  const loss = pos.realized / (pos.entry_price * pos.qty_initial);
  assert.ok(loss > -0.03, `small loss (${(loss * 100).toFixed(2)}%)`);
});

test('time exit: no stop and no +10% within 7 trading days → sold at the close', async () => {
  const { ctx, a, ex, an } = await setup();
  ctx.updateSettings({ confirmTrades: false, rules: { twoStage: { enabled: false } } });
  quote(ctx, 101);
  const [s] = an.rank([signal(a, 101)]);
  await ex.consider(s);
  await new Promise((r) => setTimeout(r, 20));
  const pos0 = ctx.db.get("SELECT * FROM positions WHERE kind = 'paper'");
  // 6 trading days later: still open
  ctx.clock.set(istDate('2028-03-23', toMinutes('15:20')));
  quote(ctx, 103);
  await tick(ex, { isCloseCheck: true });
  assert.equal(ctx.db.get('SELECT status FROM positions WHERE id = ?', pos0.id).status, 'open');
  // 7 trading days later: time exit
  ctx.clock.set(istDate('2028-03-24', toMinutes('15:20')));
  await tick(ex, { isCloseCheck: true });
  const pos = ctx.db.get('SELECT * FROM positions WHERE id = ?', pos0.id);
  assert.equal(pos.status, 'closed');
  assert.equal(pos.exit_reason, 'time');
});

test('morning Kite login reminder: at the chosen time, repeated, not on holidays, can be switched off', async () => {
  const { SimClock } = await import('../server/core/time.js');
  const ctx = await createRuntime({ dbFile: ':memory:', demo: false, autostart: false });
  ctx.telegram?.stop();
  ctx.clock = new SimClock(istDate('2028-03-15', toMinutes('07:59')));
  ctx.bus.clock = ctx.clock;
  const sent = [];
  ctx.notify = async (type, text) => sent.push([type, text]);
  const at = async (hhmm) => {
    ctx.clock.set(istDate('2028-03-15', toMinutes(hhmm)));
    await ctx.parent.tick();
  };
  await at('07:59');
  assert.equal(sent.length, 0);
  await at('08:00');
  assert.equal(sent.length, 1);
  assert.equal(sent[0][0], 'login');
  await at('08:30');
  assert.equal(sent.length, 1, 'no spam in between');
  await at('08:45');
  await at('09:10');
  assert.equal(sent.length, 3, 'reminded again at 08:45 and 09:10');
  // a market holiday: nothing
  ctx.updateSettings({ holidays: ['2028-03-16'] });
  ctx.clock.set(istDate('2028-03-16', toMinutes('08:00')));
  await ctx.parent.tick();
  assert.equal(sent.length, 3);
  // custom time
  ctx.updateSettings({ schedule: { login: '07:30' } });
  ctx.clock.set(istDate('2028-03-17', toMinutes('07:30')));
  await ctx.parent.tick();
  assert.equal(sent.length, 4);
  ctx.stop();
});

test('overrule: blocked stocks are never bought; you can buy a skipped signal anyway', async () => {
  const { ctx, a, ex, an } = await setup();
  const { setBlocked } = await import('../server/core/overrides.js');
  ctx.updateSettings({ confirmTrades: false, rules: { twoStage: { enabled: false } } });
  quote(ctx, 101);
  setBlocked(ctx.db, 'TEST', true);
  const [s] = an.rank([signal(a, 101)]);
  assert.equal(s.status, 'skipped_blocked');
  await ex.consider(s);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(ctx.db.get("SELECT COUNT(*) AS n FROM positions WHERE kind = 'paper'").n, 0);

  // Market correction would pause buys — you buy it anyway
  setBlocked(ctx.db, 'TEST', false);
  ctx.market = { regime: 'downtrend' };
  ctx.updateSettings({ marketFilter: 'pause' });
  ctx.parent.phase = 'market';
  const [s2] = an.rank([signal(a, 101)]);
  assert.equal(s2.status, 'skipped_regime');
  await ex.consider(s2);
  const res = await ex.overruleBuy({ signalId: s2.id });
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(res.qty > 0);
  const pos = ctx.db.get("SELECT * FROM positions WHERE kind = 'paper' AND status = 'open'");
  assert.ok(pos, 'bought despite the correction');
  assert.ok(pos.stop < pos.entry_price);
  assert.equal(ctx.db.get('SELECT status FROM signals WHERE id = ?', s2.id).status, 'overruled');
  assert.ok(ctx.db.get("SELECT id FROM events WHERE agent = 'You'"), 'logged as your overrule');
  // can't buy twice
  await assert.rejects(ex.overruleBuy({ symbol: 'TEST' }), /already hold/);
});

test('overrule: switching off the time exit keeps the position; the stop still works', async () => {
  const { ctx, a, ex, an } = await setup();
  const { setPositionHold } = await import('../server/core/overrides.js');
  ctx.updateSettings({ confirmTrades: false, rules: { twoStage: { enabled: false } } });
  quote(ctx, 101);
  const [s] = an.rank([signal(a, 101)]);
  await ex.consider(s);
  await new Promise((r) => setTimeout(r, 20));
  const pos0 = ctx.db.get("SELECT * FROM positions WHERE kind = 'paper'");
  setPositionHold(ctx.db, pos0.id, 'noTimeExit', true);
  setPositionHold(ctx.db, pos0.id, 'noFailedExit', true);
  ctx.clock.set(istDate('2028-03-28', toMinutes('15:20')));
  quote(ctx, 99);
  await tick(ex, { isCloseCheck: true });
  assert.equal(ctx.db.get('SELECT status FROM positions WHERE id = ?', pos0.id).status, 'open', 'held past the time exit');
  quote(ctx, pos0.stop - 0.5);
  await tick(ex, {});
  const pos = ctx.db.get('SELECT * FROM positions WHERE id = ?', pos0.id);
  assert.equal(pos.exit_reason, 'stop', 'stop-loss is never switched off');
});

test('overrule: no partial sale at +10% when you switch it off', async () => {
  const { ctx, a, ex, an } = await setup();
  const { setPositionHold } = await import('../server/core/overrides.js');
  ctx.updateSettings({ confirmTrades: false, rules: { twoStage: { enabled: false } } });
  quote(ctx, 101);
  const [s] = an.rank([signal(a, 101)]);
  await ex.consider(s);
  await new Promise((r) => setTimeout(r, 20));
  const pos0 = ctx.db.get("SELECT * FROM positions WHERE kind = 'paper'");
  setPositionHold(ctx.db, pos0.id, 'noPartial', true);
  quote(ctx, pos0.entry_price * 1.12);
  await tick(ex, {});
  const pos = ctx.db.get('SELECT * FROM positions WHERE id = ?', pos0.id);
  assert.equal(pos.partial_done, 0);
  assert.equal(pos.qty_open, pos0.qty_open);
});

test('erase paper data: paper and (optionally) shadow trades go, live trades stay', async () => {
  const express = (await import('express')).default;
  const { mountApi } = await import('../server/api.js');
  const { ctx } = await setup();
  const ins = (kind, status) => ctx.db.insert('positions', { kind, symbol: 'TEST', token: 1, status, entry_date: '2028-03-10', entry_price: 100, qty_initial: 5, qty_open: status === 'open' ? 5 : 0, stop: 95 });
  const p1 = ins('paper', 'open');
  ins('paper', 'closed');
  ins('shadow', 'open');
  const live = ins('live', 'closed');
  ctx.db.insert('fills', { position_id: p1, side: 'BUY', qty: 5, price: 100 });
  ctx.db.insert('equity', { date: '2028-03-10', kind: 'paper', equity: 500000 });
  const app = express();
  app.use(express.json());
  mountApi(app, ctx, { valid: () => true, hasPassword: () => true, throttle: () => false }, {});
  const srv = app.listen(0);
  const url = `http://127.0.0.1:${srv.address().port}/api`;
  try {
    const sum = await (await fetch(url + '/paper/summary')).json();
    assert.deepEqual([sum.open, sum.closed, sum.shadow], [1, 1, 1]);
    const bad = await fetch(url + '/paper/erase', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(bad.status, 400, 'needs confirmation');
    const r = await (await fetch(url + '/paper/erase', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: 'ERASE' }) })).json();
    assert.ok(r.ok);
    assert.equal(ctx.db.get("SELECT COUNT(*) AS n FROM positions WHERE kind = 'paper'").n, 0);
    assert.equal(ctx.db.get("SELECT COUNT(*) AS n FROM positions WHERE kind = 'shadow'").n, 1, 'shadow kept unless asked');
    assert.equal(ctx.db.get('SELECT COUNT(*) AS n FROM fills').n, 0);
    assert.equal(ctx.db.get("SELECT COUNT(*) AS n FROM equity WHERE kind = 'paper'").n, 0);
    assert.ok(ctx.db.get('SELECT id FROM positions WHERE id = ?', live), 'live trade untouched');
    await fetch(url + '/paper/erase', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: 'ERASE', includeShadow: true }) });
    assert.equal(ctx.db.get("SELECT COUNT(*) AS n FROM positions WHERE kind = 'shadow'").n, 0);
    const cap = await ctx.agents.executor.capital('paper');
    assert.equal(cap.equity, ctx.settings.paperCapital, 'paper account back to the starting capital');
  } finally {
    srv.close();
  }
});

test('morning and evening reports are built, saved once per day and listed', async () => {
  const { ctx, a, ex, an } = await setup();
  const { buildMorning, buildEvening, saveReport, morningText, eveningText } = await import('../server/agents/reports.js');
  ctx.updateSettings({ confirmTrades: false, rules: { twoStage: { enabled: false } } });
  quote(ctx, 101);
  const [s] = an.rank([signal(a, 101)]);
  await ex.consider(s);
  await new Promise((r) => setTimeout(r, 20));
  const m = await buildMorning(ctx);
  assert.equal(m.type, 'morning');
  assert.equal(m.positions.length, 1);
  assert.equal(m.positions[0].symbol, 'TEST');
  assert.ok(m.positions[0].watch.some((w) => /Time exit/.test(w)));
  assert.equal(m.top[0].symbol, 'TEST');
  assert.match(morningText(m), /Morning brief/);
  saveReport(ctx.db, m);
  saveReport(ctx.db, { ...m, counts: { ...m.counts, setups: 99 } });
  assert.equal(ctx.db.get("SELECT COUNT(*) AS n FROM reports WHERE type = 'morning'").n, 1, 'one per day — refreshed, not duplicated');
  assert.equal(JSON.parse(ctx.db.get("SELECT data FROM reports WHERE type = 'morning'").data).counts.setups, 99);

  const e = await buildEvening(ctx);
  assert.equal(e.buys.length, 1);
  assert.equal(e.buys[0].symbol, 'TEST');
  assert.equal(e.signals.bought.length, 1);
  assert.match(eveningText(e), /Evening report/);
});

test('stock filters: results soon, surveillance, tight band and low turnover block new buys', async () => {
  const { ctx, a, an } = await setup();
  const { filterBlock } = await import('../server/core/stockflags.js');
  const date = '2028-03-15';
  ctx.flags = { results: {}, surveillance: {}, bands: {}, fno: new Set() };
  a.turnoverCr = 50;
  assert.equal(filterBlock(ctx, a, date), null);
  ctx.flags.results.TEST = '2028-03-17';
  assert.equal(filterBlock(ctx, a, date).code, 'results');
  quote(ctx, 101);
  const [s] = an.rank([signal(a, 101)]);
  assert.equal(s.status, 'skipped_results');
  ctx.flags.results = {};
  ctx.flags.surveillance.TEST = 'ASM (short term)';
  assert.equal(filterBlock(ctx, a, date).code, 'surveillance');
  ctx.flags.surveillance = {};
  ctx.flags.bands.TEST = 5;
  assert.equal(filterBlock(ctx, a, date).code, 'band');
  ctx.flags.fno.add('TEST');
  assert.equal(filterBlock(ctx, a, date), null, 'F&O stocks have no fixed band');
  a.turnoverCr = 3;
  assert.equal(filterBlock(ctx, a, date).code, 'liquidity');
  ctx.updateSettings({ rules: { filters: { minTurnoverCr: 0 } } });
  assert.equal(filterBlock(ctx, a, date), null);
});

test('weekly report, tax statement and journal from real trades', async () => {
  const { ctx, a, ex, an } = await setup();
  const { buildPeriodReport, taxRows, taxCsv, periodText } = await import('../server/agents/reports.js');
  ctx.updateSettings({ confirmTrades: false, rules: { twoStage: { enabled: false } } });
  quote(ctx, 101);
  const [s] = an.rank([signal(a, 101)]);
  await ex.consider(s);
  await new Promise((r) => setTimeout(r, 20));
  const pos = ctx.db.get("SELECT * FROM positions WHERE kind = 'paper'");
  ctx.db.insert('journal', { position_id: pos.id, symbol: 'TEST', ts: new Date().toISOString(), date: '2028-03-15', text: 'Clean breakout', tags: JSON.stringify(['Followed the rules']) });
  quote(ctx, pos.stop - 1);
  await tick(ex, {});
  const w = buildPeriodReport(ctx, 'week', '2028-03-15');
  assert.equal(w.from, '2028-03-13');
  assert.equal(w.to, '2028-03-19');
  assert.equal(w.closed.length, 1);
  assert.ok(w.stats.booked < 0);
  assert.equal(w.journal.length, 1);
  assert.match(periodText(w), /Weekly report/);
  const rows = taxRows(ctx, '2027', 'paper');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].term, 'STCG');
  assert.ok(rows[0].gain < 0);
  assert.match(taxCsv(rows, '2027', 'paper'), /Short-term gains/);
});

test('watchdog: backups leave secrets out; period ends detected', async () => {
  const { mkdtempSync, existsSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { DatabaseSync } = await import('node:sqlite');
  const { createWatchdog, periodEnds } = await import('../server/core/watchdog.js');
  const { ctx } = await setup();
  ctx.db.kvSet('secrets', { kiteApiSecret: 'top-secret' });
  ctx.db.run("INSERT INTO candles(token, date, open, high, low, close, volume) VALUES (1, '2028-03-14', 1, 1, 1, 1, 1)");
  const dir = mkdtempSync(join(tmpdir(), 'pivot-'));
  const wd = createWatchdog(ctx, { dataDir: dir });
  const b = await wd.backup();
  const small = join(dir, 'backups', b.small);
  assert.ok(existsSync(small) && existsSync(join(dir, 'backups', b.full)));
  const sdb = new DatabaseSync(small);
  assert.equal(sdb.prepare("SELECT COUNT(*) AS n FROM kv WHERE key = 'secrets'").get().n, 0, 'no secrets in the portable copy');
  assert.equal(sdb.prepare('SELECT COUNT(*) AS n FROM candles').get().n, 0, 'no market data');
  sdb.close();
  assert.deepEqual(periodEnds('2028-03-17', '2028-03-20'), { week: true, month: false }); // Fri → Mon
  assert.deepEqual(periodEnds('2028-03-31', '2028-04-03'), { week: true, month: true });
  assert.deepEqual(periodEnds('2028-03-15', '2028-03-16'), { week: false, month: false });
});

test('buy requests: buy half, remind me in 15 minutes', async () => {
  const { ctx, a, ex, an } = await setup();
  ctx.updateSettings({ rules: { twoStage: { enabled: false } } });
  quote(ctx, 101);
  const [s] = an.rank([signal(a, 101)]);
  await ex.consider(s);
  const ap = ctx.db.get("SELECT * FROM approvals WHERE status = 'pending'");
  const full = JSON.parse(ap.data).qty;
  const msg = await ex.decide(ap.id, 'snooze', 'test');
  assert.match(msg, /ask again/);
  const snoozed = ctx.db.get('SELECT * FROM approvals WHERE id = ?', ap.id);
  assert.equal(snoozed.status, 'pending');
  assert.ok(JSON.parse(snoozed.data).remindAt);
  const sent = [];
  ctx.notify = async (type, text) => sent.push(type + ':' + text);
  ctx.clock.set(new Date(ctx.clock.now().getTime() + 16 * 60000));
  ex.expireApprovals();
  assert.ok(sent.some((x) => /Reminder/.test(x)), 'reminded after 15 minutes');
  await ex.decide(ap.id, 'half', 'test');
  await new Promise((r) => setTimeout(r, 20));
  const pos = ctx.db.get("SELECT * FROM positions WHERE kind = 'paper'");
  assert.equal(pos.qty_initial, Math.floor(full / 2));
});

test('price alerts fire once when the price crosses', async () => {
  const { ctx } = await setup();
  const { loadAlerts, checkAlerts } = await import('../server/core/alerts.js');
  ctx.db.insert('alerts', { symbol: 'TEST', token: 1, op: 'above', price: 105, created: new Date().toISOString(), active: 1 });
  loadAlerts(ctx);
  const sent = [];
  ctx.notify = async (type, text) => sent.push(type);
  quote(ctx, 104);
  assert.equal(checkAlerts(ctx).length, 0);
  quote(ctx, 105.5);
  assert.equal(checkAlerts(ctx).length, 1);
  assert.deepEqual(sent, ['alerts']);
  assert.equal(checkAlerts(ctx).length, 0, 'fires once');
  assert.equal(ctx.db.get('SELECT active FROM alerts').active, 0);
});

test('why-not checklist explains what stops a buy', async () => {
  const { ctx, a } = await setup();
  const { whyNot } = await import('../server/core/whynot.js');
  quote(ctx, 99);
  ctx.flags = { results: {}, surveillance: {}, bands: {}, fno: new Set() };
  let w = await whyNot(ctx, 'TEST');
  assert.match(w.verdict, /Ready/);
  a.score = 40;
  w = await whyNot(ctx, 'TEST');
  assert.match(w.verdict, /setup score/);
  assert.ok(w.items.some((i) => i.label === 'Setup score' && !i.ok));
});
