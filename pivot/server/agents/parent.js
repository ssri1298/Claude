// PARENT AGENT — runs the trading day autonomously and coordinates the three sub-agents.
//
//  08:00  Morning: make sure Kite is logged in (sends you a one-tap login link on Telegram)
//  08:30  Screener prepares: Nifty 500 data → trend template → VCP setups → watchlist; morning brief
//  09:15–15:30 every minute: Screener scans all 500 → Analyst rates breakouts → Executor sizes,
//         asks for approval (or buys), and manages stops / partial profits / trailing every second
//  15:20  Close check: 21-EMA trailing exits
//  15:40  Post-close: today's candles, fresh analysis for tomorrow, equity snapshot, evening report

import { Screener } from './screener.js';
import { Analyst } from './analyst.js';
import { Executor } from './executor.js';
import { ist, toMinutes, MARKET, isTradingDay, hhmm } from '../core/time.js';
import { round } from '../engine/vcp.js';
import { esc } from '../notify/telegram.js';
import { buildMorning, buildEvening, saveReport, morningText, eveningText } from './reports.js';

const NAME = 'Parent';
const inr = (x) => '₹' + Math.round(Number(x)).toLocaleString('en-IN');

export class Parent {
  constructor(ctx) {
    this.ctx = ctx;
    this.screener = new Screener(ctx);
    this.analyst = new Analyst(ctx);
    this.executor = new Executor(ctx);
    ctx.agents = { screener: this.screener, analyst: this.analyst, executor: this.executor, parent: this };
    this.running = false;
    this.lastMinuteKey = null;
    this.phase = 'starting';
    this.lastReconcile = 0;
  }

  log(msg, level, data) {
    this.ctx.bus.log(NAME, msg, { level, data });
  }

  newDay(date) {
    this.ctx.day = { date, jobs: {}, armed: new Map(), falseAlarm: new Set(), signaled: new Set(), failed: new Set(), extended: new Set(), lowVolLogged: new Set(), nearNotified: new Set(), ticksSeen: false };
  }

  isTradingDate(date) {
    const feed = this.ctx.feed;
    if (feed.isTradingDate) return feed.isTradingDate(date);
    return isTradingDay(date, this.ctx.settings.holidays);
  }

  /** Needs a working market-data connection (Kite logged in, or demo). */
  dataReady() {
    return this.ctx.feed.kind === 'demo' || !!this.ctx.kiteSession?.connected;
  }

  /** One heartbeat (every second in real mode; every simulated minute in demo). */
  async tick() {
    if (this.running) return;
    this.running = true;
    this.lastBeat = Date.now();
    try {
      await this._tick();
    } catch (e) {
      this.log(`Unexpected error: ${e.message}`, 'error');
      console.error(e);
    } finally {
      this.running = false;
    }
  }

