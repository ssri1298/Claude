// Builds the shared context (database, clock, feed, brokers, notifier) and starts the agents.

import { openDb } from './core/db.js';
import { Bus } from './core/bus.js';
import { RealClock, SimClock, ist, istDate, MARKET, toMinutes } from './core/time.js';
import { loadSettings, saveSettings, loadSecrets, saveSecrets } from './core/settings.js';
import { KiteClient } from './broker/kite.js';
import { KiteFeed } from './broker/feeds.js';
import { LiveBroker } from './broker/live.js';
import { DemoFeed } from './demo/demoFeed.js';
import { Telegram } from './notify/telegram.js';
import { Parent } from './agents/parent.js';
import { startQuotePusher } from './core/quotes.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function createRuntime({ dbFile, demo = false, publicUrl = '', autostart = true } = {}) {
  const db = openDb(dbFile);
  const quotes = new Map();
  const ctx = { db, quotes, demo, publicUrl: publicUrl.replace(/\/$/, ''), analysis: new Map(), live: new Map(), market: null };
  ctx.settings = loadSettings(db);
  ctx.reloadSettings = () => (ctx.settings = loadSettings(db));
  ctx.updateSettings = (patch) => {
    const before = ctx.settings.tradingMode;
    ctx.settings = saveSettings(db, patch);
    if (before !== ctx.settings.tradingMode) {
      ctx.bus.log('Parent', ctx.settings.tradingMode === 'live' ? '⚠️ Switched to LIVE trading — real orders will be placed' : 'Switched to PAPER trading', { level: 'warn' });
      refreshLiveBroker();
    }
    return ctx.settings;
  };
  ctx.secrets = loadSecrets(db);

  // ---------- clock + feed
  if (demo) {
    const feed = new DemoFeed({ quotes, clock: null });
    const saved = db.kvGet('demoClock');
    ctx.clock = new SimClock(saved ? new Date(saved) : istDate(feed.firstDay(), toMinutes('08:29')));
    feed.clock = ctx.clock;
    ctx.feed = feed;
  } else {
    ctx.clock = new RealClock();
  }
  ctx.bus = new Bus(db, ctx.clock);

  // ---------- Kite
  ctx.kiteSession = { connected: false };
  const makeKite = () => new KiteClient({ apiKey: ctx.secrets.kiteApiKey, apiSecret: ctx.secrets.kiteApiSecret });
  ctx.kite = makeKite();
  if (!demo) ctx.feed = new KiteFeed({ kite: ctx.kite, db, quotes, log: (m, l) => ctx.bus.log('Screener', m, { level: l }) });

  function refreshLiveBroker() {
    ctx.liveBroker = !demo && ctx.kiteSession.connected ? new LiveBroker(ctx.kite, (m, l) => ctx.bus.log('Executor', m, { level: l })) : null;
  }

  ctx.kiteLoginUrl = () => (ctx.secrets.kiteApiKey ? ctx.kite.loginUrl() : null);

  ctx.completeKiteLogin = async (requestToken) => {
    const s = await ctx.kite.createSession(requestToken);
    if (ctx.secrets.kiteUserId && s.user_id !== ctx.secrets.kiteUserId) {
      ctx.kite.accessToken = null;
      throw new Error(`This Kite account (${s.user_id}) is not the one set up in Pivot`);
    }
    if (!ctx.secrets.kiteUserId) ctx.secrets = saveSecrets(db, { kiteUserId: s.user_id });
    db.kvSet('kiteSession', { accessToken: s.access_token, date: ist().date, userName: s.user_name, userId: s.user_id, at: Date.now() });
    await onKiteConnected(s.user_name);
    return s;
  };

  async function onKiteConnected(userName) {
    ctx.kiteSession = { connected: true, userName, since: new Date().toISOString() };
    refreshLiveBroker();
    ctx.bus.log('Parent', `Connected to Zerodha as ${userName}`, { level: 'success' });
    let uni = db.all('SELECT token FROM universe WHERE active = 1');
    if (uni.length < 100) {
      try {
        uni = await ctx.feed.universe();
      } catch (e) {
        ctx.bus.log('Screener', e.message, { level: 'error' });
      }
    }
    ctx.feed.start(uni.map((u) => u.token));
    ctx.bus.push('kite', {});
  }

  async function restoreKiteSession() {
    if (demo || !ctx.secrets.kiteApiKey) return;
    const s = db.kvGet('kiteSession');
    if (!s?.accessToken) return;
    const t = ist();
    // Kite tokens expire around 06:00 IST the next morning
    if (s.date !== t.date && t.minutes >= 6 * 60) return;
    ctx.kite.accessToken = s.accessToken;
    try {
      await ctx.kite.profile();
      await onKiteConnected(s.userName);
    } catch {
      ctx.kite.accessToken = null;
    }
  }

  ctx.reconfigureKite = () => {
    ctx.secrets = loadSecrets(db);
    const token = ctx.kite.accessToken;
    ctx.kite.apiKey = ctx.secrets.kiteApiKey;
    ctx.kite.apiSecret = ctx.secrets.kiteApiSecret;
    ctx.kite.accessToken = token;
  };

  // ---------- Telegram
  ctx.reconfigureTelegram = () => {
    ctx.telegram?.stop();
    ctx.secrets = loadSecrets(db);
    ctx.telegram = new Telegram({
      token: ctx.secrets.telegramToken,
      chatId: ctx.secrets.telegramChatId,
      log: (m, l) => ctx.bus.log('Parent', m, { level: l }),
      getPairCode: () => {
        const p = db.kvGet('telegramPair');
        return p && p.exp > Date.now() ? p.code : null;
      },
      onPair: (chatId) => {
        db.kvSet('telegramPair', null);
        ctx.secrets = saveSecrets(db, { telegramChatId: chatId });
        ctx.bus.log('Parent', 'Telegram connected', { level: 'success' });
        ctx.bus.push('settings', {});
      },
      onCallback: async (action, id) => {
        if (action === 'approve' || action === 'reject') return ctx.agents.executor.decide(id, action, 'telegram');
        return 'Unknown action';
      },
      onCommand: (cmd) => telegramCommand(ctx, cmd),
    });
    return ctx.telegram.start();
  };
  ctx.reconfigureTelegram();

  ctx.notify = async (type, text, buttons) => {
    if (type !== 'login' && ctx.settings.notify?.[type] === false) return null;
    return ctx.telegram?.send(text, buttons);
  };

  // ---------- agents
  const parent = new Parent(ctx);
  ctx.parent = parent;

  // Restore yesterday's analysis instantly from stored candles (UI has data before the morning run)
  try {
    if (db.get('SELECT COUNT(*) AS n FROM candles').n > 1000) parent.screener.analyse();
  } catch (e) {
    console.error('restore analysis failed', e);
  }

  ctx.stop = () => {
    ctx.stopped = true;
    clearInterval(ctx.interval);
    clearInterval(ctx.quoteTimer);
    ctx.telegram?.stop();
    ctx.feed?.stop?.();
  };

  if (autostart) {
    ctx.quoteTimer = startQuotePusher(ctx);
    if (demo) startDemoDriver(ctx);
    else {
      await restoreKiteSession();
      ctx.interval = setInterval(() => {
        sessionWatch(ctx);
        parent.tick();
      }, 1000);
    }
    ctx.bus.log('Parent', demo ? 'Pivot started in DEMO mode — simulated market, fictional stocks' : 'Pivot started — agents are on duty', { level: 'success' });
  }
  return ctx;
}

