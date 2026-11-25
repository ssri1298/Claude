// SUB-AGENT 1 — SCREENER
// Before the open: downloads daily candles for the Nifty 500, ranks relative strength, checks the
// Minervini trend template and finds VCP bases (pivot + stop) → watchlist.
// Every minute in market hours: checks all 500 live prices against their pivots and flags
// breakouts that come with strong volume. Also watches recent stop-outs for re-entry.

import { refreshFlags } from '../core/stockflags.js';
import { prepareUniverse, analyzeUniverse } from '../engine/analyze.js';
import { volumePace } from '../engine/market.js';
import { ist, addDays, MARKET, prevTradingDay, tradingDaysBetween } from '../core/time.js';
import { round } from '../engine/vcp.js';
import { NIFTY50_TOKEN } from '../broker/feeds.js';
import { evaluateChecks, describeChecks } from '../engine/confirm.js';

const NAME = 'Screener';
const HISTORY_BARS = 420;

export class Screener {
  constructor(ctx) {
    this.ctx = ctx;
    this.status = { state: 'idle', lastPrep: null, lastScan: null, progress: null, counts: {} };
  }

  log(msg, level, data) {
    this.ctx.bus.log(NAME, msg, { level, data });
  }

  /** Data cut-off: during/before market hours use yesterday's bars (today's candle is incomplete). */
  dataUntil() {
    const { feed, clock } = this.ctx;
    if (feed.visibleUntil) return feed.visibleUntil();
    const t = ist(clock.now());
    return t.minutes >= MARKET.close + 5 ? t.date : prevTradingDay(t.date, this.ctx.settings.holidays);
  }

  async prepare({ reason = 'scheduled' } = {}) {
    const { db, feed, bus } = this.ctx;
    if (this.status.state === 'preparing') return;
    this.status.state = 'preparing';
    const started = Date.now();
    try {
      this.log(`Starting market preparation (${reason})`);
      const uni = await feed.universe();
      db.tx(() => {
        for (const u of uni)
          db.run(
            'INSERT INTO universe(symbol,name,industry,token,tick,active) VALUES(?,?,?,?,?,1) ON CONFLICT(symbol) DO UPDATE SET name=excluded.name, industry=excluded.industry, token=excluded.token, tick=excluded.tick, active=1',
            u.symbol,
            u.name,
            u.industry,
            u.token,
            u.tick ?? 0.05,
          );
      });
      this.ctx.universe = uni;
      const until = this.dataUntil();
      const from = addDays(until, -620);
      const tokens = [...uni.map((u) => ({ token: u.token, symbol: u.symbol })), { token: feed.kind === 'demo' ? 256265 : NIFTY50_TOKEN, symbol: 'NIFTY 50', index: true }];
      let done = 0,
        fetched = 0,
        failed = 0;
      for (const t of tokens) {
        const lastRow = db.get('SELECT MAX(date) AS d FROM candles WHERE token = ?', t.token);
        const last = lastRow?.d;
        if (!last || last < until) {
          try {
            const start = last ? addDays(last, 1) : from;
            const candles = t.index ? await feed.indexHistory(start, until) : await feed.history(t.token, start, until);
            db.tx(() => {
              for (const c of candles)
                db.run(
                  'INSERT OR REPLACE INTO candles(token,date,open,high,low,close,volume) VALUES(?,?,?,?,?,?,?)',
                  t.token,
                  c.date,
                  c.open,
                  c.high,
                  c.low,
                  c.close,
                  c.volume,
                );
            });
            fetched++;
          } catch (e) {
            failed++;
            if (failed <= 3) this.log(`Could not download ${t.symbol}: ${e.message}`, 'warn');
            if (e.type === 'TokenException') throw new Error('Kite session expired — please log in again');
          }
        }
        done++;
        if (done % 25 === 0 || done === tokens.length) {
          this.status.progress = { done, total: tokens.length };
          bus.push('progress', { agent: NAME, done, total: tokens.length });
        }
      }
      if (fetched === 0 && this.ctx.asOf === until && this.ctx.analysis.size) {
        this.log('Data already up to date — using the latest analysis');
        refreshFlags(this.ctx, { log: (m, l) => this.log(m, l) }).catch(() => {});
        return;
      }
      this.analyse(until);
      this.backfillScores().catch(() => {});
      this.status.lastPrep = this.ctx.clock.now().toISOString();
      // Results dates, surveillance lists and circuit bands (in the background; never blocks trading)
      refreshFlags(this.ctx, { log: (m, l) => this.log(m, l) }).catch((e) => this.log(`Stock filters: ${e.message}`, 'warn'));
      this.status.progress = null;
      const c = this.status.counts;
      this.log(
        `Analysed ${c.total} stocks in ${Math.round((Date.now() - started) / 1000)}s — ${c.trendPass} pass the trend template, ${c.setups} VCP setups (${c.near} near pivot). Market: ${this.ctx.market?.label}`,
        'success',
      );
    } catch (e) {
      this.log(`Preparation failed: ${e.message}`, 'error');
      throw e;
    } finally {
      this.status.progress = null;
      this.status.state = 'ready';
    }
  }

