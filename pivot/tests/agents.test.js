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
  ctx.updateSettings({ confirmTrades: false });
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

test('screener flags a breakout only with enough volume', async () => {
  const { ctx } = await setup();
  const sc = ctx.agents.screener;
  quote(ctx, 101, { volume: 5000 }); // weak volume at 10:30
  assert.equal(sc.scanMinute().length, 0);
  ctx.parent.newDay('2028-03-15');
  quote(ctx, 101, { volume: 150000 });
  const sig = sc.scanMinute();
  assert.equal(sig.length, 1);
  assert.equal(sig[0].type, 'breakout');
});