/** After ~06:00 IST the Kite token is dead: mark disconnected so the morning reminder goes out. */
function sessionWatch(ctx) {
  if (!ctx.kiteSession.connected) return;
  const s = ctx.db.kvGet('kiteSession');
  const t = ist();
  if (s && s.date !== t.date && t.minutes >= 6 * 60) {
    ctx.kiteSession = { connected: false };
    ctx.liveBroker = null;
    ctx.feed.stop?.();
    ctx.bus.log('Parent', 'Yesterday’s Kite session has expired — a fresh login is needed today', { level: 'warn' });
  }
}

// ------------------------------------------------------------------ demo driver
const SPEEDS = { slow: 1, normal: 4, fast: 25, turbo: 0 };

function startDemoDriver(ctx) {
  ctx.demoState = { speed: ctx.db.kvGet('demoSpeed', 'normal'), paused: false, skip: false };
  const { clock, feed, parent, db } = ctx;
  (async () => {
    let lastSave = 0;
    while (!ctx.stopped) {
      const st = ctx.demoState;
      // Give you time to decide: the simulated market waits while a trade approval is pending
      st.waitingApproval = st.speed !== 'turbo' && !!db.get("SELECT id FROM approvals WHERE status = 'pending' LIMIT 1");
      if (st.paused || st.waitingApproval) {
        await sleep(300);
        continue;
      }
      const t = ist(clock.now());
      const day = ctx.day;
      const jump = (date, hhmm) => clock.set(istDate(date, toMinutes(hhmm)));
      if (!feed.isTradingDate(t.date)) {
        const nd = feed.nextTradingDate(t.date);
        if (!nd) {
          ctx.bus.log('Parent', 'The demo market has reached the end of its simulated history.', { level: 'warn' });
          st.paused = true;
          continue;
        }
        jump(nd, '08:29');
      } else if (st.skip && t.minutes < toMinutes('15:29')) {
        jump(t.date, '15:29');
        st.skip = false;
      } else if (t.minutes < toMinutes('08:29')) jump(t.date, '08:29');
      else if (t.minutes > toMinutes('08:31') && t.minutes < MARKET.open - 1 && day?.jobs.prep === 'done') jump(t.date, '09:14');
      else if (t.minutes > MARKET.close && t.minutes < toMinutes('15:40')) jump(t.date, '15:40');
      else if (t.minutes > toMinutes('15:41') && day?.jobs.post === 'done') jump(feed.nextTradingDate(t.date) || t.date, '08:29');
      else clock.advanceMinutes(1);

      feed.onClock();
      await parent.tick();
      if (Date.now() - lastSave > 5000) {
        lastSave = Date.now();
        db.kvSet('demoClock', clock.now().toISOString());
      }
      const sps = SPEEDS[st.speed] ?? 4;
      if (sps) await sleep(1000 / sps);
      else await new Promise((r) => setImmediate(r));
    }
  })();
}