  /** Download older daily candles (for backtesting). Runs in the background. */
  async extendHistory(years = 5) {
    const { db, feed, bus } = this.ctx;
    if (this.status.extending) return;
    this.status.extending = true;
    try {
      const uni = db.all('SELECT * FROM universe WHERE active = 1');
      const target = addDays(this.dataUntil(), -Math.round(years * 365));
      const idxToken = feed.kind === 'demo' ? 256265 : NIFTY50_TOKEN;
      const list = [{ token: idxToken, symbol: 'NIFTY 50', index: true }, ...uni];
      let done = 0;
      this.log(`Downloading up to ${years} years of history for ${list.length} instruments — this takes a few minutes`);
      for (const u of list) {
        const first = db.get('SELECT MIN(date) AS d FROM candles WHERE token = ?', u.token)?.d;
        if (first && first > target) {
          // Kite allows ~2000 days of daily candles per request
          const to = addDays(first, -1);
          try {
            const candles = u.index ? await feed.indexHistory(target, to) : await feed.history(u.token, target, to);
            db.tx(() => {
              for (const c of candles) db.run('INSERT OR IGNORE INTO candles(token,date,open,high,low,close,volume) VALUES(?,?,?,?,?,?,?)', u.token, c.date, c.open, c.high, c.low, c.close, c.volume);
            });
          } catch (e) {
            if (e.type === 'TokenException') throw e;
          }
        }
        done++;
        if (done % 25 === 0) bus.push('progress', { agent: NAME, task: 'history', done, total: list.length });
      }
      this.log('Long history download complete — the backtester can now test several years', 'success');
    } catch (e) {
      this.log(`History download stopped: ${e.message}`, 'error');
    } finally {
      this.status.extending = false;
    }
  }

  /** One row per stock per day: the score and its parts, for the score-history charts. */
  saveScores(stocks, date) {
    const { db } = this.ctx;
    for (const a of stocks)
      db.run(
        'INSERT OR REPLACE INTO score_history(symbol,date,score,grade,stage,rs,close,pivot,trend_pass,parts) VALUES(?,?,?,?,?,?,?,?,?,?)',
        a.symbol,
        date,
        a.score,
        a.grade,
        a.stage,
        a.rsRating,
        a.close,
        a.vcp?.valid ? a.vcp.pivot : null,
        a.trend?.passCount ?? null,
        JSON.stringify(Object.fromEntries((a.scoreParts || []).map((p) => [p.key, p.points]))),
      );
  }

  /**
   * Fill in past days' scores (once) from stored candles, so the charts have history from day one.
   * Runs a day at a time in the background so it never blocks the agents.
   */
  async backfillScores(days = 90) {
    const { db, feed } = this.ctx;
    if (this.backfilling) return;
    this.backfilling = true;
    try {
      const idxToken = feed.kind === 'demo' ? 256265 : NIFTY50_TOKEN;
      const until = this.dataUntil();
      const dates = db.all('SELECT date FROM candles WHERE token = ? AND date <= ? ORDER BY date DESC LIMIT ?', idxToken, until, days).map((r) => r.date).reverse();
      const have = new Set(db.all('SELECT DISTINCT date FROM score_history WHERE date >= ?', dates[0] || until).map((r) => r.date));
      const missing = dates.filter((d) => !have.has(d));
      if (!missing.length) return;
      const uni = db.all('SELECT * FROM universe WHERE active = 1');
      const load = (token) => db.all('SELECT date,open,high,low,close,volume FROM candles WHERE token = ? AND date <= ? ORDER BY date DESC LIMIT ?', token, until, HISTORY_BARS + days).reverse();
      const prepared = prepareUniverse(uni.map((u) => ({ ...u, candles: load(u.token) })));
      const indexCandles = load(idxToken);
      for (const d of missing) {
        const res = analyzeUniverse(prepared, { indexCandles: indexCandles.length > 210 ? indexCandles : null, date: d });
        db.tx(() => this.saveScores(res.stocks, d));
        await new Promise((r) => setImmediate(r));
      }
      this.log(`Score history ready — filled in ${missing.length} past trading days`);
    } catch (e) {
      this.log(`Could not fill in score history: ${e.message}`, 'warn');
    } finally {
      this.backfilling = false;
    }
  }

