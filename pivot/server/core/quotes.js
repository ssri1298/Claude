// Live price snapshots for the browser: Nifty 50 + every tracked stock, pushed every 2.5 seconds,
// together with a one-line status for each agent (the "agents at work" panel).

import { agentPulse } from './pulse.js';

const INDEX_TOKEN = 256265; // NIFTY 50 (same token in demo mode)
const r2 = (x) => Math.round(x * 100) / 100;

export function indexSnapshot(ctx) {
  const q = ctx.quotes.get(INDEX_TOKEN);
  if (q?.ltp) {
    const prev = q.prevClose || q.ltp;
    return { ltp: r2(q.ltp), prevClose: r2(prev), change: r2(q.ltp - prev), changePct: r2((q.ltp / prev - 1) * 100), live: true };
  }
  // Not connected yet: fall back to the last two stored daily closes
  const rows = ctx.db.all('SELECT close FROM candles WHERE token = ? ORDER BY date DESC LIMIT 2', INDEX_TOKEN);
  if (!rows.length) return null;
  const ltp = rows[0].close;
  const prev = rows[1]?.close || ltp;
  return { ltp: r2(ltp), prevClose: r2(prev), change: r2(ltp - prev), changePct: r2((ltp / prev - 1) * 100), live: false };
}

/** { SYMBOL: [ltp, changePct] } for all analysed stocks that have a live quote. */
export function stockSnapshot(ctx) {
  const out = {};
  for (const a of ctx.analysis.values()) {
    const q = ctx.quotes.get(a.token);
    if (!q?.ltp) continue;
    const prev = q.prevClose || a.close;
    out[a.symbol] = [r2(q.ltp), prev ? r2((q.ltp / prev - 1) * 100) : 0];
  }
  return out;
}

export const PUSH_EVERY_MS = 2500;

/** Push only what changed, every 2.5 seconds, while at least one browser is connected. */
export function startQuotePusher(ctx) {
  let last = {};
  let lastIdx = null;
  let lastPhase = null;
  let lastPulse = '';
  return setInterval(() => {
    if (ctx.bus.listenerCount('push') === 0) return;
    const snap = stockSnapshot(ctx);
    const changed = {};
    for (const [s, v] of Object.entries(snap)) if (!last[s] || last[s][0] !== v[0]) changed[s] = v;
    const idx = indexSnapshot(ctx);
    const idxChanged = idx && (!lastIdx || lastIdx.ltp !== idx.ltp);
    const phaseChanged = ctx.parent?.phase !== lastPhase;
    lastPhase = ctx.parent?.phase;
    const agents = agentPulse(ctx);
    const pulseKey = JSON.stringify(agents);
    const pulseChanged = pulseKey !== lastPulse;
    lastPulse = pulseKey;
    if (!Object.keys(changed).length && !idxChanged && !phaseChanged && !pulseChanged) return;
    last = snap;
    lastIdx = idx;
    ctx.bus.push('quotes', { t: Date.now(), index: idx, q: changed, phase: ctx.parent?.phase, agents });
  }, PUSH_EVERY_MS);
}