// ------------------------------------------------------------------ Telegram commands
async function telegramCommand(ctx, cmd) {
  const ex = ctx.agents.executor;
  const inr = (x) => '₹' + Math.round(x).toLocaleString('en-IN');
  if (cmd === '/status') {
    const c = await ex.capital();
    return `📊 <b>Status</b> (${ctx.settings.tradingMode})\nPhase: ${ctx.parent.phase}\nMarket: ${ctx.market?.label || '—'}\nEquity ${inr(c.equity)} · cash ${inr(c.cash)} · open P&L ${inr(c.openPnl)}\nAgents: ${ctx.settings.agentsPaused ? '⏸ paused' : '▶️ running'}`;
  }
  if (cmd === '/positions') {
    const open = ex.openPositions();
    if (!open.length) return 'No open positions.';
    return open
      .map((p) => {
        const ltp = ex.ltpOf(p.symbol, p.last_price);
        const pct = ((ltp / p.entry_price - 1) * 100).toFixed(1);
        return `<b>${p.symbol}</b> ${p.qty_open} @ ₹${p.entry_price} → ₹${ltp} (${pct}%) · stop ₹${p.stop}${p.partial_done ? ' · ⅓ booked' : ''}`;
      })
      .join('\n');
  }
  if (cmd === '/picks') {
    const top = ctx.agents.analyst.topSetups(8);
    return top.length ? top.map((a, i) => `${i + 1}. <b>${a.symbol}</b> ${a.grade} (${a.score}) pivot ₹${a.vcp.pivot}`).join('\n') : 'No setups right now.';
  }
  if (cmd === '/pause') {
    ctx.updateSettings({ agentsPaused: true });
    return '⏸ New buys paused. Stops and exits on open positions keep running.';
  }
  if (cmd === '/resume') {
    ctx.updateSettings({ agentsPaused: false });
    return '▶️ Agents resumed.';
  }
  return 'Commands: /status /positions /picks /pause /resume';
}
