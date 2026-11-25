// Keeps an eye on Pivot itself.
//  • Heartbeat: every minute Pivot calls a check-in URL you create at a free outside service such as
//    healthchecks.io. If the server dies, the check-ins stop and that service alerts your phone/email.
//    While something is wrong (no live prices in market hours) Pivot reports a failure instead.
//  • Inside checks (market hours): live price stream down or silent for 2+ minutes, morning analysis
//    not done by 09:20 → a "health" notification, and another when it recovers.
//  • Daily backups: a full copy kept on the server (last 7) and a small trades-only copy that can be
//    downloaded from the app and sent to your Telegram.

import { mkdirSync, readdirSync, rmSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ist, MARKET, toMinutes } from './time.js';

const HEAVY_TABLES = ['candles', 'candles15', 'candles15_ranges', 'score_history', 'analysis', 'events'];

export function createWatchdog(ctx, { dataDir, log }) {
  const state = { problem: null, since: null, notified: false, lastPing: null, lastPingOk: null, lastPingError: null };
  const backupDir = dataDir ? join(dataDir, 'backups') : null;

  function currentProblem() {
    const p = ctx.parent;
    if (!p) return null;
    const t = ist(ctx.clock.now());
    if (p.phase !== 'market' || ctx.demo) return null;
    if (!p.dataReady()) return null; // waiting for the daily login is reminded separately
    const st = ctx.feed.status?.() || {};
    if (!st.connected) return 'The live price stream from Zerodha is disconnected — stops are still covered by the backup GTT at Zerodha (if switched on), but Pivot cannot see prices.';
    if (st.lastTick && Date.now() - st.lastTick > 120000) return `No live prices for ${Math.round((Date.now() - st.lastTick) / 60000)} minutes — the price stream seems stuck.`;
    if (t.minutes >= toMinutes('09:20') && ctx.day?.jobs?.prep !== 'done') return 'The morning analysis has not finished — no new buys until it does.';
    return null;
  }

  async function check() {
    const prob = currentProblem();
    const now = Date.now();
    if (prob) {
      if (!state.problem) {
        state.problem = prob;
        state.since = now;
        state.notified = false;
      }
      state.problem = prob;
      if (!state.notified && now - state.since >= 120000) {
        state.notified = true;
        log?.(`⚠️ Health check: ${prob}`, 'error');
        ctx.notify?.('health', `⚠️ <b>Pivot health check</b>\n${prob}\nPivot keeps retrying; you'll get a message when it recovers.`);
      }
    } else if (state.problem) {
      if (state.notified) {
        log?.('✅ Health check: back to normal', 'success');
        ctx.notify?.('health', '✅ <b>Pivot is back to normal</b>');
      }
      state.problem = null;
      state.since = null;
      state.notified = false;
    }
    await ping(state.problem && state.notified ? 'fail' : 'ok');
  }

  async function ping(status) {
    const url = (ctx.secrets?.heartbeatUrl || '').trim();
    if (!url || ctx.demo) return;
    try {
      const target = status === 'fail' ? url.replace(/\/$/, '') + '/fail' : url;
      const res = await fetch(target, { method: 'GET', signal: AbortSignal.timeout(10000) });
      state.lastPing = new Date().toISOString();
      state.lastPingOk = res.ok;
      state.lastPingError = res.ok ? null : `answered ${res.status}`;
    } catch (e) {
      state.lastPing = new Date().toISOString();
      state.lastPingOk = false;
      state.lastPingError = e.message;
    }
  }

  // ------------------------------------------------------------------ backups
  function listBackups() {
    if (!backupDir || !existsSync(backupDir)) return [];
    return readdirSync(backupDir)
      .filter((f) => f.endsWith('.db'))
      .map((f) => ({ file: f, size: statSync(join(backupDir, f)).size, mtime: statSync(join(backupDir, f)).mtime.toISOString(), small: f.includes('-trades-') }))
      .sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
  }

  async function backup({ send = false } = {}) {
    if (!backupDir) throw new Error('Backups need a data folder');
    mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const full = join(backupDir, `pivot-full-${stamp}.db`);
    const small = join(backupDir, `pivot-trades-${stamp}.db`);
    for (const f of [full, small]) if (existsSync(f)) rmSync(f);
    ctx.db.raw.exec(`VACUUM INTO '${full.replace(/'/g, "''")}'`);
    ctx.db.raw.exec(`VACUUM INTO '${small.replace(/'/g, "''")}'`);
    const sdb = new DatabaseSync(small);
    for (const t of HEAVY_TABLES) {
      try {
        sdb.exec(`DELETE FROM ${t}`);
      } catch {}
    }
    // never put API secrets into a file that leaves the server
    try {
      sdb.exec("DELETE FROM kv WHERE key IN ('secrets', 'auth', 'sessionSecret', 'kiteSession', 'vapidKeys', 'pushSubs', 'telegramPair')");
    } catch {}
    sdb.exec('VACUUM');
    sdb.close();
    // keep the last 7 of each kind
    const all = listBackups();
    for (const kind of [true, false]) all.filter((b) => b.small === kind).slice(7).forEach((b) => rmSync(join(backupDir, b.file), { force: true }));
    ctx.db.kvSet('lastBackup', { at: new Date().toISOString(), full: full.split('/').pop(), small: small.split('/').pop(), smallSize: statSync(small).size });
    log?.(`Backup saved (${Math.round(statSync(small).size / 1024)} KB trades copy + full copy on the server)`);
    if (send && ctx.telegram?.sendDocument && ctx.secrets?.telegramChatId) {
      const ok = await ctx.telegram.sendDocument(small, `🗄 Pivot backup · ${stamp.slice(0, 10)}\nYour trades, settings and reports (no market data, no passwords). Keep it — it can restore your history.`);
      if (ok) log?.('Backup sent to your Telegram');
    }
    return ctx.db.kvGet('lastBackup');
  }

  function latestSmall() {
    const b = listBackups().find((x) => x.small);
    return b ? { path: join(backupDir, b.file), name: b.file } : null;
  }

  let timer = null;
  return {
    state,
    start() {
      timer = setInterval(() => check().catch(() => {}), 60000);
      setTimeout(() => check().catch(() => {}), 15000);
    },
    stop() {
      clearInterval(timer);
    },
    check,
    backup,
    listBackups,
    latestSmall,
    readFile: (p) => readFileSync(p),
    status() {
      return { problem: state.problem, since: state.since, heartbeat: { configured: !!ctx.secrets?.heartbeatUrl, lastPing: state.lastPing, ok: state.lastPingOk, error: state.lastPingError }, lastBackup: ctx.db.kvGet('lastBackup'), backups: listBackups().length };
    },
  };
}

/** Is today the last trading day before a new week / month starts? (for weekly & monthly reports) */
export function periodEnds(date, nextTradingDate) {
  const wk = (d) => {
    const x = new Date(d + 'T12:00:00Z');
    const day = (x.getUTCDay() + 6) % 7;
    x.setUTCDate(x.getUTCDate() - day);
    return x.toISOString().slice(0, 10);
  };
  return { week: wk(date) !== wk(nextTradingDate), month: date.slice(0, 7) !== nextTradingDate.slice(0, 7) };
}

export { MARKET };