  /** Run the full analysis on stored candles (fast, no network). */
  analyse(until = this.dataUntil()) {
    const { db } = this.ctx;
    const uni = this.ctx.universe || db.all('SELECT * FROM universe WHERE active = 1');
    const load = (token) =>
      db.all('SELECT date,open,high,low,close,volume FROM candles WHERE token = ? AND date <= ? ORDER BY date DESC LIMIT ?', token, until, HISTORY_BARS).reverse();
    const stocks = uni.map((u) => ({ ...u, candles: load(u.token) }));
    const indexCandles = load(this.ctx.feed.kind === 'demo' ? 256265 : NIFTY50_TOKEN);
    const res = analyzeUniverse(prepareUniverse(stocks), { indexCandles: indexCandles.length > 210 ? indexCandles : null });
    this.ctx.analysis = new Map(res.stocks.map((a) => [a.symbol, a]));
    this.ctx.market = res.market || { regime: 'unknown', label: 'Unknown', notes: ['Index history unavailable'] };
    this.ctx.breadth = res.breadth;
    this.ctx.asOf = until;

    const setups = res.stocks.filter((a) => a.trend.pass && a.vcp.valid && ['near', 'forming', 'breakout'].includes(a.stage));
    this.status.counts = {
      total: res.stocks.length,
      trendPass: res.stocks.filter((a) => a.trend.pass).length,
      setups: setups.length,
      near: setups.filter((a) => a.stage === 'near' || a.stage === 'breakout').length,
    };

    db.tx(() => {
      db.run('DELETE FROM analysis');
      for (const a of res.stocks) db.run('INSERT INTO analysis(symbol, as_of, score, stage, data) VALUES(?,?,?,?,?)', a.symbol, a.asOf, a.score, a.stage, JSON.stringify(a));
      this.saveScores(res.stocks, until);
      db.run(
        'INSERT OR REPLACE INTO screen_runs(date,total,trend_pass,setups,near,regime,data) VALUES(?,?,?,?,?,?,?)',
        until,
        this.status.counts.total,
        this.status.counts.trendPass,
        this.status.counts.setups,
        this.status.counts.near,
        this.ctx.market.regime,
        JSON.stringify({ breadth: res.breadth, market: this.ctx.market, top: setups.slice(0, 15).map((a) => ({ symbol: a.symbol, score: a.score, pivot: a.vcp.pivot })) }),
      );
      this.updateWatchlist(setups, res.stocks, until);
    });
    return res;
  }

  updateWatchlist(setups, all, date) {
    const { db } = this.ctx;
    const inSetup = new Set(setups.map((a) => a.symbol));
    for (const a of setups) {
      const row = db.get('SELECT * FROM watchlist WHERE symbol = ?', a.symbol);
      const brief = { grade: a.grade, stage: a.stage, rs: a.rsRating, contractions: a.vcp.contractions.map((k) => k.depthPct), industry: a.industry };
      if (!row) {
        db.run(
          'INSERT INTO watchlist(symbol,status,first_seen,updated,pivot,stop,score,best_score,days_watched,note,data) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
          a.symbol,
          'watching',
          date,
          date,
          a.vcp.pivot,
          a.vcp.stop,
          a.score,
          a.score,
          1,
          'New VCP setup',
          JSON.stringify(brief),
        );
      } else {
        const samePivot = Math.abs((row.pivot || 0) - a.vcp.pivot) < 0.01;
        let status = ['watching', 'dropped', 'failed', 'extended'].includes(row.status) ? 'watching' : row.status;
        if (row.status === 'failed' && samePivot) status = 'failed'; // undercut the low — stays flagged until a new base forms
        if (row.status === 'triggered' && !samePivot) status = 'watching';
        db.run(
          'UPDATE watchlist SET status=?, updated=?, pivot=?, stop=?, score=?, best_score=MAX(best_score, ?), days_watched=days_watched + (CASE WHEN updated < ? THEN 1 ELSE 0 END), note=?, data=? WHERE symbol=?',
          status,
          date,
          a.vcp.pivot,
          a.vcp.stop,
          a.score,
          a.score,
          date,
          row.status === 'watching' ? row.note : 'Setup re-formed',
          JSON.stringify(brief),
          a.symbol,
        );
      }
    }
    const bySym = new Map(all.map((a) => [a.symbol, a]));
    for (const row of db.all("SELECT * FROM watchlist WHERE status = 'watching'")) {
      if (inSetup.has(row.symbol)) continue;
      const a = bySym.get(row.symbol);
      const why = a?.stage === 'extended' ? 'Broke out and moved past the buy zone' : a?.explain?.bad?.[0] || a?.vcp?.reasons?.[0] || 'Setup no longer valid';
      db.run('UPDATE watchlist SET status=?, updated=?, note=? WHERE symbol=?', a?.stage === 'extended' ? 'extended' : 'dropped', date, why, row.symbol);
    }
  }

