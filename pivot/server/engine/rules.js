// Trading rules shared by the live Executor agent and the Backtester, so the backtest
// measures exactly the strategy that runs live.

import { roundTick } from './indicators.js';
import { round } from './vcp.js';
import { DEFAULT_CONFIRM } from './confirm.js';

export const DEFAULT_RULES = {
  positionPct: 10, // % of total capital per stock
  maxPositions: 10,
  maxPerIndustry: 3,
  maxStopPct: 6, // never risk more than 6% below the buy price
  minStopPct: 3, // chart stops tighter than this are widened to 3% (avoid noise shake-outs)
  wideStopAction: 'skip', // 'skip' | 'cap'
  buyZonePct: 5, // buy only up to 5% above the pivot
  minVolPace: 1.5, // projected volume ≥ 1.5× 50-day average
  minMinutesAfterOpen: 10, // ignore the first 10 minutes' volume projection
  minScore: 65, // grade B or better
  pressureExtraScore: 10, // in an "uptrend under pressure" market, require +10 points
  partialAtPct: 10, // sell 1/3 at +10%
  partialFraction: 1 / 3,
  breakevenAfterPartial: true,
  trailMethod: 'ema21', // 'ema21' | 'pct10' | 'sma50' | 'none'
  trailPct: 10,
  reentry: { enabled: true, windowDays: 10, maxPerSetup: 2 },
  slippagePct: 0.1, // paper-trading and backtest slippage per side
  confirm: DEFAULT_CONFIRM, // breakout confirmation checks (see confirm.js)
  twoStage: { enabled: true, firstFraction: 0.5, addTime: '15:15' }, // half at the breakout, rest at 15:15 if it holds
  failedExit: { enabled: true, days: 2 }, // sell a new buy that closes back below the pivot within 2 days
};

/** Zerodha equity-delivery charges (NSE), per order side. */
export function deliveryCharges(side, qty, price) {
  const turnover = qty * price;
  const brokerage = 0;
  const stt = turnover * 0.001; // 0.1% on buy and sell
  const exch = turnover * 0.0000297;
  const sebi = turnover * 0.000001;
  const stamp = side === 'BUY' ? turnover * 0.00015 : 0;
  const dp = side === 'SELL' ? 15.93 : 0; // CDSL + Zerodha DP charge incl. GST (per scrip per day)
  const gst = 0.18 * (brokerage + exch + sebi);
  return round(stt + exch + sebi + stamp + gst + dp, 2);
}

/** Work out the protective stop for a buy at `entry`. Returns null if the setup must be skipped. */
export function computeStop(entry, chartStop, rules = DEFAULT_RULES) {
  const maxStop = entry * (1 - rules.maxStopPct / 100);
  const minStop = entry * (1 - rules.minStopPct / 100);
  let stop = chartStop ?? maxStop;
  let note = 'Below the last contraction low';
  if (stop < maxStop - 1e-9) {
    if (rules.wideStopAction === 'skip') return { skip: true, reason: `Chart stop ${round((1 - stop / entry) * 100, 1)}% away — more than your ${rules.maxStopPct}% limit` };
    stop = maxStop;
    note = `Capped at ${rules.maxStopPct}%`;
  }
  if (stop > minStop) {
    stop = minStop;
    note = `Widened to ${rules.minStopPct}% (chart stop was very tight)`;
  }
  stop = roundTick(stop, 0.05, 'down');
  return { stop, stopPct: round((1 - stop / entry) * 100, 2), note };
}

/** Quantity to buy: positionPct of total capital, limited by free cash. */
export function positionSize({ equity, cash, price, rules = DEFAULT_RULES }) {
  const target = (equity * rules.positionPct) / 100;
  const budget = Math.min(target, cash * 0.995); // keep a little for charges
  const qty = Math.floor(budget / price);
  return { qty, value: round(qty * price), target: round(target), limitedByCash: budget < target };
}

/** Can we open another position right now? */
export function capacityCheck({ openPositions, industry, rules = DEFAULT_RULES }) {
  if (openPositions.length >= rules.maxPositions) return { ok: false, reason: `Already holding ${rules.maxPositions} stocks (your maximum)` };
  const sameInd = openPositions.filter((p) => p.industry && p.industry === industry).length;
  if (industry && sameInd >= rules.maxPerIndustry) return { ok: false, reason: `Already ${sameInd} stocks in ${industry}` };
  return { ok: true };
}

/**
 * Decide what to do with an open position given the latest price.
 * Returns a list of actions: { type: 'stop' | 'partial' | 'trail' | 'raiseStop', qty, reason, newStop }
 * `ctx.isCloseCheck` = true near 15:20 for close-based trailing rules (EMA/SMA).
 */
export function managePosition(pos, price, ctx = {}, rules = DEFAULT_RULES) {
  const actions = [];
  if (pos.qtyOpen <= 0) return actions;

  // 1. Hard stop — always first, no confirmation.
  if (price <= pos.stop) {
    actions.push({ type: 'stop', qty: pos.qtyOpen, reason: pos.partialDone ? 'Breakeven/trailing stop hit' : `Stop-loss hit (${round((price / pos.entryPrice - 1) * 100, 1)}%)` });
    return actions;
  }

  // 2. Partial profit at +10%.
  const gainPct = (price / pos.entryPrice - 1) * 100;
  if (!pos.partialDone && gainPct >= rules.partialAtPct) {
    let q = Math.round(pos.qtyInitial * rules.partialFraction);
    if (pos.qtyOpen >= 2) q = Math.max(1, Math.min(q, pos.qtyOpen - 1));
    else q = 0;
    const newStop = rules.breakevenAfterPartial ? Math.max(pos.stop, roundTick(pos.entryPrice, 0.05, 'up')) : pos.stop;
    actions.push({ type: 'partial', qty: q, newStop, reason: `Up ${round(gainPct, 1)}% — booking ${q ? 'one third' : 'nothing (too few shares)'} and moving stop to breakeven` });
    return actions;
  }

  // 3. Trailing for the remainder (only after the partial is booked).
  if (pos.partialDone && rules.trailMethod !== 'none') {
    if (rules.trailMethod === 'pct10') {
      const hi = Math.max(pos.highest || price, price);
      const trail = roundTick(hi * (1 - rules.trailPct / 100), 0.05, 'down');
      if (trail > pos.stop) actions.push({ type: 'raiseStop', newStop: trail, reason: `Trailing stop raised to ₹${trail} (${rules.trailPct}% below high)` });
    } else if (ctx.isCloseCheck && ctx.trailLevel != null && price < ctx.trailLevel) {
      const name = rules.trailMethod === 'ema21' ? '21-day EMA' : '50-day average';
      actions.push({ type: 'trail', qty: pos.qtyOpen, reason: `Closing below the ${name} (₹${round(ctx.trailLevel)}) — exiting the rest` });
    }
  }
  return actions;
}

export function rMultiple(pos, exitPrice) {
  const risk = pos.entryPrice - pos.initialStop;
  return risk > 0 ? (exitPrice - pos.entryPrice) / risk : 0;
}
