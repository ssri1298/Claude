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
