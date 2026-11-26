// SUB-AGENT 3 — EXECUTOR (capital & risk manager)
// Sizes each trade (10% of capital by default), sets the stop (chart-based, max 6%), asks you to
// approve (or buys automatically when you turn that on), places the order and a backup GTT stop,
// then manages every open position tick by tick: stop-loss, one-third profit at +10%, breakeven
// stop, and the 21-EMA trailing exit. With no free capital, it records the signal as a
// "shadow trade" so you can see later how the idea would have worked.

import { computeStop, positionSize, capacityCheck, managePosition, winnerState, deliveryCharges, rMultiple } from '../engine/rules.js';
import { emaNext, roundTick } from '../engine/indicators.js';
import { round } from '../engine/vcp.js';
import { ist, tradingDaysBetween, MARKET } from '../core/time.js';
import { volumePace } from '../engine/market.js';
import { esc } from '../notify/telegram.js';
import { describeChecks } from '../engine/confirm.js';
import { getOverrides, isBlocked } from '../core/overrides.js';

const NAME = 'Executor';
const inr = (x) => '₹' + Number(x).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export class Executor {
  constructor(ctx) {
    this.ctx = ctx;
    this.busy = new Set(); // position ids / symbols with an order in flight
    this.retryAt = new Map();
    this.failures = new Map();
    this.status = { state: 'idle', lastAction: null };
  }

  log(msg, level, data) {
    this.ctx.bus.log(NAME, msg, { level, data });
  }

  get mode() {
    return this.ctx.settings.tradingMode === 'live' ? 'live' : 'paper';
  }

  now() {
    return this.ctx.clock.now();
  }

  // ------------------------------------------------------------------ capital
  openPositions(kind = this.mode) {
    return this.ctx.db.all("SELECT * FROM positions WHERE kind = ? AND status = 'open'", kind);
  }

  ltpOf(symbol, fallback) {
    const a = this.ctx.analysis?.get(symbol);
    const q = a && this.ctx.quotes.get(a.token);
    return q?.ltp || fallback;
  }

  async capital(kind = this.mode, { cachedMs = 0 } = {}) {
    const { db, settings } = this.ctx;
    const open = this.openPositions(kind);
    const marketValue = open.reduce((s, p) => s + p.qty_open * this.ltpOf(p.symbol, p.last_price || p.entry_price), 0);
    const costOpen = open.reduce((s, p) => s + p.qty_open * p.entry_price, 0);
    if (kind === 'live') {
      let cash = 0;
      try {
        cash = (await this.ctx.liveBroker.funds({ maxAgeMs: cachedMs })).cash;
      } catch (e) {
        this.log(`Could not read Kite funds: ${e.message}`, 'warn');
      }
      let equity = cash + marketValue;
      if (settings.capitalSource === 'fixed') {
        equity = settings.fixedCapital;
        cash = Math.min(cash, Math.max(0, settings.fixedCapital - costOpen));
      }
      return { equity: round(equity), cash: round(cash), invested: round(costOpen), marketValue: round(marketValue), openPnl: round(marketValue - costOpen) };
    }
    const realized = db.get('SELECT COALESCE(SUM(realized),0) AS r FROM positions WHERE kind = ?', kind).r;
    const start = settings.paperCapital;
    const cash = start + realized - costOpen;
    return { equity: round(cash + marketValue), cash: round(cash), invested: round(costOpen), marketValue: round(marketValue), openPnl: round(marketValue - costOpen), start, realized: round(realized) };
  }

  // ------------------------------------------------------------------ new signals
  /**
   * Decide what to do with a rated signal. With { force: true } (you overruled the agents from the
   * Overrule page) the score, market filter, pause, stop-width and position-count rules are skipped and
   * the order goes straight through — but there must still be enough cash for at least one share.
   */
  async consider(sig, { force = false } = {}) {
    const { db, settings, clock } = this.ctx;
    const rules = settings.rules;
    const kind = this.mode;
    const tick = this.tickOf(sig.symbol);
    const fail = (msg) => {
      if (force) throw Object.assign(new Error(msg), { status: 400 });
    };
    const entry = force ? roundTick(sig.price * 1.002, tick) : roundTick(Math.min(sig.price * 1.002, sig.pivot * (1 + rules.buyZonePct / 100)), tick);
    let stopRes = computeStop(entry, sig.chartStop, rules);
    if (force && (stopRes.skip || !stopRes.stop)) {
      const stop = roundTick(entry * (1 - rules.maxStopPct / 100), tick);
      stopRes = { stop, stopPct: round((1 - stop / entry) * 100, 1), note: `${rules.maxStopPct}% stop (chart stop too wide — your overrule)` };
    }

    const setShadow = (reason) => this.openShadow(sig, entry, stopRes.stop ?? roundTick(entry * (1 - rules.maxStopPct / 100), tick), reason);

    if (!force && sig.status !== 'ranked') {
      setShadow(sig.reason);
      return;
    }
    if (!force && isBlocked(db, sig.symbol)) {
      this.markSignal(sig.id, 'skipped_blocked', 'You blocked this stock');
      return;
    }
    if (!force && settings.agentsPaused) {
      this.markSignal(sig.id, 'skipped_paused', 'Agents are paused');
      setShadow('Agents paused');
      return;
    }
    if (!force && stopRes.skip) {
      this.markSignal(sig.id, 'skipped_stop', stopRes.reason);
      this.log(`${sig.symbol}: skipped — ${stopRes.reason}`, 'warn');
      return;
    }
    if (db.get("SELECT id FROM positions WHERE symbol = ? AND kind = ? AND status = 'open'", sig.symbol, kind)) {
      fail(`You already hold ${sig.symbol}`);
      this.markSignal(sig.id, 'skipped_held', 'Already holding this stock');
      return;
    }
    if (db.get("SELECT id FROM approvals WHERE symbol = ? AND status = 'pending'", sig.symbol)) return fail(`${sig.symbol} is already waiting for your approval on the Today page`);

    const open = this.openPositions(kind);
    const cap = capacityCheck({ openPositions: open, industry: sig.a.industry, rules });
    const capital = await this.capital(kind);
    const size = positionSize({ equity: sig.half ? capital.equity / 2 : capital.equity, cash: capital.cash, price: entry, stop: stopRes.stop, rules });
    if (force && size.qty < 1) fail(`Not enough free cash (${inr(capital.cash)} available)`);
    if (!force && (!cap.ok || size.qty < 1 || (size.limitedByCash && size.value < size.target * 0.5))) {
      const why = !cap.ok ? cap.reason : `Not enough free cash (${inr(capital.cash)} available, ${inr(size.target)} needed)`;
      this.markSignal(sig.id, 'skipped_capital', why);
      this.log(`${sig.symbol} (${sig.grade}) — ${why}. Tracking it as a shadow trade for future learning.`, 'warn');
      setShadow(why);
      return;
    }

    // Two-stage buy: part now, the rest at 15:15 only if the breakout holds
    const ts = rules.twoStage || {};
    const fullQty = size.qty;
    const firstQty = ts.enabled && fullQty >= 2 ? Math.max(1, Math.floor(fullQty * (ts.firstFraction || 0.5))) : fullQty;
    const plannedAdd = fullQty - firstQty;
    size.qty = firstQty;

    const proposal = {
      signalId: sig.id,
      type: sig.type,
      symbol: sig.symbol,
      token: sig.a.token,
      industry: sig.a.industry,
      qty: firstQty,
      fullQty,
      plannedAdd,
      addTime: ts.addTime || '15:15',
      checks: sig.checks || null,
      price: entry,
      pivot: sig.pivot,
      stop: stopRes.stop,
      stopPct: stopRes.stopPct,
      stopNote: stopRes.note,
      value: round(size.qty * entry),
      pctOfCapital: round(((size.qty * entry) / capital.equity) * 100, 1),
      riskAmount: round(fullQty * (entry - stopRes.stop)),
      riskPct: round(((fullQty * (entry - stopRes.stop)) / capital.equity) * 100, 2),
      target: roundTick(entry * (1 + rules.partialAtPct / 100), tick),
      score: sig.score,
      grade: sig.grade,
      volPace: round(sig.volPace, 2),
      good: sig.good,
      bad: sig.bad,
      parts: sig.parts,
      firstEntryDate: sig.firstEntryDate,
      kind,
      entryCtx: this.entryContext(sig.a, sig.volPace),
      ...(force ? { limitCap: entry * 1.01 } : {}),
    };

    if (force) {
      this.markSignal(sig.id, 'overruled', 'You bought it anyway');
      await this.execute(proposal, 'you');
      return { ok: true, qty: proposal.qty, price: entry, stop: proposal.stop };
    }
    if (!settings.confirmTrades) {
      this.markSignal(sig.id, 'auto', 'Auto-executed');
      this.execute(proposal, 'auto').catch((e) => this.log(`Order for ${sig.symbol} failed: ${e.message}`, 'error'));
      return;
    }
    const expires = new Date(clock.now().getTime() + settings.approvalMinutes * 60000);
    const id = db.insert('approvals', {
      ts: clock.now().toISOString(),
      signal_id: sig.id,
      symbol: sig.symbol,
      side: 'BUY',
      qty: proposal.qty,
      price: proposal.price,
      stop: proposal.stop,
      status: 'pending',
      expires: expires.toISOString(),
      data: JSON.stringify(proposal),
    });
    this.markSignal(sig.id, 'awaiting_approval', '');
    this.log(`Asking you to approve: BUY ${proposal.qty} ${sig.symbol} @ ~${inr(entry)} (stop ${inr(proposal.stop)}, ${proposal.stopPct}%)`, 'info');
    this.ctx.bus.push('approval', { id });
    const msg = await this.ctx.notify?.('proposals', this.proposalText(proposal, expires), this.approvalButtons(id, sig.symbol));
    if (msg?.message_id) db.run('UPDATE approvals SET data = json_set(data, "$.tgMessageId", ?) WHERE id = ?', msg.message_id, id);
  }

  approvalButtons(id, symbol) {
    return [
      [
        { text: '✅ Approve', callback_data: `approve:${id}` },
        { text: '❌ Reject', callback_data: `reject:${id}` },
      ],
      [
        { text: '½ Buy half', callback_data: `half:${id}` },
        { text: '⏰ In 15 min', callback_data: `snooze:${id}` },
      ],
      ...(this.ctx.publicUrl ? [[{ text: 'Open in Pivot', url: `${this.ctx.publicUrl}/#/stock/${symbol}` }]] : []),
    ];
  }

  proposalText(p, expires) {
    const t = ist(expires);
    return [
      `${p.type === 'reentry' ? '🔁 <b>RE-ENTRY</b>' : '🟢 <b>BUY SIGNAL</b>'} · <b>${esc(p.symbol)}</b>  ${p.grade} (${p.score}/100)${p.kind === 'paper' ? '  <i>[paper]</i>' : ''}`,
      `Breakout above ${inr(p.pivot)} on ${p.volPace}× volume`,
      '',
      p.plannedAdd
        ? `Buy <b>${p.qty}</b> now @ ~${inr(p.price)} (${inr(p.value)}) + <b>${p.plannedAdd}</b> more at ${p.addTime} if the breakout holds`
        : `Buy <b>${p.qty}</b> @ ~${inr(p.price)} = <b>${inr(p.value)}</b> (${p.pctOfCapital}% of capital)`,
      `Stop ${inr(p.stop)} (−${p.stopPct}%) · risk ${inr(p.riskAmount)} (${p.riskPct}%)`,
      `Sell ⅓ at ${inr(p.target)} (+10%), then stop → breakeven`,
      ...(p.checks ? ['', 'Confirmed: ' + describeChecks(p.checks).filter((x) => x.startsWith('✓')).map((x) => x.slice(2)).join(' · ')] : []),
      '',
      ...(p.good || []).slice(0, 4).map((g) => `✓ ${esc(g)}`),
      ...(p.bad || []).slice(0, 2).map((b) => `⚠︎ ${esc(b)}`),
      '',
      `<i>Expires at ${t.hhmm} IST</i>`,
    ].join('\n');
  }

  /** Conditions at the moment of buying — used by the Dashboard's rule report card. */
  entryContext(a, volPace) {
    return {
      regime: this.ctx.market?.regime || 'unknown',
      sectorRs: a?.sectorRs ?? null,
      rs: a?.rsRating ?? null,
      baseDepth: a?.vcp?.depthPct ?? null,
      contractions: a?.vcp?.count ?? a?.vcp?.contractions?.length ?? null,
      turnoverCr: a?.turnoverCr ?? null,
      volPace: volPace != null ? round(volPace, 2) : null,
    };
  }

  markSignal(id, status, reason) {
    if (id) this.ctx.db.run('UPDATE signals SET status = ?, reason = ? WHERE id = ?', status, reason, id);
  }

  tickOf(symbol) {
    return this.ctx.db.get('SELECT tick FROM universe WHERE symbol = ?', symbol)?.tick || 0.05;
  }

  async decide(id, decision, by = 'app') {
    const { db, clock } = this.ctx;
    const ap = db.get('SELECT * FROM approvals WHERE id = ?', id);
    if (!ap) return 'Not found';
    if (ap.status !== 'pending') return `Already ${ap.status}`;
    let p = JSON.parse(ap.data);
    // "Remind me in 15 minutes": keep it open longer and ask again later
    if (decision === 'snooze') {
      const remindAt = new Date(clock.now().getTime() + 15 * 60000);
      const expires = new Date(Math.max(new Date(ap.expires).getTime(), remindAt.getTime() + 10 * 60000));
      p.remindAt = remindAt.toISOString();
      p.reminded = false;
      db.run('UPDATE approvals SET data = ?, expires = ? WHERE id = ?', JSON.stringify(p), expires.toISOString(), id);
      this.ctx.bus.push('approval', { id });
      this.log(`You asked to be reminded about ${p.symbol} in 15 minutes`);
      return `OK — I'll ask again at ${ist(remindAt).hhmm}`;
    }
    // "Buy half": same trade, half the shares (and half of any planned second part)
    if (decision === 'half') {
      const q = Math.max(1, Math.floor(p.qty / 2));
      p = { ...p, qty: q, fullQty: Math.max(q, Math.floor((p.fullQty || p.qty) / 2)), plannedAdd: Math.floor((p.plannedAdd || 0) / 2), value: round(q * p.price), half: true };
      db.run('UPDATE approvals SET data = ?, qty = ? WHERE id = ?', JSON.stringify(p), q, id);
      decision = 'approve';
    }
    const done = (status, note) => {
      db.run('UPDATE approvals SET status = ?, decided_ts = ?, decided_by = ? WHERE id = ?', status, clock.now().toISOString(), by, id);
      this.ctx.bus.push('approval', { id });
      if (p.tgMessageId) this.ctx.telegram?.edit(p.tgMessageId, `${note} · <b>${esc(p.symbol)}</b> ${p.qty} @ ~${inr(p.price)}`);
    };
    if (decision === 'reject') {
      done('rejected', '❌ Rejected');
      this.markSignal(ap.signal_id, 'rejected', `Rejected by you (${by})`);
      this.log(`You rejected ${p.symbol}. Tracking it as a shadow trade.`);
      const sig = db.get('SELECT * FROM signals WHERE id = ?', ap.signal_id);
      this.openShadow({ symbol: p.symbol, a: { token: p.token, industry: p.industry }, pivot: p.pivot, score: p.score, grade: p.grade, id: ap.signal_id, type: p.type, price: sig?.price ?? p.price }, p.price, p.stop, 'Rejected by you');
      return 'Rejected';
    }
    if (new Date(ap.expires) < clock.now()) {
      done('expired', '⌛ Expired');
      return 'This signal has expired';
    }
    // Re-check price before buying
    const ltp = this.ltpOf(p.symbol, p.price);
    const zoneTop = p.pivot * (1 + this.ctx.settings.rules.buyZonePct / 100);
    if (ltp > zoneTop) {
      done('expired', '⌛ Price ran past the buy zone');
      this.markSignal(ap.signal_id, 'expired', 'Price ran past the buy zone before approval');
      return `Price ${inr(ltp)} is now above the buy zone (${inr(zoneTop)}) — not buying`;
    }
    if (ltp <= p.stop) {
      done('expired', '⌛ Price fell to the stop');
      return 'Price has fallen to the stop — not buying';
    }
    done('approved', '✅ Approved');
    this.markSignal(ap.signal_id, 'approved', `Approved (${by})`);
    const tick = this.tickOf(p.symbol);
    const entry = roundTick(Math.min(ltp * 1.002, zoneTop), tick);
    // keep the same risk structure: if price moved, re-derive the stop from the chart stop
    const st = computeStop(entry, p.stop, this.ctx.settings.rules);
    const prop = { ...p, price: entry, stop: st.skip ? p.stop : st.stop };
    this.execute(prop, by).catch((e) => this.log(`Order for ${p.symbol} failed: ${e.message}`, 'error'));
    return `Buying ${p.qty} ${p.symbol}`;
  }

  expireApprovals() {
    const { db, clock } = this.ctx;
    const zone = this.ctx.settings.rules.buyZonePct;
    for (const ap of db.all("SELECT * FROM approvals WHERE status = 'pending'")) {
      const p = JSON.parse(ap.data);
      const ltp = this.ltpOf(p.symbol, p.price);
      if (p.remindAt && !p.reminded && new Date(p.remindAt) <= clock.now()) {
        p.reminded = true;
        db.run('UPDATE approvals SET data = ? WHERE id = ?', JSON.stringify(p), ap.id);
        this.ctx.notify?.('proposals', `⏰ <b>Reminder</b> — ${this.proposalText(p, new Date(ap.expires))}`, this.approvalButtons(ap.id, p.symbol));
      }
      let why = null;
      if (new Date(ap.expires) < clock.now()) why = 'No answer in time';
      else if (ltp > p.pivot * (1 + zone / 100)) why = 'Price ran past the buy zone';
      else if (ltp <= p.stop) why = 'Price fell back to the stop';
      if (why) {
        db.run("UPDATE approvals SET status = 'expired', decided_ts = ?, decided_by = 'system' WHERE id = ?", clock.now().toISOString(), ap.id);
        this.markSignal(ap.signal_id, 'expired', why);
        this.log(`${p.symbol} approval expired — ${why}. Tracking as a shadow trade.`);
        if (p.tgMessageId) this.ctx.telegram?.edit(p.tgMessageId, `⌛ Expired (${why}) · <b>${esc(p.symbol)}</b>`);
        this.openShadow({ symbol: p.symbol, a: { token: p.token, industry: p.industry }, pivot: p.pivot, score: p.score, grade: p.grade, id: ap.signal_id, type: p.type }, p.price, p.stop, why);
        this.ctx.bus.push('approval', { id: ap.id });
      }
    }
  }

  // ------------------------------------------------------------------ order execution
  async execute(p, by) {
    const { db, clock, settings } = this.ctx;
    const kind = p.kind || this.mode;
    if (this.busy.has(p.symbol)) return;
    this.busy.add(p.symbol);
    try {
      let fillQty = p.qty;
      let fillPrice = p.price;
      let orderId = null;
      const tick = this.tickOf(p.symbol);
      if (kind === 'live') {
        const res = await this.ctx.liveBroker.execute({
          symbol: p.symbol,
          side: 'BUY',
          qty: p.qty,
          price: p.price,
          tick,
          getLtp: () => this.ltpOf(p.symbol),
          limitCap: p.limitCap ?? p.pivot * (1 + settings.rules.buyZonePct / 100),
        });
        db.insert('orders', { ts: clock.now().toISOString(), symbol: p.symbol, side: 'BUY', qty: p.qty, price: p.price, status: res.status, broker_id: res.orderId, filled_qty: res.filledQty, avg_price: res.avgPrice, reason: p.type, mode: kind, message: res.message });
        if (!res.filledQty) {
          this.log(`BUY ${p.symbol} not filled (${res.status}${res.message ? ': ' + res.message : ''})`, 'error');
          this.ctx.notify?.('fills', `⚠️ BUY ${esc(p.symbol)} was not filled — ${esc(res.status)} ${esc(res.message || '')}`);
          return;
        }
        fillQty = res.filledQty;
        fillPrice = res.avgPrice;
        orderId = res.orderId;
      } else {
        fillPrice = roundTick(Math.max(p.price, this.ltpOf(p.symbol, p.price)) * (1 + settings.rules.slippagePct / 100), tick);
        db.insert('orders', { ts: clock.now().toISOString(), symbol: p.symbol, side: 'BUY', qty: p.qty, price: p.price, status: 'COMPLETE', filled_qty: p.qty, avg_price: fillPrice, reason: p.type, mode: 'paper' });
      }
      const charges = deliveryCharges('BUY', fillQty, fillPrice);
      const t = ist(clock.now());
      const posId = db.insert('positions', {
        kind,
        symbol: p.symbol,
        token: p.token,
        industry: p.industry,
        status: 'open',
        entry_ts: clock.now().toISOString(),
        entry_date: t.date,
        entry_price: fillPrice,
        qty_initial: fillQty,
        qty_open: fillQty,
        stop: p.stop,
        initial_stop: p.stop,
        partial_done: 0,
        highest: fillPrice,
        last_price: fillPrice,
        realized: -charges,
        charges,
        signal_id: p.signalId,
        is_reentry: p.type === 'reentry' ? 1 : 0,
        score: p.score,
        grade: p.grade,
        setup: JSON.stringify({ pivot: p.pivot, stopNote: p.stopNote, volPace: p.volPace, good: p.good, bad: p.bad, parts: p.parts, firstEntryDate: p.firstEntryDate || t.date, approvedBy: by, checks: p.checks || null, stage: p.plannedAdd ? 1 : 0, plannedAdd: p.plannedAdd || 0, addTime: p.addTime, entryCtx: p.entryCtx || null }),
      });
      db.insert('fills', { position_id: posId, ts: clock.now().toISOString(), side: 'BUY', qty: fillQty, price: fillPrice, charges, reason: p.type === 'reentry' ? 'Re-entry' : 'Breakout entry', order_id: orderId });
      if (p.type === 'reentry') db.run("UPDATE watchlist SET status = 'triggered', note = 'Re-entered' WHERE symbol = ?", p.symbol);
      else db.run("UPDATE watchlist SET status = 'triggered', note = 'Bought on breakout' WHERE symbol = ?", p.symbol);
      this.log(`✅ Bought ${fillQty} ${p.symbol} @ ${inr(fillPrice)} (${kind}). Stop ${inr(p.stop)}.`, 'success');
      this.ctx.notify?.('fills', `✅ <b>Bought ${fillQty} ${esc(p.symbol)}</b> @ ${inr(fillPrice)}${kind === 'paper' ? ' <i>[paper]</i>' : ''}\nStop ${inr(p.stop)} · ⅓ target ${inr(roundTick(fillPrice * 1.1, tick))}`);
      if (kind === 'live' && settings.backupGtt) await this.syncGtt(posId);
      this.ctx.bus.push('positions', {});
    } finally {
      this.busy.delete(p.symbol);
    }
  }

  openShadow(sig, entry, stop, reason) {
    const { db, clock, settings } = this.ctx;
    if (!sig.a?.token) return;
    if (db.get("SELECT id FROM positions WHERE kind = 'shadow' AND symbol = ? AND status = 'open'", sig.symbol)) return;
    const t = ist(clock.now());
    const equity = settings.paperCapital;
    const qty = Math.max(1, Math.floor((equity * settings.rules.positionPct) / 100 / entry));
    const charges = deliveryCharges('BUY', qty, entry);
    db.insert('positions', {
      kind: 'shadow',
      symbol: sig.symbol,
      token: sig.a.token,
      industry: sig.a.industry,
      status: 'open',
      entry_ts: clock.now().toISOString(),
      entry_date: t.date,
      entry_price: entry,
      qty_initial: qty,
      qty_open: qty,
      stop,
      initial_stop: stop,
      highest: entry,
      last_price: entry,
      realized: -charges,
      charges,
      signal_id: sig.id,
      is_reentry: sig.type === 'reentry' ? 1 : 0,
      score: sig.score,
      grade: sig.grade,
      setup: JSON.stringify({ pivot: sig.pivot, shadowReason: reason, entryCtx: this.entryContext(sig.a, sig.volPace) }),
    });
  }

  // ------------------------------------------------------------------ probes (measuring confirmation)
  /** Tracking-only position bought at the FIRST tick above the pivot, to measure each check. */
  openProbe(a, price, pivot, chartStop) {
    const { db, clock, settings } = this.ctx;
    const t = ist(clock.now());
    // one probe per setup (same pivot), not one per day
    if (db.get("SELECT id FROM positions WHERE kind = 'probe' AND symbol = ? AND (entry_date = ? OR ABS(json_extract(setup, '$.pivot') - ?) < 0.01)", a.symbol, t.date, pivot)) return;
    const rules = settings.rules;
    let st = computeStop(price, chartStop, rules);
    if (st.skip) st = computeStop(price, chartStop, { ...rules, wideStopAction: 'cap' });
    const qty = Math.max(1, Math.floor((settings.paperCapital * rules.positionPct) / 100 / price));
    const charges = deliveryCharges('BUY', qty, price);
    db.insert('positions', {
      kind: 'probe',
      symbol: a.symbol,
      token: a.token,
      industry: a.industry,
      status: 'open',
      entry_ts: clock.now().toISOString(),
      entry_date: t.date,
      entry_price: price,
      qty_initial: qty,
      qty_open: qty,
      stop: st.stop,
      initial_stop: st.stop,
      highest: price,
      last_price: price,
      realized: -charges,
      charges,
      score: a.score,
      grade: a.grade,
      setup: JSON.stringify({ pivot, probe: true, checks: null, confirmed: false }),
    });
  }

  /** Keep the probe's latest check results until the breakout is confirmed (then freeze them). */
  recordProbeChecks(symbol, checks, confirmed) {
    const { db, clock } = this.ctx;
    const row = db.get("SELECT id, setup FROM positions WHERE kind = 'probe' AND symbol = ? ORDER BY id DESC LIMIT 1", symbol);
    if (!row) return;
    const s = JSON.parse(row.setup || '{}');
    if (s.confirmed) return;
    db.run('UPDATE positions SET setup = ? WHERE id = ?', JSON.stringify({ ...s, checks, confirmed }), row.id);
  }

  // ------------------------------------------------------------------ two-stage buy
  /** At 15:15: add the second part of each new position if the breakout is still holding. */
  async stageTwo() {
    const { db, clock, settings } = this.ctx;
    const rules = settings.rules;
    const now = clock.now();
    for (const row of db.all("SELECT * FROM positions WHERE status = 'open' AND kind IN ('paper','live')")) {
      const s = JSON.parse(row.setup || '{}');
      if (s.stage !== 1 || !s.plannedAdd) continue;
      if (now - new Date(row.entry_ts) < 30 * 60000) continue; // bought in the last 30 min — check tomorrow
      const a = this.ctx.analysis?.get(row.symbol);
      const q = this.ctx.quotes.get(row.token);
      const ltp = q?.ltp;
      const t = ist(now);
      const pace = a && q ? volumePace(q.volume || 0, t.minutes - MARKET.open, a.avgVol50) : null;
      const thr = s.pivot * (1 + (rules.confirm?.pivotBufferPct || 0) / 100);
      const zoneTop = s.pivot * (1 + rules.buyZonePct / 100);
      const holds = ltp && ltp >= thr && ltp > row.stop && (pace == null || pace >= rules.minVolPace);
      const done = (stage, note) => db.run('UPDATE positions SET setup = ? WHERE id = ?', JSON.stringify({ ...s, stage, stage2Note: note }), row.id);
      if (!holds) {
        done(0, 'Second part skipped — the breakout did not hold');
        this.log(`${row.symbol}: second part skipped — the breakout did not hold (₹${ltp} vs pivot ₹${s.pivot})`, 'warn');
        continue;
      }
      if (ltp > zoneTop) {
        done(0, 'Second part skipped — price too far above the pivot');
        this.log(`${row.symbol}: second part skipped — price ₹${ltp} is more than ${rules.buyZonePct}% above the pivot`);
        continue;
      }
      const cap = await this.capital(row.kind);
      const add = Math.min(s.plannedAdd, Math.floor((cap.cash * 0.995) / ltp));
      if (add < 1) {
        done(0, 'Second part skipped — not enough free cash');
        this.log(`${row.symbol}: second part skipped — not enough free cash`, 'warn');
        continue;
      }
      let fillQty = add,
        fillPrice = roundTick(ltp * (1 + rules.slippagePct / 100), this.tickOf(row.symbol)),
        orderId = null;
      if (row.kind === 'live') {
        const res = await this.ctx.liveBroker.execute({ symbol: row.symbol, side: 'BUY', qty: add, price: ltp * 1.002, tick: this.tickOf(row.symbol), getLtp: () => this.ltpOf(row.symbol), limitCap: zoneTop });
        if (!res.filledQty) {
          done(0, `Second part not filled (${res.status})`);
          continue;
        }
        fillQty = res.filledQty;
        fillPrice = res.avgPrice;
        orderId = res.orderId;
      }
      const charges = deliveryCharges('BUY', fillQty, fillPrice);
      const cur = db.get('SELECT * FROM positions WHERE id = ?', row.id);
      const newQty = cur.qty_initial + fillQty;
      const avg = round((cur.entry_price * cur.qty_initial + fillPrice * fillQty) / newQty);
      db.update('positions', row.id, {
        entry_price: avg,
        qty_initial: newQty,
        qty_open: cur.qty_open + fillQty,
        realized: round(cur.realized - charges),
        charges: round(cur.charges + charges),
        setup: JSON.stringify({ ...s, stage: 2, stage2Note: `Added ${fillQty} @ ${fillPrice}` }),
      });
      db.insert('fills', { position_id: row.id, ts: now.toISOString(), side: 'BUY', qty: fillQty, price: fillPrice, charges, reason: 'Second part — breakout held', order_id: orderId });
      this.log(`➕ ${row.symbol}: breakout held — added ${fillQty} @ ${inr(fillPrice)} (now ${newQty} shares, average ${inr(avg)})`, 'success');
      this.ctx.notify?.('fills', `➕ <b>Added ${fillQty} ${esc(row.symbol)}</b> @ ${inr(fillPrice)}${row.kind === 'paper' ? ' <i>[paper]</i>' : ''}\nBreakout held into the close · now ${newQty} shares`);
      if (row.kind === 'live' && settings.backupGtt) await this.syncGtt(row.id);
      this.ctx.bus.push('positions', {});
    }
  }

  // ------------------------------------------------------------------ position management
  /** Called every second in market hours. */
  async onTick({ isCloseCheck = false } = {}) {
    const { db, settings } = this.ctx;
    const rules = settings.rules;
    const all = db.all("SELECT * FROM positions WHERE status = 'open'");
    this.status.lastCheck = Date.now();
    const holdsById = getOverrides(db).positions;
    for (const row of all) {
      if (this.busy.has(row.id)) continue;
      const holds = holdsById[row.id] || {}; // exit rules you switched off for this position
      const prules = holds.noPartial || holds.noTrail ? { ...rules, ...(holds.noPartial ? { partialAtPct: Infinity } : {}), ...(holds.noTrail ? { trailMethod: 'none' } : {}) } : rules;
      const a = this.ctx.analysis?.get(row.symbol);
      const q = this.ctx.quotes.get(row.token);
      if (!q?.ltp) continue;
      const price = q.ltp;
      const highest = Math.max(row.highest || 0, price);
      if (highest !== row.highest || price !== row.last_price) db.run('UPDATE positions SET highest = ?, last_price = ? WHERE id = ?', highest, price, row.id);
      const pos = { entryPrice: row.entry_price, qtyOpen: row.qty_open, qtyInitial: row.qty_initial, stop: row.stop, partialDone: !!row.partial_done, highest };
      let trailLevel = null;
      if (isCloseCheck && a) {
        if (rules.trailMethod === 'ema21' && a.ema21) trailLevel = emaNext(a.ema21, price, 21);
        else if (rules.trailMethod === 'sma50' && a.sma50) trailLevel = a.sma50;
      }
      // Failed breakout: a new buy that closes back below its pivot is sold at the close
      if (isCloseCheck && rules.failedExit?.enabled && !holds.noFailedExit && !row.partial_done) {
        const pv = JSON.parse(row.setup || '{}').pivot;
        const held = tradingDaysBetween(row.entry_date, ist(this.now()).date, settings.holidays);
        if (pv && price < pv && held < (rules.failedExit.days || 2)) {
          this.track(this.exit(row, row.qty_open, 'failed', `Closing back below the pivot ₹${pv} — failed breakout, exiting early to keep the loss small`, price));
          continue;
        }
      }
      // Time exit: no stop and no +10% within N trading days → free up the capital at the close
      if (isCloseCheck && rules.timeExit?.enabled && !holds.noTimeExit && !row.partial_done) {
        const held = tradingDaysBetween(row.entry_date, ist(this.now()).date, settings.holidays);
        if (held >= (rules.timeExit.days || 7)) {
          const pct = ((price / row.entry_price - 1) * 100).toFixed(1);
          this.track(this.exit(row, row.qty_open, 'time', `No stop and no +${rules.partialAtPct}% after ${held} trading days (${pct >= 0 ? '+' : ''}${pct}%) — time exit to free up capital`, price));
          continue;
        }
      }
      // Big winners: 8-week hold (no trailing exit) and climax-run sale at the close
      const W = rules.winners || {};
      const heldDays = tradingDaysBetween(row.entry_date, ist(this.now()).date, settings.holidays);
      if (W.eightWeek?.enabled && !row.power_date && heldDays <= W.eightWeek.withinDays && price >= row.entry_price * (1 + W.eightWeek.gainPct / 100) && !['shadow', 'probe'].includes(row.kind)) {
        row.power_date = ist(this.now()).date;
        db.run('UPDATE positions SET power_date = ? WHERE id = ?', row.power_date, row.id);
        this.log(`💪 ${row.symbol} is up ${W.eightWeek.gainPct}%+ within ${heldDays} days — holding it for 8 weeks (no trailing exit; the stop still protects it)`, 'success');
      }
      const powerHold = !!(W.eightWeek?.enabled && row.power_date && heldDays <= W.eightWeek.holdDays);
      if (isCloseCheck && W.climax?.enabled && !row.climax_done && row.qty_open >= 2) {
        const closes = db.all('SELECT close FROM candles WHERE token = ? AND date >= ? AND date < ? ORDER BY date', row.token, row.entry_date, ist(this.now()).date).map((r) => r.close);
        closes.push(price);
        const ws = winnerState({ entryPrice: row.entry_price, closes, held: heldDays, powerDate: row.power_date, climaxDone: !!row.climax_done, rules });
        if (ws.climax) {
          db.run('UPDATE positions SET climax_done = 1 WHERE id = ?', row.id);
          this.track(this.exit(row, Math.max(1, Math.floor(row.qty_open * (W.climax.fraction || 0.5))), 'climax', ws.climaxReason, price));
          continue;
        }
      }
      const actions = managePosition(pos, price, { isCloseCheck, trailLevel, powerHold }, prules);
      for (const act of actions) {
        if (act.type === 'stop') this.track(this.exit(row, act.qty, 'stop', act.reason, price));
        else if (act.type === 'partial') {
          this.track(
            (async () => {
              const ok = act.qty > 0 ? await this.exit(row, act.qty, 'partial', act.reason, price) : true;
              if (!ok) return;
              db.run('UPDATE positions SET partial_done = 1, stop = ? WHERE id = ?', act.newStop, row.id);
              if (row.kind === 'live' && settings.backupGtt) await this.syncGtt(row.id);
            })(),
          );
        } else if (act.type === 'raiseStop') {
          db.run('UPDATE positions SET stop = ? WHERE id = ?', act.newStop, row.id);
          if (!['shadow', 'probe'].includes(row.kind)) this.log(`${row.symbol}: ${act.reason}`);
          if (row.kind === 'live' && settings.backupGtt) await this.syncGtt(row.id);
        } else if (act.type === 'trail') this.track(this.exit(row, act.qty, 'trail', act.reason, price));
      }
    }
  }

  /** Run an order task in the background; paper/demo tasks finish synchronously enough. */
  track(promise) {
    this.inflight = (this.inflight || 0) + 1;
    promise
      .catch((e) => this.log(`Order task failed: ${e.message}`, 'error'))
      .finally(() => (this.inflight -= 1));
    return promise;
  }

  async exit(row, qty, reasonKey, reasonText, price) {
    const { db, clock, settings } = this.ctx;
    if (qty <= 0 || this.busy.has(row.id)) return false;
    if ((this.retryAt.get(row.id) || 0) > Date.now()) return false;
    this.busy.add(row.id);
    try {
      const cur = db.get('SELECT * FROM positions WHERE id = ?', row.id);
      if (!cur || cur.status !== 'open') return false;
      qty = Math.min(qty, cur.qty_open);
      const tick = this.tickOf(cur.symbol);
      let fillPrice;
      let orderId = null;
      if (cur.kind === 'live') {
        if (cur.gtt_id && qty === cur.qty_open) {
          await this.ctx.liveBroker.deleteGtt(cur.gtt_id).catch(() => {});
          db.run('UPDATE positions SET gtt_id = NULL WHERE id = ?', cur.id);
        }
        const res = await this.ctx.liveBroker.execute({ symbol: cur.symbol, side: 'SELL', qty, price: price * 0.99, tick, getLtp: () => this.ltpOf(cur.symbol) });
        db.insert('orders', { ts: clock.now().toISOString(), position_id: cur.id, symbol: cur.symbol, side: 'SELL', qty, price: roundTick(price * 0.99, tick), status: res.status, broker_id: res.orderId, filled_qty: res.filledQty, avg_price: res.avgPrice, reason: reasonKey, mode: 'live', message: res.message });
        if (!res.filledQty) {
          const n = (this.failures.get(cur.id) || 0) + 1;
          this.failures.set(cur.id, n);
          this.retryAt.set(cur.id, Date.now() + Math.min(300000, 15000 * n));
          this.log(`SELL ${cur.symbol} failed (${res.status} ${res.message || ''}) — retrying shortly`, 'error');
          if (n === 1 || n % 5 === 0) this.ctx.notify?.('exits', `⚠️ SELL ${esc(cur.symbol)} failed: ${esc(res.message || res.status)}. Pivot will keep retrying — please check Kite.`);
          if (n >= 2) await this.reconcile();
          return false;
        }
        this.failures.delete(cur.id);
        qty = res.filledQty;
        fillPrice = res.avgPrice;
        orderId = res.orderId;
      } else {
        fillPrice = roundTick(price * (1 - settings.rules.slippagePct / 100), tick);
        if (cur.kind === 'paper') db.insert('orders', { ts: clock.now().toISOString(), position_id: cur.id, symbol: cur.symbol, side: 'SELL', qty, price: fillPrice, status: 'COMPLETE', filled_qty: qty, avg_price: fillPrice, reason: reasonKey, mode: 'paper' });
      }
      const charges = deliveryCharges('SELL', qty, fillPrice);
      const pnl = qty * (fillPrice - cur.entry_price) - charges;
      const qtyOpen = cur.qty_open - qty;
      db.insert('fills', { position_id: cur.id, ts: clock.now().toISOString(), side: 'SELL', qty, price: fillPrice, charges, reason: reasonText, order_id: orderId });
      const t = ist(clock.now());
      const upd = { qty_open: qtyOpen, realized: round(cur.realized + pnl), charges: round(cur.charges + charges) };
      if (qtyOpen <= 0) {
        const sells = db.all("SELECT qty, price FROM fills WHERE position_id = ? AND side = 'SELL'", cur.id);
        const avgExit = sells.reduce((s, f) => s + f.qty * f.price, 0) / sells.reduce((s, f) => s + f.qty, 0);
        Object.assign(upd, { status: 'closed', exit_ts: clock.now().toISOString(), exit_date: t.date, exit_price: round(avgExit), exit_reason: reasonKey });
      }
      db.update('positions', cur.id, upd);
      if (!['shadow', 'probe'].includes(cur.kind)) {
        const pct = round((fillPrice / cur.entry_price - 1) * 100, 2);
        const emoji = reasonKey === 'stop' || reasonKey === 'failed' ? (pct < 0 ? '🛑' : '🟡') : reasonKey === 'partial' ? '💰' : reasonKey === 'time' ? '⏱' : reasonKey === 'climax' ? '🚀' : '🏁';
        const label = { stop: 'Stop', partial: 'Partial profit', trail: 'Trailing exit', manual: 'Manual exit', outside: 'Closed outside Pivot', failed: 'Failed breakout', time: 'Time exit', climax: 'Climax sale' }[reasonKey] || reasonKey;
        this.log(`${emoji} ${label}: sold ${qty} ${cur.symbol} @ ${inr(fillPrice)} (${pct >= 0 ? '+' : ''}${pct}%) — ${reasonText}`, pct >= 0 ? 'success' : 'warn');
        this.ctx.notify?.('exits', `${emoji} <b>${label} · ${esc(cur.symbol)}</b>${cur.kind === 'paper' ? ' <i>[paper]</i>' : ''}\nSold ${qty} @ ${inr(fillPrice)} (${pct >= 0 ? '+' : ''}${pct}%) · P&L ${inr(round(pnl, 0))}\n${esc(reasonText)}${qtyOpen > 0 ? `\n${qtyOpen} shares still open` : ''}`);
        this.ctx.bus.push('positions', {});
      }
      if (cur.kind === 'live' && qtyOpen > 0 && settings.backupGtt) await this.syncGtt(cur.id);
      return true;
    } catch (e) {
      this.retryAt.set(row.id, Date.now() + 30000);
      this.log(`SELL ${row.symbol} error: ${e.message}`, 'error');
      return false;
    } finally {
      this.busy.delete(row.id);
    }
  }

  /**
   * You overrule the agents and buy: either a signal they passed on today ({ signalId }), or any analysed
   * stock right now ({ symbol }). Rules that would have stopped the buy are skipped; sizing (10% of capital)
   * and a stop (chart stop, or the maximum % if the chart stop is too wide) are still applied.
   */
  async overruleBuy({ signalId, symbol }) {
    const { db, analysis, quotes } = this.ctx;
    const err = (m, status = 400) => Object.assign(new Error(m), { status });
    if (this.ctx.parent?.phase !== 'market') throw err('The market is closed — overrule buys work between 09:15 and 15:30');
    let row = null;
    if (signalId) {
      row = db.get('SELECT * FROM signals WHERE id = ?', signalId);
      if (!row) throw err('Signal not found', 404);
      if (row.date !== ist(this.now()).date) throw err("Only today's signals can be bought — the price has moved since");
      symbol = row.symbol;
    }
    symbol = String(symbol || '').toUpperCase().trim();
    const a = analysis.get(symbol);
    if (!a) throw err(`${symbol || 'That stock'} is not in the Nifty 500 analysis`);
    const q = quotes.get(a.token);
    if (!q?.ltp) throw err(`No live price for ${symbol} yet`);
    const chartStop = a.vcp?.stop ?? (a.vcp?.lastLow ? a.vcp.lastLow * 0.995 : null);
    let sig;
    if (row) {
      const d = JSON.parse(row.data || '{}');
      sig = { id: row.id, type: row.type, symbol, a, price: q.ltp, pivot: row.pivot, chartStop, volPace: row.vol_pace, score: row.score, grade: row.grade, parts: d.parts, good: d.good, bad: d.bad, status: 'ranked' };
    } else {
      const minutes = ist(this.now()).minutes - MARKET.open;
      const base = { type: 'breakout', symbol, a, price: q.ltp, pivot: a.vcp?.pivot || q.ltp, chartStop, volPace: volumePace(q.volume || 0, minutes, a.avgVol50) || 0 };
      [sig] = this.ctx.agents.analyst.rank([base]);
    }
    const res = await this.consider(sig, { force: true });
    this.ctx.bus.log('You', `You overruled the agents and bought ${symbol} — ${res.qty} shares at about ${inr(res.price)}, stop ${inr(res.stop)}`, { level: 'success' });
    return res;
  }

  async manualExit(id, fraction = 1) {
    const row = this.ctx.db.get('SELECT * FROM positions WHERE id = ?', id);
    if (!row || row.status !== 'open') throw Object.assign(new Error('Position is not open'), { status: 400 });
    const price = this.ltpOf(row.symbol, row.last_price || row.entry_price);
    const qty = fraction >= 1 ? row.qty_open : Math.max(1, Math.floor(row.qty_open * fraction));
    await this.exit(row, qty, 'manual', `You chose to sell ${fraction >= 1 ? 'everything' : Math.round(fraction * 100) + '%'}`, price);
    return { ok: true };
  }

  async setStop(id, stop) {
    const { db } = this.ctx;
    const row = db.get('SELECT * FROM positions WHERE id = ?', id);
    if (!row || row.status !== 'open') throw Object.assign(new Error('Position is not open'), { status: 400 });
    const price = this.ltpOf(row.symbol, row.last_price);
    if (!(stop > 0) || stop >= price) throw Object.assign(new Error('Stop must be below the current price'), { status: 400 });
    db.run('UPDATE positions SET stop = ? WHERE id = ?', roundTick(stop, this.tickOf(row.symbol)), id);
    this.log(`You moved the ${row.symbol} stop to ${inr(stop)}`);
    if (row.kind === 'live' && this.ctx.settings.backupGtt) await this.syncGtt(id);
    return { ok: true };
  }

  async syncGtt(posId) {
    const { db } = this.ctx;
    const row = db.get('SELECT * FROM positions WHERE id = ?', posId);
    if (!row || row.kind !== 'live') return;
    const tick = this.tickOf(row.symbol);
    const args = { symbol: row.symbol, qty: row.qty_open, stop: row.stop, ltp: this.ltpOf(row.symbol, row.last_price), tick };
    try {
      if (row.status !== 'open' || row.qty_open <= 0) {
        if (row.gtt_id) await this.ctx.liveBroker.deleteGtt(row.gtt_id);
        db.run('UPDATE positions SET gtt_id = NULL WHERE id = ?', posId);
      } else if (row.gtt_id) await this.ctx.liveBroker.modifyStopGtt(row.gtt_id, args);
      else {
        const gid = await this.ctx.liveBroker.placeStopGtt(args);
        db.run('UPDATE positions SET gtt_id = ? WHERE id = ?', gid, posId);
      }
    } catch (e) {
      this.log(`Backup GTT stop for ${row.symbol} could not be updated: ${e.message}. The app's own stop is still active.`, 'warn');
    }
  }

  /** LIVE mode: make sure our records match what Zerodha actually holds. */
  async reconcile() {
    if (this.mode !== 'live' || !this.ctx.liveBroker) return;
    let held;
    try {
      held = await this.ctx.liveBroker.heldQuantities();
    } catch (e) {
      return;
    }
    for (const row of this.openPositions('live')) {
      if (this.busy.has(row.id)) continue;
      const q = held.get(row.symbol) || 0;
      if (q < row.qty_open) {
        const price = this.ltpOf(row.symbol, row.last_price);
        this.log(`${row.symbol}: Zerodha shows ${q} shares but Pivot expected ${row.qty_open} — recording the difference as sold outside Pivot`, 'warn');
        const { db, clock } = this.ctx;
        const qty = row.qty_open - q;
        const charges = deliveryCharges('SELL', qty, price);
        db.insert('fills', { position_id: row.id, ts: clock.now().toISOString(), side: 'SELL', qty, price, charges, reason: 'Sold outside Pivot (or backup GTT triggered)' });
        const upd = { qty_open: q, realized: round(row.realized + qty * (price - row.entry_price) - charges), charges: round(row.charges + charges) };
        if (q === 0) Object.assign(upd, { status: 'closed', exit_ts: clock.now().toISOString(), exit_date: ist(clock.now()).date, exit_price: price, exit_reason: 'outside' });
        db.update('positions', row.id, upd);
      }
    }
  }

  async snapshotEquity() {
    const { db, clock } = this.ctx;
    const date = ist(clock.now()).date;
    for (const kind of ['paper', 'live']) {
      if (kind === 'live' && !this.ctx.liveBroker) continue;
      const has = db.get('SELECT COUNT(*) AS n FROM positions WHERE kind = ?', kind).n;
      if (!has && kind !== this.mode) continue;
      const c = await this.capital(kind);
      db.run('INSERT OR REPLACE INTO equity(date, kind, equity, cash, invested, open_pnl) VALUES(?,?,?,?,?,?)', date, kind, c.equity, c.cash, c.invested, c.openPnl);
    }
  }

  holdDays(row) {
    return tradingDaysBetween(row.entry_date, row.exit_date || ist(this.now()).date, this.ctx.settings.holidays);
  }

  rOf(row) {
    return rMultiple({ entryPrice: row.entry_price, initialStop: row.initial_stop }, row.exit_price ?? row.last_price);
  }
}