  async _tick() {
    const { settings } = this.ctx;
    const t = ist(this.ctx.clock.now());
    if (!this.ctx.day || this.ctx.day.date !== t.date) this.newDay(t.date);
    const day = this.ctx.day;
    const sched = settings.schedule;
    const at = (hhmm) => t.minutes >= toMinutes(hhmm);

    if (!this.isTradingDate(t.date)) {
      this.phase = 'holiday';
      if (!day.jobs.holidayLogged) {
        day.jobs.holidayLogged = true;
        this.log(`${t.date} is not a trading day — agents resting. Open positions are safe with their stops${settings.backupGtt ? ' (and backup GTTs at Zerodha)' : ''}.`);
      }
      return;
    }

    // 08:00 login reminder
    if (at(sched.login) && !day.jobs.login && t.minutes < MARKET.close) {
      day.jobs.login = true;
      if (!this.dataReady()) this.remindLogin();
    }
    // Re-remind 45 minutes later and just before the open (09:10) if still not logged in
    const loginAt = toMinutes(sched.login);
    const again = [...new Set([Math.min(loginAt + 45, toMinutes('09:10')), toMinutes('09:10')])].filter((m) => m > loginAt).map(hhmm);
    for (const r of again) {
      if (at(r) && !day.jobs['login' + r] && t.minutes < toMinutes('09:30')) {
        day.jobs['login' + r] = true;
        if (!this.dataReady()) this.remindLogin();
      }
    }

    // 08:30 preparation (or as soon as possible if the app started late / login came late)
    const prepDue = at(sched.prep) && t.minutes < MARKET.close;
    if (prepDue && !day.jobs.prep && this.dataReady() && !(day.jobs.prepRetryAt > Date.now())) {
      // runs in the background so stops keep being checked while data downloads
      day.jobs.prep = 'running';
      this.screener
        .prepare({ reason: t.minutes > MARKET.open ? 'late start' : 'morning' })
        .then(() => {
          day.jobs.prep = 'done';
          return this.morningBrief();
        })
        .catch(() => {
          day.jobs.prep = null;
          day.jobs.prepRetryAt = Date.now() + 60000;
        });
    }

    const inSession = t.minutes >= MARKET.open && t.minutes < MARKET.close;
    this.phase = t.minutes < MARKET.open ? 'pre-market' : inSession ? 'market' : 'post-market';

    if (inSession && this.dataReady()) {
      // positions: every heartbeat (stops act within ~1 second)
      const isCloseCheck = at(sched.closeCheck) && !day.jobs.closeCheck;
      if (isCloseCheck) {
        day.jobs.closeCheck = true;
        this.log('Close check — evaluating trailing exits (close below 21-day EMA)');
      }
      await this.executor.onTick({ isCloseCheck });

      // Two-stage buy: add the second part of new positions whose breakout held
      const addAt = settings.rules.twoStage?.addTime || '15:15';
      if (settings.rules.twoStage?.enabled !== false && at(addAt) && !day.jobs.stage2) {
        day.jobs.stage2 = true;
        this.executor.stageTwo().catch((e) => this.log(`Second-part buying failed: ${e.message}`, 'error'));
      }

      // minute scan
      const minuteKey = `${t.date} ${t.minutes}`;
      if (minuteKey !== this.lastMinuteKey && day.jobs.prep === 'done') {
        this.lastMinuteKey = minuteKey;
        await this.minuteCycle(t);
      }
      if (this.ctx.liveBroker && Date.now() - this.lastReconcile > 10 * 60000) {
        this.lastReconcile = Date.now();
        await this.executor.reconcile();
      }
    }

    // 15:40 post-close
    if (at(sched.post) && !day.jobs.post && this.dataReady() && !(day.jobs.postRetryAt > Date.now()) && day.jobs.prep !== 'running') {
      day.jobs.post = 'running';
      (async () => {
        await this.screener.prepare({ reason: 'after close' });
        await this.executor.snapshotEquity();
        await this.eveningReport();
      })()
        .then(() => (day.jobs.post = 'done'))
        .catch(() => {
          day.jobs.post = null;
          day.jobs.postRetryAt = Date.now() + 5 * 60000;
        });
    }
  }

  async minuteCycle(t) {
    const signals = this.screener.scanMinute();
    if (signals.length) {
      const ranked = this.analyst.rank(signals);
      for (const s of ranked) await this.executor.consider(s);
    }
    this.executor.expireApprovals();
    if (t.minutes - MARKET.open === 30 && !this.ctx.feed.status().lastTick && this.ctx.feed.kind === 'kite') {
      this.log('No live prices received 30 minutes after the open — is today a market holiday? Add it in Settings → Market holidays if so.', 'warn');
    }
    this.ctx.bus.push('scan', { at: t.hhmm, ...this.screener.status.live });
  }

  remindLogin() {
    const url = this.ctx.publicUrl ? `${this.ctx.publicUrl}/api/kite/login` : null;
    this.log('Waiting for your daily Kite login (required by Zerodha every morning)', 'warn');
    this.ctx.notify?.(
      'login',
      '🔑 <b>Good morning! Log in to Zerodha</b>\nTap here, sign in to Kite as usual, and the agents will trade today. Zerodha requires this once every day.',
      url ? [[{ text: 'Log in to Kite', url }]] : undefined,
    );
  }

  async morningBrief() {
    const r = await buildMorning(this.ctx);
    saveReport(this.ctx.db, r);
    this.log(`Morning brief ready — ${r.top.length} top setups, market ${r.market.label}. Full report on the Reports page.`);
    this.ctx.bus.push('report', { type: 'morning', date: r.date });
    this.ctx.notify?.('morningBrief', morningText(r), this.ctx.publicUrl ? [[{ text: 'Open full report', url: `${this.ctx.publicUrl}/#/reports` }]] : undefined);
  }

  async eveningReport() {
    const r = await buildEvening(this.ctx);
    saveReport(this.ctx.db, r);
    this.log('Day complete — evening report saved on the Reports page', 'success');
    this.ctx.bus.push('report', { type: 'evening', date: r.date });
    this.ctx.notify?.('eveningReport', eveningText(r), this.ctx.publicUrl ? [[{ text: 'Open full report', url: `${this.ctx.publicUrl}/#/reports` }]] : undefined);
  }
}
