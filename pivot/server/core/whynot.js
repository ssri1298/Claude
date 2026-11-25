// "Why didn't Pivot buy this?" — walks through every rule for one stock, in the order the agents
// apply them, and says which ones pass and which one stops the buy.

import { ist, MARKET } from './time.js';
import { filterBlock } from './stockflags.js';
import { getOverrides } from './overrides.js';
import { capacityCheck } from '../engine/rules.js';
import { scoreSetup } from '../engine/scoring.js';

const r1 = (x) => Math.round(x * 10) / 10;

export async function whyNot(ctx, symbol) {
  const a = ctx.analysis?.get(symbol);
  const s = ctx.settings;
  const R = s.rules;
  const t = ist(ctx.clock.now());
  const items = [];
  const add = (ok, label, detail, level = ok ? 'ok' : 'stop') => items.push({ ok, level, label, detail });
  if (!a) return { verdict: 'Pivot has no analysis for this stock yet (not in the Nifty 500 list or no data).', items };

  // 1. Setup
  const tp = a.trend?.passCount ?? 0;
  add(!!a.trend?.pass, 'Minervini trend template', a.trend?.pass ? `All 8 criteria pass (RS ${a.rsRating})` : `${tp} of 8 pass — fails: ${(a.trend?.criteria || []).filter((c) => !c.pass).map((c) => c.label).join('; ')}`);
  add(!!a.vcp?.valid, 'Volatility contraction (VCP) base', a.vcp?.valid ? `${a.vcp.count || a.vcp.contractions?.length} contractions, last ${a.vcp.finalDepthPct}% deep, pivot ₹${a.vcp.pivot}` : a.vcp?.reasons?.[0] || 'No valid base');
  const live = ctx.live?.get(symbol);
  const ltp = ctx.quotes?.get(a.token)?.ltp ?? live?.ltp ?? a.close;
  const pivot = a.vcp?.pivot;
  if (pivot) {
    const dist = (ltp / pivot - 1) * 100;
    const zoneTop = R.buyZonePct;
    if (dist > zoneTop) add(false, 'Price vs pivot', `${r1(dist)}% above the pivot — more than your ${zoneTop}% buy zone, too extended to chase`);
    else if (dist > 0) add(true, 'Price vs pivot', `${r1(dist)}% above the pivot — inside the buy zone`);
    else add(true, 'Price vs pivot', `${r1(-dist)}% below the pivot — waiting for a breakout`, 'wait');
  }

  // 2. Rating
  const regime = ctx.market?.regime || 'unknown';
  const min = R.minScore + (regime === 'pressure' ? R.pressureExtraScore : 0);
  const sc = a.score != null ? { score: a.score, grade: a.grade } : scoreSetup(a);
  add(sc.score >= min, 'Setup score', `${sc.score}/100 (${sc.grade}) — your minimum is ${min}${regime === 'pressure' ? ' (raised: market under pressure)' : ''}`);

  // 3. Filters & market
  const fb = filterBlock(ctx, a, t.date);
  add(!fb, 'Stock filters', fb ? fb.reason : 'No results due, not under surveillance, normal circuit band, enough turnover');
  const ov = getOverrides(ctx.db);
  if (ov.blocked[symbol]) add(false, 'Your block list', 'You blocked this stock on the Overrule page');
  const corrOk = ov.allowCorrectionBuys === t.date;
  if (regime === 'downtrend' && s.marketFilter === 'pause' && !corrOk) add(false, 'Market filter', `Market is in a correction — new buys paused (${ctx.market?.label})`);
  else add(true, 'Market filter', `${ctx.market?.label || 'Unknown'}${regime === 'downtrend' && s.marketFilter === 'half' ? ' — half-size positions' : ''}${corrOk ? ' — you allowed buys today' : ''}`);
  if (s.agentsPaused) add(false, 'Agents', 'You paused new buys');

  // 4. Today's breakout
  const day = ctx.day || {};
  const minutes = t.minutes - MARKET.open;
  if (ctx.parent?.phase === 'market' && pivot) {
    const pace = live?.volPace;
    if (ltp > pivot) {
      add(pace != null && pace >= R.minVolPace, 'Breakout volume', pace != null ? `Projected ${r1(pace)}× the 50-day average (need ${R.minVolPace}×)` : 'Not measured yet', pace != null && pace >= R.minVolPace ? 'ok' : 'wait');
      if (R.confirm?.enabled) {
        const armed = day.armed?.get?.(symbol);
        const sig = day.signaled?.has?.(symbol);
        add(!!sig, 'Breakout confirmation', sig ? 'Confirmed today' : armed ? `Crossed the pivot at ${armed.price} — waiting for the 15-minute close, VWAP and range checks` : minutes < R.minMinutesAfterOpen ? `Waits ${R.minMinutesAfterOpen} minutes after the open` : 'Not armed yet', sig ? 'ok' : 'wait');
      }
    }
  } else if (pivot) add(true, 'Breakout', 'Checked every minute between 09:15 and 15:30', 'wait');

  // 5. Your account
  const kind = ctx.agents.executor.mode;
  const held = ctx.db.get("SELECT id FROM positions WHERE symbol = ? AND kind = ? AND status = 'open'", symbol, kind);
  if (held) add(false, 'Already holding', 'You already own this stock', 'info');
  if (ctx.db.get("SELECT id FROM approvals WHERE symbol = ? AND status = 'pending'", symbol)) add(true, 'Waiting for you', 'A buy request is waiting for your approval on the Today page', 'wait');
  const open = ctx.agents.executor.openPositions(kind);
  const cap = capacityCheck({ openPositions: open, industry: a.industry, rules: R });
  add(cap.ok, 'Position limits', cap.ok ? `${open.length} of ${R.maxPositions} positions used` : cap.reason);
  try {
    const c = await ctx.agents.executor.capital(kind);
    add(c.cash >= ltp, 'Free cash', `₹${Math.round(c.cash).toLocaleString('en-IN')} free`);
  } catch {}

  const stop = items.find((i) => !i.ok && i.level === 'stop');
  const waiting = items.find((i) => i.level === 'wait');
  const verdict = held
    ? 'You already hold this stock — the Executor is managing it.'
    : stop
      ? `Not a buy right now: ${stop.label.toLowerCase()} — ${stop.detail}.`
      : waiting
        ? `Ready — Pivot will buy on a confirmed breakout above ₹${pivot} (${waiting.label.toLowerCase()}: ${waiting.detail}).`
        : 'Every rule passes — Pivot buys (or asks you) on the next confirmed breakout.';
  return { verdict, items };
}