  /**
   * Breakout confirmation. The first tick above the pivot only "arms" the stock and opens a probe
   * (a tracking-only position that measures how first-tick buying would have done). A signal is
   * sent once the confirmation checks pass: 15-min candle close above the pivot, above VWAP,
   * top third of the day's range, gap-up rule, 0.3% clearance and volume pace.
   */
  confirmBreakout(a, q, ltp, pivot, pace, minutes) {
    const { settings, day, intraday } = this.ctx;
    const rules = settings.rules;
    const c = { ...rules.confirm };
    const tr = intraday?.get(a.token);
    if (!day.armed.has(a.symbol)) {
      const bucket = intraday ? intraday.bucketOf(minutes) : 0;
      day.armed.set(a.symbol, { minute: minutes, bucket, price: ltp });
      this.ctx.agents?.executor?.openProbe(a, ltp, pivot, a.vcp.stop);
      if (c.enabled && !this.falseAlarmSeen?.has(`${a.symbol}@${pivot}`)) this.log(`${a.symbol} crossed its pivot ₹${pivot} at ₹${ltp} — waiting for confirmation`);
    }
    const arm = day.armed.get(a.symbol);
    const { checks, confirmed } = c.enabled
      ? evaluateChecks(
          {
            ltp,
            pivot,
            dayOpen: q.open,
            dayHigh: q.high,
            dayLow: q.low,
            vwap: tr?.vwap,
            orHigh: tr?.orHigh,
            lastBar: intraday?.lastClosedBar(a.token),
            armedBucket: arm.bucket,
            minutes,
            volPace: pace,
          },
          c,
          rules.minVolPace,
        )
      : { checks: { volume: pace != null && pace >= rules.minVolPace }, confirmed: pace != null && pace >= rules.minVolPace };
    this.ctx.agents?.executor?.recordProbeChecks(a.symbol, checks, confirmed);
    if (!confirmed) {
      if (checks.volume === false && !day.lowVolLogged.has(a.symbol)) {
        day.lowVolLogged.add(a.symbol);
        this.log(`${a.symbol} is above its pivot ₹${pivot} but volume pace is only ${round(pace ?? 0, 1)}× — waiting for volume`);
      }
      return null;
    }
    day.signaled.add(a.symbol);
    day.armed.delete(a.symbol);
    this.log(`🚀 ${a.symbol} breakout confirmed above ₹${pivot} at ₹${ltp} on ${round(pace, 1)}× volume${c.enabled ? ' — ' + describeChecks(checks).join(' · ') : ''}`, 'success');
    return { type: 'breakout', symbol: a.symbol, a, price: ltp, pivot, chartStop: a.vcp.stop, volPace: pace, checks };
  }

