// What each agent is doing right now, in one short line each, for the live "agents at work" panel.
// Sent to the browser with every price push (every 2–3 seconds).
//
//   s     'busy' (doing work now) | 'watching' (on duty, waiting for something) | 'waiting' (needs you) | 'idle' (resting)
//   task  plain-English description of the current job
//   at    real time (ms) of the agent's last action, for "3s ago"
//   nextAt  real time (ms) of the next scheduled run, for a countdown (only when known)
//   progress  0–1 for long jobs (data download)

import { ist, toMinutes, MARKET, hhmm } from './time.js';

export function agentPulse(ctx) {
  const ag = ctx.agents;
  if (!ag?.parent) return null;
  const { parent, screener, analyst, executor } = ag;
  const { settings, db } = ctx;
  const t = ist(ctx.clock.now());
  const phase = parent.phase;
  const market = phase === 'market';
  const ready = parent.dataReady();
  const paused = !!settings.agentsPaused;
  const day = ctx.day || { jobs: {}, armed: new Map() };
  const next = nextJob(settings, t, phase);

  // ---- Parent
  let P;
  if (!ready) P = { s: 'waiting', task: 'Waiting for your daily Zerodha login' };
  else if (phase === 'holiday') P = { s: 'idle', task: 'Market holiday — resting. Stops stay in place' };
  else if (market) P = { s: 'busy', task: paused ? 'Running the day — new buys paused by you' : 'Running the trading day' };
  else if (phase === 'pre-market') P = { s: 'watching', task: 'Getting ready for the 09:15 open' };
  else P = { s: day.jobs.post === 'running' ? 'busy' : 'idle', task: day.jobs.post === 'running' ? 'Reviewing the day' : 'Day done — resting until tomorrow' };
  P.at = parent.lastBeat || null;
  if (next) P.next = next;

  // ---- Screener
  const sc = screener.status;
  const live = sc.live || {};
  let S;
  if (sc.progress) S = { s: 'busy', task: `Downloading Nifty 500 data · ${sc.progress.done} of ${sc.progress.total}`, progress: sc.progress.total ? sc.progress.done / sc.progress.total : null };
  else if (sc.state === 'preparing') S = { s: 'busy', task: 'Analysing the Nifty 500 — trend template, relative strength, VCP bases' };
  else if (market && ready && day.jobs.prep === 'done') {
    const armed = day.armed?.size || 0;
    const bits = [`Scanned ${live.scanned ?? 0} stocks${sc.lastScan ? ' at ' + ist(new Date(sc.lastScan)).hhmm : ''}`];
    if (live.near) bits.push(`${live.near} near pivot`);
    if (armed) bits.push(`${armed} being confirmed`);
    if (live.breakingOut) bits.push(`${live.breakingOut} in buy zone`);
    S = { s: 'busy', task: bits.join(' · ') };
    if (ctx.clock.kind !== 'sim') S.nextAt = Date.now() + (60 - (new Date().getSeconds() % 60)) * 1000;
  } else if (screener.backfilling) S = { s: 'busy', task: 'Filling in score history for the charts' };
  else S = { s: 'idle', task: `${sc.counts?.setups ?? 0} VCP setups on the watchlist${market ? '' : ` · next scan ${phase === 'pre-market' ? '09:15' : 'tomorrow'}`}` };
  S.at = sc.lastScanReal || null;

  // ---- Analyst
  const rated = db.get('SELECT COUNT(*) AS n FROM signals WHERE date = ?', t.date).n;
  const lastSig = rated ? db.get('SELECT symbol, score, grade FROM signals WHERE date = ? ORDER BY id DESC LIMIT 1', t.date) : null;
  let A;
  if (market && ready) A = { s: 'watching', task: rated ? `Rated ${rated} ${rated === 1 ? 'breakout' : 'breakouts'} today · last ${lastSig.symbol} ${lastSig.score}/100 (${lastSig.grade})` : 'Standing by to rate the next breakout' };
  else A = { s: 'idle', task: rated ? `Rated ${rated} ${rated === 1 ? 'breakout' : 'breakouts'} today` : 'Resting — rates breakouts during market hours' };
  A.at = analyst.status.lastRankReal || null;

  // ---- Executor
  const kind = executor.mode;
  const open = db.get("SELECT COUNT(*) AS n FROM positions WHERE kind = ? AND status = 'open'", kind).n;
  const pending = db.get("SELECT symbol FROM approvals WHERE status = 'pending' ORDER BY id DESC LIMIT 1");
  let E;
  if (pending) E = { s: 'waiting', task: `Waiting for your OK to buy ${pending.symbol}` };
  else if (market && ready && open) E = { s: 'busy', task: `Guarding ${open} ${open === 1 ? 'position' : 'positions'} · stops checked every second` };
  else if (market && ready) E = { s: 'watching', task: paused ? 'No open positions · new buys paused' : 'No open positions · ready to buy' };
  else E = { s: 'idle', task: open ? `${open} ${open === 1 ? 'position' : 'positions'} held${settings.backupGtt ? ' · backup GTT stops at Zerodha' : ''}` : 'Resting — no open positions' };
  E.at = executor.status.lastCheck || null;

  const feed = ctx.feed.status?.() || {};
  return { parent: P, screener: S, analyst: A, executor: E, feed: { live: market && !!feed.connected, lastTick: ctx.clock.kind === 'sim' ? (market ? Date.now() : null) : feed.lastTick || null } };
}

/** The next thing on today's schedule, e.g. { at: '15:15', label: 'Second-half buys' }. */
export function nextJob(settings, t, phase) {
  if (phase === 'holiday') return null;
  const s = settings.schedule || {};
  const jobs = [
    [s.login || '08:00', 'Login check'],
    [s.prep || '08:30', 'Morning scan'],
    [hhmm(MARKET.open), 'Market opens'],
    ...(settings.rules?.twoStage?.enabled !== false ? [[settings.rules?.twoStage?.addTime || '15:15', 'Second-half buys']] : []),
    [s.closeCheck || '15:20', 'Close check'],
    [hhmm(MARKET.close), 'Market closes'],
    [s.post || '15:40', 'Evening review'],
  ]
    .map(([at, label]) => ({ at, label, m: toMinutes(at) }))
    .sort((a, b) => a.m - b.m);
  const n = jobs.find((j) => j.m > t.minutes);
  return n ? { at: n.at, label: n.label } : { at: jobs[1].at, label: 'Morning scan tomorrow' };
}