  /** Minute scan across the whole universe. Returns breakout / re-entry signals. */
  scanMinute() {
    const { quotes, analysis, settings, clock, db } = this.ctx;
    const rules = settings.rules;
    const t = ist(clock.now());
    const minutes = t.minutes - MARKET.open;
    const day = this.ctx.day;
    const signals = [];
    let breakingOut = 0,
      near = 0;
    const live = (this.ctx.live = this.ctx.live || new Map());

    for (const a of analysis.values()) {
      const q = quotes.get(a.token);
      if (!q || !q.ltp) continue;
      const ltp = q.ltp;
      const pace = volumePace(q.volume || 0, minutes, a.avgVol50);
      const pivot = a.vcp?.pivot;
      const l = {
        ltp,
        changePct: q.prevClose ? round((ltp / q.prevClose - 1) * 100) : null,
        volPace: pace == null ? null : round(pace, 2),
        distPivotPct: pivot ? round((ltp / pivot - 1) * 100) : null,
        high: q.high,
        low: q.low,
      };
      live.set(a.symbol, l);
      if (!(a.trend?.pass && a.vcp?.valid && ['near', 'forming', 'breakout'].includes(a.stage))) continue;

      const inZone = ltp > pivot && ltp <= pivot * (1 + rules.buyZonePct / 100);
      if (inZone) breakingOut++;
      else if (l.distPivotPct >= -3 && l.distPivotPct <= 0) near++;

      if (ltp < a.vcp.lastLow && !day.failed.has(a.symbol)) {
        day.failed.add(a.symbol);
        const r = db.run("UPDATE watchlist SET status='failed', note=? WHERE symbol=? AND status='watching'", `Broke below the last contraction low ₹${a.vcp.lastLow}`, a.symbol);
        if (Number(r.changes)) this.log(`${a.symbol} broke below its last contraction low (₹${a.vcp.lastLow}) — setup failed`, 'warn');
        continue;
      }
      if (day.signaled.has(a.symbol)) continue;
      if (inZone) {
        if (minutes < rules.minMinutesAfterOpen) continue;
        const sig = this.confirmBreakout(a, q, ltp, pivot, pace, minutes);
        if (sig) signals.push(sig);
      } else if (day.armed.get(a.symbol) && ltp <= pivot) {
        day.armed.delete(a.symbol);
        const key = `${a.symbol}@${pivot}`;
        this.falseAlarmSeen = this.falseAlarmSeen || new Set();
        if (!this.falseAlarmSeen.has(key)) {
          this.falseAlarmSeen.add(key); // log once per setup, not every time it wobbles around the pivot
          this.log(`${a.symbol} fell back below its pivot ₹${pivot} before confirming — false alarm avoided`, 'warn');
        }
      } else if (ltp > pivot * (1 + rules.buyZonePct / 100) && !day.extended.has(a.symbol)) {
        day.extended.add(a.symbol);
        this.log(`${a.symbol} is more than ${rules.buyZonePct}% above its pivot — too extended to buy`);
      } else if (settings.notify.nearPivot && l.distPivotPct >= -1 && l.distPivotPct <= 0 && !day.nearNotified.has(a.symbol)) {
        day.nearNotified.add(a.symbol);
        this.ctx.notify?.('nearPivot', `👀 <b>${a.symbol}</b> is within 1% of its pivot ₹${pivot}`);
      }
    }

    // Re-entry watch: recent stop-outs reclaiming their pivot
    if (rules.reentry?.enabled) {
      const kind = settings.tradingMode;
      const recent = db.all(
        "SELECT * FROM positions WHERE kind = ? AND status = 'closed' AND exit_reason = 'stop' AND partial_done = 0 ORDER BY exit_ts DESC LIMIT 50",
        kind,
      );
      const seen = new Set();
      for (const p of recent) {
        if (seen.has(p.symbol) || day.signaled.has(p.symbol)) continue;
        seen.add(p.symbol);
        if (p.exit_date === t.date) continue;
        if (tradingDaysBetween(p.exit_date, t.date, settings.holidays) > rules.reentry.windowDays) continue;
        if (db.get("SELECT id FROM positions WHERE symbol = ? AND kind = ? AND status = 'open'", p.symbol, kind)) continue;
        const setup = JSON.parse(p.setup || '{}');
        const tries = db.get('SELECT COUNT(*) AS n FROM positions WHERE symbol = ? AND kind = ? AND is_reentry = 1 AND entry_date >= ?', p.symbol, kind, setup.firstEntryDate || p.entry_date).n;
        if (tries >= rules.reentry.maxPerSetup) continue;
        const a = analysis.get(p.symbol);
        const q = a && quotes.get(a.token);
        if (!q || !setup.pivot) continue;
        const pace = volumePace(q.volume || 0, minutes, a.avgVol50);
        if (q.ltp > setup.pivot && q.ltp <= setup.pivot * (1 + rules.buyZonePct / 100) && pace >= rules.minVolPace && minutes >= rules.minMinutesAfterOpen && a.trend.passCount >= 7) {
          day.signaled.add(p.symbol);
          const chartStop = Math.min(a.vcp?.lastLow ?? Infinity, q.low ?? Infinity) * 0.995;
          signals.push({ type: 'reentry', symbol: p.symbol, a, price: q.ltp, pivot: setup.pivot, chartStop, volPace: pace, firstEntryDate: setup.firstEntryDate || p.entry_date });
          this.log(`🔁 ${p.symbol} reclaimed its pivot ₹${setup.pivot} after a stop-out — re-entry candidate`, 'success');
        }
      }
    }

    this.status.lastScan = clock.now().toISOString();
    this.status.lastScanReal = Date.now();
    this.status.live = { breakingOut, near, scanned: live.size };
    return signals;
  }
}
