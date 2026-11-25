// HTTP API used by the web app.

import { Worker } from 'node:worker_threads';
import { randomInt } from 'node:crypto';
import { ist, tradingDaysBetween } from './core/time.js';
import { saveSecrets, maskSecrets } from './core/settings.js';
import { computeStats } from './engine/stats.js';
import { rMultiple } from './engine/rules.js';
import { round } from './engine/vcp.js';
import { NIFTY50_TOKEN, parseNifty500Csv } from './broker/feeds.js';
import { indexSnapshot, stockSnapshot } from './core/quotes.js';
import { agentPulse } from './core/pulse.js';
import { pruneHolds, setBlocked, setCorrectionBuys, setPositionHold } from './core/overrides.js';
import { CHECK_LABELS } from './engine/confirm.js';
import { syncHolidays } from './core/holidays.js';
import { createUpdater } from './core/updater.js';

const wrap = (fn) => async (req, res) => {
  try {
    const out = await fn(req, res);
    if (out !== undefined && !res.headersSent) res.json(out);
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) res.status(status).json({ error: e.message || 'Server error' });
  }
};

const AGENT_INFO = {
  parent: { name: 'Parent', role: 'Runs the day and coordinates the team', icon: 'crown' },
  screener: { name: 'Screener', role: 'Scans the Nifty 500 every minute for VCP setups & breakouts', icon: 'radar' },
  analyst: { name: 'Analyst', role: 'Rates each breakout and picks the best', icon: 'sparkles' },
  executor: { name: 'Executor', role: 'Sizes trades, places orders, manages stops & profits', icon: 'shield' },
};

export function mountApi(app, ctx, auth, { dbFile, dataDir }) {
  const { db } = ctx;
  const ag = () => ctx.agents;
  const updater = ctx.demo || !dataDir ? null : createUpdater({ dataDir, getToken: () => ctx.secrets.githubToken, log: (m) => ctx.bus.log('Parent', m) });

  // ------------------------------------------------------------ auth (public)
  app.get('/api/auth/status', (req, res) => res.json({ setup: auth.hasPassword(), loggedIn: auth.valid(req), demo: ctx.demo }));
  app.post(
    '/api/auth/setup',
    wrap((req, res) => {
      if (auth.hasPassword()) throw Object.assign(new Error('Password already set'), { status: 400 });
      auth.setPassword(req.body.password);
      auth.issue(res, req);
      return { ok: true };
    }),
  );
  app.post(
    '/api/auth/login',
    wrap((req, res) => {
      if (auth.throttle(req.ip)) throw Object.assign(new Error('Too many attempts — wait 15 minutes'), { status: 429 });
      if (!auth.checkPassword(req.body.password)) throw Object.assign(new Error('Wrong password'), { status: 401 });
      auth.issue(res, req);
      return { ok: true };
    }),
  );
  app.post('/api/auth/logout', (req, res) => {
    auth.clear(res);
    res.json({ ok: true });
  });

  // Kite login: redirect + callback (public — protected by Kite's own login and the user-id check)
  app.get('/api/kite/login', (req, res) => {
    const url = ctx.kiteLoginUrl();
    if (!url) return res.status(400).send('Kite API key is not set up yet. Open Pivot → Settings → Zerodha.');
    res.redirect(url);
  });
  app.get('/api/kite/callback', async (req, res) => {
    const { request_token, status } = req.query;
    if (status !== 'success' || !request_token) return res.redirect('/#/settings?kite=failed');
    try {
      await ctx.completeKiteLogin(String(request_token));
      res.redirect('/#/?kite=connected');
    } catch (e) {
      ctx.bus.log('Parent', `Kite login failed: ${e.message}`, { level: 'error' });
      res.redirect('/#/settings?kite=' + encodeURIComponent(e.message));
    }
  });

  // ------------------------------------------------------------ everything below needs a session
  app.use('/api', (req, res, next) => {
    if (auth.valid(req)) return next();
    res.status(401).json({ error: 'Please log in' });
  });

  // Live stream (Server-Sent Events)
  app.get('/api/stream', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 3000\n\n');
    const send = ({ type, payload }) => res.write(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`);
    ctx.bus.on('push', send);
    const hb = setInterval(() => res.write(': ping\n\n'), 20000);
    req.on('close', () => {
      clearInterval(hb);
      ctx.bus.off('push', send);
    });
  });

  // ------------------------------------------------------------ overview
  app.get(
    '/api/overview',
    wrap(async () => {
      const ex = ag().executor;
      const kind = ex.mode;
      const t = ist(ctx.clock.now());
      const capital = await ex.capital(kind);
      const open = positionsView(ctx, db.all("SELECT * FROM positions WHERE kind = ? AND status = 'open' ORDER BY entry_ts DESC", kind));
      const todayClosed = db.all('SELECT realized FROM positions WHERE kind = ? AND exit_date = ?', kind, t.date);
      const todayFills = db.all("SELECT f.side, f.qty, f.price, f.charges, p.entry_price FROM fills f JOIN positions p ON p.id = f.position_id WHERE p.kind = ? AND f.ts >= ?", kind, ctx.clock.now().toISOString().slice(0, 10));
      const dayChange = open.reduce((s, p) => s + (p.dayChange || 0), 0);
      const sc = ag().screener.status;
      return {
        demo: ctx.demo,
        demoState: ctx.demoState || null,
        mode: kind,
        confirmTrades: ctx.settings.confirmTrades,
        paused: ctx.settings.agentsPaused,
        phase: ctx.parent.phase,
        clock: { iso: ctx.clock.now().toISOString(), date: t.date, time: t.hhmm },
        market: ctx.market,
        breadth: ctx.breadth,
        asOf: ctx.asOf,
        kite: { configured: !!ctx.secrets.kiteApiKey, connected: ctx.demo || !!ctx.kiteSession.connected, userName: ctx.kiteSession.userName, demo: ctx.demo },
        telegram: { configured: !!ctx.secrets.telegramToken, paired: !!ctx.secrets.telegramChatId, ok: !!ctx.telegram?.ok, bot: ctx.telegram?.botName },
        push: { devices: ctx.webpush.subs().length },
        update: updater?.available() ? { state: updater.status()?.state || null, behind: updater.status()?.behind || 0 } : null,
        capital,
        today: { realized: round(todayClosed.reduce((s, x) => s + x.realized, 0)), dayChange: round(dayChange), trades: todayFills.length },
        agents: agentsView(ctx),
        counts: { ...sc.counts, ...(sc.live || {}), watching: db.get("SELECT COUNT(*) AS n FROM watchlist WHERE status = 'watching'").n },
        approvals: approvalsView(ctx, db.all("SELECT * FROM approvals WHERE status = 'pending' ORDER BY id DESC")),
        positions: open,
        topSetups: ag()
          .analyst.topSetups(8)
          .map((a) => brief(ctx, a)),
        events: db.all('SELECT * FROM events ORDER BY id DESC LIMIT 12'),
      };
    }),
  );

  // ------------------------------------------------------------ scanner & stock detail
  app.get(
    '/api/scanner',
    wrap((req) => {
      const f = req.query.filter || 'setups';
      let list = [...ctx.analysis.values()];
      if (f === 'setups') list = list.filter((a) => a.trend?.pass && a.vcp?.valid && ['near', 'forming', 'breakout'].includes(a.stage));
      else if (f === 'breakouts') list = list.filter((a) => a.vcp?.valid && ctx.live.get(a.symbol)?.distPivotPct > 0);
      else if (f === 'trend') list = list.filter((a) => a.trend?.pass);
      const q = (req.query.q || '').toUpperCase();
      if (q) list = [...ctx.analysis.values()].filter((a) => a.symbol.includes(q) || (a.name || '').toUpperCase().includes(q));
      return { asOf: ctx.asOf, total: ctx.analysis.size, rows: list.sort((a, b) => b.score - a.score).slice(0, 500).map((a) => brief(ctx, a)) };
    }),
  );

  app.get(
    '/api/stock/:symbol',
    wrap((req) => {
      const sym = req.params.symbol.toUpperCase();
      const a = ctx.analysis.get(sym);
      const u = db.get('SELECT * FROM universe WHERE symbol = ?', sym);
      if (!a && !u) throw Object.assign(new Error('Unknown stock'), { status: 404 });
      const token = a?.token ?? u.token;
      const candles = db.all('SELECT date,open,high,low,close,volume FROM candles WHERE token = ? ORDER BY date DESC LIMIT 320', token).reverse();
      const q = ctx.quotes.get(token);
      // add today's live candle while the market is open
      const t = ist(ctx.clock.now());
      if (q?.ltp && ctx.parent.phase === 'market' && candles.length && candles[candles.length - 1].date < t.date)
        candles.push({ date: t.date, open: q.open, high: q.high, low: q.low, close: q.ltp, volume: q.volume || 0, live: true });
      return {
        analysis: a || null,
        info: u,
        live: ctx.live.get(sym) || null,
        candles,
        watch: db.get('SELECT * FROM watchlist WHERE symbol = ?', sym) || null,
        positions: positionsView(ctx, db.all("SELECT * FROM positions WHERE symbol = ? AND kind != 'shadow' ORDER BY entry_ts DESC", sym)),
        signals: db.all('SELECT * FROM signals WHERE symbol = ? ORDER BY id DESC LIMIT 20', sym),
      };
    }),
  );

  // ---------------------------------------------------------- breakout-check measurement
  app.get(
    '/api/checks-stats',
    wrap(() => {
      const rows = db.all("SELECT * FROM positions WHERE kind = 'probe'");
      const closed = rows.filter((r) => r.status === 'closed');
      const res = (list) => {
        const n = list.length;
        const wins = list.filter((r) => r.realized > 0).length;
        const avg = n ? list.reduce((s, r) => s + (r.realized / (r.entry_price * r.qty_initial)) * 100, 0) / n : 0;
        return { n, winRate: n ? round((wins / n) * 100, 1) : null, avgPct: n ? round(avg, 2) : null };
      };
      const parsed = closed.map((r) => ({ r, s: JSON.parse(r.setup || '{}') }));
      const keys = ['buffer', 'holdCandle', 'vwap', 'rangePos', 'gap', 'volume'];
      const byCheck = keys.map((k) => ({
        key: k,
        label: CHECK_LABELS[k],
        passed: res(parsed.filter((x) => x.s.checks?.[k] === true).map((x) => x.r)),
        failed: res(parsed.filter((x) => x.s.checks?.[k] === false).map((x) => x.r)),
      }));
      return {
        all: res(closed),
        confirmed: res(parsed.filter((x) => x.s.confirmed).map((x) => x.r)),
        notConfirmed: res(parsed.filter((x) => !x.s.confirmed).map((x) => x.r)),
        open: rows.length - closed.length,
        byCheck,
      };
    }),
  );

  // ---------------------------------------------------------- Pivot app notifications (Web Push)
  app.get('/api/push/key', wrap(() => ({ key: ctx.webpush.publicKey, devices: ctx.webpush.subs().map((s) => ({ device: s.device, added: s.added })) })));
  app.post(
    '/api/push/subscribe',
    wrap((req) => {
      const sub = req.body?.subscription;
      if (!sub?.endpoint || !sub?.keys?.p256dh) throw Object.assign(new Error('Invalid subscription'), { status: 400 });
      const n = ctx.webpush.add(sub, req.body.device);
      ctx.bus.log('Parent', `Notifications turned on for ${req.body.device || 'a device'}`, { level: 'success' });
      return { ok: true, devices: n };
    }),
  );
  app.post('/api/push/unsubscribe', wrap((req) => (ctx.webpush.remove(req.body?.endpoint), { ok: true })));
  app.post(
    '/api/push/test',
    wrap(async () => {
      const n = await ctx.webpush.send({ title: '🔔 Pivot notifications work', body: 'You will get trade approvals, fills, stops and daily reports here.', url: '/', tag: 'test' });
      if (!n) throw Object.assign(new Error('No device received it — turn notifications on first'), { status: 400 });
      return { ok: true, sent: n };
    }),
  );
  app.get(
    '/api/quotes',
    wrap(() => ({ t: Date.now(), index: indexSnapshot(ctx), q: stockSnapshot(ctx), phase: ctx.parent.phase, demo: ctx.demo, agents: agentPulse(ctx) })),
  );
  app.get(
    '/api/stock/:symbol/scores',
    wrap((req) => {
      const days = Math.min(400, Number(req.query.days) || 90);
      const rows = db
        .all('SELECT date, score, grade, stage, rs, close, pivot, trend_pass, parts FROM score_history WHERE symbol = ? ORDER BY date DESC LIMIT ?', req.params.symbol.toUpperCase(), days)
        .reverse()
        .map((r) => ({ ...r, parts: JSON.parse(r.parts || '{}') }));
      return { minScore: ctx.settings.rules.minScore, rows };
    }),
  );
  app.get('/api/watchlist', wrap(() => db.all('SELECT * FROM watchlist ORDER BY CASE status WHEN \'watching\' THEN 0 WHEN \'triggered\' THEN 1 ELSE 2 END, score DESC LIMIT 300')));
  app.get('/api/signals', wrap((req) => db.all('SELECT * FROM signals ORDER BY id DESC LIMIT ?', Math.min(500, Number(req.query.limit) || 100))));
  app.get(
    '/api/events',
    wrap((req) => {
      const before = Number(req.query.before) || 1e15;
      const agent = req.query.agent;
      return agent
        ? db.all('SELECT * FROM events WHERE id < ? AND agent = ? ORDER BY id DESC LIMIT 100', before, agent)
        : db.all('SELECT * FROM events WHERE id < ? ORDER BY id DESC LIMIT 100', before);
    }),
  );

  // ------------------------------------------------------------ approvals & positions
  app.post('/api/approvals/:id/:decision', wrap(async (req) => ({ message: await ag().executor.decide(Number(req.params.id), req.params.decision === 'approve' ? 'approve' : 'reject', 'app') })));

  app.get(
    '/api/positions',
    wrap((req) => {
      const kind = req.query.kind || ag().executor.mode;
      const status = req.query.status || 'open';
      const rows = db.all(`SELECT * FROM positions WHERE kind = ? AND status = ? ORDER BY ${status === 'open' ? 'entry_ts' : 'exit_ts'} DESC LIMIT 500`, kind, status);
      return positionsView(ctx, rows, true);
    }),
  );
  app.post('/api/positions/:id/exit', wrap((req) => ag().executor.manualExit(Number(req.params.id), Number(req.body.fraction) || 1)));
  app.post('/api/positions/:id/stop', wrap((req) => ag().executor.setStop(Number(req.params.id), Number(req.body.stop))));

  // ------------------------------------------------------------ statistics
  app.get(
    '/api/stats',
    wrap(async (req) => {
      const kind = req.query.kind || ag().executor.mode;
      const rows = db.all("SELECT * FROM positions WHERE kind = ? AND status = 'closed' ORDER BY exit_ts", kind);
      const trades = rows.map((r) => tradeView(ctx, r));
      const eq = db.all('SELECT date, equity FROM equity WHERE kind = ? ORDER BY date', kind);
      const start = kind === 'paper' || kind === 'shadow' ? ctx.settings.paperCapital : eq[0]?.equity || 0;
      if (kind !== 'shadow') {
        const cap = await ag().executor.capital(kind === 'live' ? 'live' : 'paper');
        const today = ist(ctx.clock.now()).date;
        if (!eq.length || eq[eq.length - 1].date !== today) eq.push({ date: today, equity: cap.equity });
        if (eq.length === 1) eq.unshift({ date: eq[0].date, equity: start });
      }
      const stats = computeStats(trades, kind === 'shadow' ? [] : eq, start);
      const open = db.all("SELECT * FROM positions WHERE kind = ? AND status = 'open'", kind);
      const signals = db.all('SELECT status, COUNT(*) AS n FROM signals GROUP BY status');
      // P&L by exit month
      return { kind, stats, equity: eq, openCount: open.length, signals, recent: trades.slice(-12).reverse() };
    }),
  );

  // ------------------------------------------------------------ overrule (you over the agents)
  const youLog = (msg, level = 'info') => ctx.bus.log('You', msg, { level });
  app.get(
    '/api/overrule',
    wrap(() => {
      const ex = ag().executor;
      const kind = ex.mode;
      const t = ist(ctx.clock.now());
      const openRows = db.all("SELECT * FROM positions WHERE kind = ? AND status = 'open' ORDER BY entry_ts DESC", kind);
      const ov = pruneHolds(db, db.all("SELECT id FROM positions WHERE status = 'open'").map((r) => r.id));
      const R = ctx.settings.rules;
      const passed = db
        .all("SELECT * FROM signals WHERE date = ? AND status NOT IN ('auto','approved','overruled','awaiting_approval') ORDER BY id DESC LIMIT 60", t.date)
        .filter((r, i, arr) => arr.findIndex((x) => x.symbol === r.symbol) === i)
        .map((r) => {
          const l = ctx.live?.get(r.symbol);
          return { id: r.id, ts: r.ts, symbol: r.symbol, type: r.type, price: r.price, pivot: r.pivot, score: r.score, grade: r.grade, status: r.status, reason: r.reason, ltp: l?.ltp ?? null, distPivotPct: l?.distPivotPct ?? null, held: !!db.get("SELECT id FROM positions WHERE symbol = ? AND kind = ? AND status = 'open'", r.symbol, kind) };
        });
      const uni = new Map(db.all('SELECT symbol, name, industry FROM universe').map((u) => [u.symbol, u]));
      return {
        phase: ctx.parent.phase,
        mode: kind,
        paused: !!ctx.settings.agentsPaused,
        market: { regime: ctx.market?.regime || 'unknown', filter: ctx.settings.marketFilter, correctionToday: ov.allowCorrectionBuys === t.date },
        signals: passed,
        positions: positionsView(ctx, openRows).map((p) => ({ ...p, holds: ov.positions[p.id] || {} })),
        rules: { failedExit: R.failedExit?.enabled ? R.failedExit.days || 2 : null, timeExit: R.timeExit?.enabled ? R.timeExit.days || 7 : null, trailMethod: R.trailMethod, partialAtPct: R.partialAtPct },
        blocked: Object.entries(ov.blocked).map(([symbol, b]) => ({ symbol, ...b, name: uni.get(symbol)?.name || '' })),
        candidates: [...(ctx.analysis?.values() || [])]
          .filter((a) => a.vcp?.valid || a.trend?.pass)
          .sort((x, y) => (y.score || 0) - (x.score || 0))
          .slice(0, 80)
          .map((a) => ({ symbol: a.symbol, score: a.score, grade: a.grade, setup: !!a.vcp?.valid })),
        history: db.all("SELECT * FROM events WHERE agent = 'You' ORDER BY id DESC LIMIT 40"),
      };
    }),
  );
  app.post('/api/overrule/buy', wrap(async (req) => ag().executor.overruleBuy({ signalId: Number(req.body.signalId) || null, symbol: req.body.symbol })));
  app.post(
    '/api/overrule/block',
    wrap(async (req) => {
      const symbol = String(req.body.symbol || '').toUpperCase().trim();
      if (!symbol) throw Object.assign(new Error('Pick a stock'), { status: 400 });
      const on = req.body.blocked !== false;
      setBlocked(db, symbol, on, String(req.body.note || '').slice(0, 200));
      if (on) {
        for (const ap of db.all("SELECT id FROM approvals WHERE symbol = ? AND status = 'pending'", symbol)) await ag().executor.decide(ap.id, 'reject', 'you');
        youLog(`You blocked ${symbol} — the agents will not buy it until you unblock it`, 'warn');
      } else youLog(`You unblocked ${symbol} — the agents may buy it again`);
      return { ok: true };
    }),
  );
  app.post(
    '/api/overrule/correction',
    wrap((req) => {
      const allow = !!req.body.allow;
      setCorrectionBuys(db, allow ? ist(ctx.clock.now()).date : null);
      youLog(allow ? 'You allowed new buys today even though the market filter says correction' : 'You switched the market filter back on for today', allow ? 'warn' : 'info');
      return { ok: true };
    }),
  );
  app.post(
    '/api/overrule/hold',
    wrap((req) => {
      const id = Number(req.body.positionId);
      const row = db.get("SELECT symbol FROM positions WHERE id = ? AND status = 'open'", id);
      if (!row) throw Object.assign(new Error('Position is not open'), { status: 400 });
      const flag = String(req.body.flag);
      setPositionHold(db, id, flag, !!req.body.on);
      const what = { noFailedExit: 'failed-breakout exit', noTimeExit: 'time exit', noTrail: 'trailing exit', noPartial: 'one-third profit sale at +10%' }[flag];
      youLog(req.body.on ? `You switched off the ${what} for ${row.symbol}` : `You switched the ${what} back on for ${row.symbol}`, req.body.on ? 'warn' : 'info');
      return { ok: true };
    }),
  );

  // ------------------------------------------------------------ agents control
  app.post('/api/agents/pause', wrap(() => (ctx.updateSettings({ agentsPaused: true }), ctx.bus.log('Parent', 'You paused new buys. Open positions are still protected.', { level: 'warn' }), { ok: true })));
  app.post('/api/agents/resume', wrap(() => (ctx.updateSettings({ agentsPaused: false }), ctx.bus.log('Parent', 'You resumed the agents', { level: 'success' }), { ok: true })));
  app.post(
    '/api/agents/prepare',
    wrap(() => {
      if (!ctx.demo && !ctx.kiteSession.connected) throw Object.assign(new Error('Log in to Kite first'), { status: 400 });
      ag()
        .screener.prepare({ reason: 'manual' })
        .then(() => ctx.day && (ctx.day.jobs.prep = 'done'))
        .catch(() => {});
      return { ok: true };
    }),
  );
  app.post(
    '/api/agents/history',
    wrap((req) => {
      if (!ctx.demo && !ctx.kiteSession.connected) throw Object.assign(new Error('Log in to Kite first'), { status: 400 });
      ag().screener.extendHistory(Number(req.body?.years) || 5);
      return { ok: true };
    }),
  );

  // ------------------------------------------------------------ settings
  app.get(
    '/api/settings',
    wrap((req) => ({
      settings: ctx.settings,
      secrets: maskSecrets(ctx.secrets),
      publicUrl: ctx.publicUrl || `${req.protocol}://${req.get('host')}`,
      kiteRedirect: `${ctx.publicUrl || `${req.protocol}://${req.get('host')}`}/api/kite/callback`,
      telegram: { ok: !!ctx.telegram?.ok, bot: ctx.telegram?.botName, paired: !!ctx.secrets.telegramChatId, error: ctx.telegram?.error || null },
      kite: { connected: !!ctx.kiteSession.connected, userName: ctx.kiteSession.userName },
      universeCount: db.get('SELECT COUNT(*) AS n FROM universe WHERE active = 1').n,
      historyFrom: db.get('SELECT MIN(date) AS d FROM candles').d,
      holidayNames: db.kvGet('holidayNames', {}),
      holidaySync: db.kvGet('holidaySync'),
      demo: ctx.demo,
    })),
  );
  app.put(
    '/api/settings',
    wrap((req) => {
      const patch = { ...req.body };
      if (patch.tradingMode === 'live' && ctx.demo) throw Object.assign(new Error('Live trading is not available in demo mode'), { status: 400 });
      if (patch.tradingMode === 'live' && !ctx.secrets.kiteApiKey) throw Object.assign(new Error('Set up your Zerodha API key first'), { status: 400 });
      return { settings: ctx.updateSettings(patch) };
    }),
  );
  app.put(
    '/api/secrets',
    wrap(async (req) => {
      const allowed = ['kiteApiKey', 'kiteApiSecret', 'telegramToken', 'githubToken'];
      const patch = Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => allowed.includes(k)));
      ctx.secrets = saveSecrets(db, patch);
      if ('kiteApiKey' in patch || 'kiteApiSecret' in patch) ctx.reconfigureKite();
      let telegram;
      if ('telegramToken' in patch) {
        ctx.secrets = saveSecrets(db, { telegramChatId: '' });
        const ok = await Promise.race([ctx.reconfigureTelegram(), new Promise((r) => setTimeout(() => r(false), 20000))]);
        telegram = { ok: !!ok, bot: ctx.telegram?.botName, error: ok ? null : ctx.telegram?.error || 'No answer from Telegram' };
      }
      return { secrets: maskSecrets(ctx.secrets), telegram };
    }),
  );
  app.post(
    '/api/telegram/pair',
    wrap(() => {
      if (!ctx.telegram?.enabled) throw Object.assign(new Error('Add your bot token first'), { status: 400 });
      const code = String(randomInt(100000, 999999));
      db.kvSet('telegramPair', { code, exp: Date.now() + 30 * 60000 }); // valid 30 minutes, survives restarts
      if (!ctx.telegram.ok) throw Object.assign(new Error('Telegram did not accept the bot token — copy it again from @BotFather and tap Save token'), { status: 400 });
      return { code, bot: ctx.telegram.botName };
    }),
  );
  app.post(
    '/api/telegram/test',
    wrap(async () => {
      const r = await ctx.telegram?.send('🔔 Test message from Pivot — notifications are working.');
      if (!r) throw Object.assign(new Error('Could not send — check the bot token and pairing'), { status: 400 });
      return { ok: true };
    }),
  );
  app.post(
    '/api/telegram/unpair',
    wrap(() => {
      ctx.secrets = saveSecrets(db, { telegramChatId: '' });
      ctx.reconfigureTelegram();
      return { ok: true };
    }),
  );
  app.post(
    '/api/holidays/sync',
    wrap(async () => {
      const r = await syncHolidays(ctx, { force: true });
      if (!r.ok) throw Object.assign(new Error(`NSE could not be reached (${r.error}). The saved list is still in use.`), { status: 502 });
      return r;
    }),
  );
  // ---------------------------------------------------------- in-app updates
  app.get(
    '/api/update',
    wrap(() => ({
      available: !!updater?.available(),
      demo: ctx.demo,
      version: updater?.version() || null,
      status: updater?.status() || null,
      hasToken: !!ctx.secrets.githubToken,
      log: updater?.status()?.state === 'error' ? updater.lastLog() : undefined,
    })),
  );
  app.post('/api/update/check', wrap(() => (updater ? updater.request('check') : Promise.reject(Object.assign(new Error('Not available here'), { status: 400 })))));
  app.post(
    '/api/update/apply',
    wrap(() => {
      if (!updater) throw Object.assign(new Error('Not available here'), { status: 400 });
      return updater.request('update');
    }),
  );
  app.put(
    '/api/universe/manual',
    wrap((req) => {
      const rows = parseNifty500Csv(String(req.body.csv || ''));
      if (rows.length < 50) throw Object.assign(new Error('That does not look like the Nifty 500 CSV (need columns Company Name, Industry, Symbol)'), { status: 400 });
      db.kvSet('nifty500Manual', req.body.csv);
      db.kvSet('nifty500ManualAt', Date.now());
      db.kvSet('universeFetchedAt', 0);
      ctx.bus.log('Screener', `You uploaded a Nifty 500 list with ${rows.length} stocks — it will be used from the next scan`, { level: 'success' });
      return { ok: true, count: rows.length };
    }),
  );

  // ------------------------------------------------------------ backtests
  const jobs = new Map();
  const indexToken = ctx.demo ? 256265 : NIFTY50_TOKEN;
  const runWorker = (mode, params, job, phaseFrom, phaseTo) =>
    new Promise((resolve, reject) => {
      const w = new Worker(new URL('./engine/backtestWorker.js', import.meta.url), {
        workerData: { dbFile, params, indexToken, mode },
        execArgv: ['--disable-warning=ExperimentalWarning'],
      });
      w.on('message', (m) => {
        if (m.type === 'progress') {
          job.progress = phaseFrom + (phaseTo - phaseFrom) * m.progress;
          ctx.bus.push('backtest', { id: job.id, status: job.status, progress: job.progress, phase: job.phase });
        } else if (m.type === 'done') resolve(m.result);
        else if (m.type === 'error') reject(new Error(m.error));
      });
      w.on('error', reject);
    });

  /** Download (and cache) the 15-minute candles a backtest needs. */
  async function ensure15(ranges, job) {
    if (!ctx.demo && !ctx.kiteSession.connected) throw new Error('Log in to Kite first — 15-minute candles come from Zerodha');
    const lastDay = ist(ctx.clock.now()).date;
    const todo = ranges.filter((r) => !db.get('SELECT 1 FROM candles15_ranges WHERE token = ? AND from_date <= ? AND to_date >= ?', r.token, r.from, r.to < lastDay ? r.to : lastDay));
    job.download = { needed: todo.length, done: 0, cached: ranges.length - todo.length, failed: 0 };
    for (const r of todo) {
      try {
        const bars = await ctx.feed.history15(r.token, r.from, r.to);
        db.tx(() => {
          for (const b of bars) db.run('INSERT OR REPLACE INTO candles15(token,date,time,open,high,low,close,volume) VALUES(?,?,?,?,?,?,?,?)', r.token, b.date, b.time, b.open, b.high, b.low, b.close, b.volume);
          db.run('INSERT INTO candles15_ranges(token, from_date, to_date, fetched) VALUES(?,?,?,?)', r.token, r.from, r.to, new Date().toISOString());
        });
      } catch (e) {
        if (e.type === 'TokenException') throw new Error('Kite session expired — log in again and re-run');
        job.download.failed++;
      }
      job.download.done++;
      job.progress = 0.3 + 0.4 * (job.download.done / Math.max(1, todo.length));
      ctx.bus.push('backtest', { id: job.id, status: job.status, progress: job.progress, phase: job.phase, download: job.download });
    }
  }

  app.post(
    '/api/backtest',
    wrap((req) => {
      if ([...jobs.values()].some((j) => j.status === 'running')) throw Object.assign(new Error('A backtest is already running'), { status: 400 });
      const id = String(Date.now());
      const precision = req.body.precision === '15m' ? '15m' : 'daily';
      const params = {
        from: req.body.from || null,
        to: req.body.to || null,
        capital: Number(req.body.capital) || ctx.settings.paperCapital,
        rules: { ...ctx.settings.rules, ...(req.body.rules || {}) },
        marketFilter: req.body.marketFilter || ctx.settings.marketFilter,
        precision,
      };
      const job = { id, status: 'running', progress: 0, params, phase: precision === '15m' ? 'scan' : 'daily' };
      jobs.set(id, job);
      (async () => {
        let result;
        if (precision === 'daily') result = await runWorker('daily', params, job, 0, 1);
        else {
          const scan = await runWorker('scan', params, job, 0, 0.3);
          job.scan = { candidateDays: scan.candidateDays, ranges: scan.ranges.length };
          job.phase = 'download';
          await ensure15(scan.ranges, job);
          job.phase = 'replay';
          result = await runWorker('run15', params, job, 0.7, 1);
        }
        job.status = 'done';
        job.progress = 1;
        job.result = slimBacktest(result);
        db.kvSet('lastBacktest', job);
        ctx.bus.log('Analyst', `Backtest (${precision === '15m' ? '15-minute candles' : 'daily candles'}) finished: ${job.result.stats.trades} trades, win rate ${job.result.stats.winRate}%, return ${job.result.stats.totalReturnPct}%`, { level: 'success' });
      })()
        .catch((e) => {
          job.status = 'error';
          job.error = e.message;
        })
        .finally(() => ctx.bus.push('backtest', { id, status: job.status, progress: job.progress, phase: job.phase }));
      return { id };
    }),
  );
  app.get(
    '/api/backtest/:id',
    wrap((req) => {
      if (req.params.id === 'last') return db.kvGet('lastBacktest') || null;
      const j = jobs.get(req.params.id);
      if (!j) throw Object.assign(new Error('Not found'), { status: 404 });
      return j;
    }),
  );

  // ------------------------------------------------------------ demo controls
  app.post(
    '/api/demo/control',
    wrap((req) => {
      if (!ctx.demo) throw Object.assign(new Error('Only in demo mode'), { status: 400 });
      const { speed, paused, skip } = req.body;
      if (speed) {
        ctx.demoState.speed = speed;
        db.kvSet('demoSpeed', speed);
      }
      if (paused !== undefined) ctx.demoState.paused = !!paused;
      if (skip) ctx.demoState.skip = true;
      return ctx.demoState;
    }),
  );
  app.post(
    '/api/demo/reset',
    wrap(() => {
      if (!ctx.demo) throw Object.assign(new Error('Only in demo mode'), { status: 400 });
      db.tx(() => {
        for (const t of ['positions', 'fills', 'orders', 'signals', 'approvals', 'equity', 'events', 'watchlist']) db.run(`DELETE FROM ${t}`);
        db.run("DELETE FROM kv WHERE key IN ('demoClock')");
      });
      setTimeout(() => process.exit(0), 300); // the service manager restarts it fresh
      return { ok: true, restarting: true };
    }),
  );
}

// ------------------------------------------------------------ view helpers
function brief(ctx, a) {
  const l = ctx.live.get(a.symbol);
  return {
    symbol: a.symbol,
    name: a.name,
    industry: a.industry,
    close: a.close,
    ltp: l?.ltp ?? a.close,
    changePct: l?.changePct ?? a.changePct,
    volPace: l?.volPace ?? null,
    rs: a.rsRating,
    score: a.score,
    grade: a.grade,
    stage: a.stage,
    trendPass: a.trend?.passCount,
    pivot: a.vcp?.pivot ?? null,
    stop: a.vcp?.stop ?? null,
    stopPct: a.vcp?.stopPct ?? null,
    distPivotPct: l?.distPivotPct ?? a.vcp?.distToPivotPct ?? null,
    contractions: (a.vcp?.contractions || []).map((k) => k.depthPct),
    baseWeeks: a.vcp?.baseBars ? Math.round(a.vcp.baseBars / 5) : null,
    rsLineHigh: !!a.rsLineHigh,
    fromHighPct: a.trend?.fromHighPct,
    good: a.explain?.good?.slice(0, 3),
  };
}

function agentsView(ctx) {
  const { screener, analyst, executor } = ctx.agents;
  const phase = ctx.parent.phase;
  const ex = executor.mode;
  const openCount = ctx.db.get("SELECT COUNT(*) AS n FROM positions WHERE kind = ? AND status = 'open'", ex).n;
  const pend = ctx.db.get("SELECT COUNT(*) AS n FROM approvals WHERE status = 'pending'").n;
  const last = (agent) => ctx.db.get('SELECT message, ts FROM events WHERE agent = ? ORDER BY id DESC LIMIT 1', agent);
  const sc = screener.status;
  return [
    { key: 'parent', ...AGENT_INFO.parent, state: ctx.settings.agentsPaused ? 'paused' : phase, detail: phaseText(phase, ctx), last: last('Parent') },
    {
      key: 'screener',
      ...AGENT_INFO.screener,
      state: sc.state === 'preparing' ? 'working' : phase === 'market' ? 'scanning' : 'standby',
      detail: sc.progress ? `Downloading data ${sc.progress.done}/${sc.progress.total}` : `${sc.counts.setups ?? 0} setups · ${sc.counts.trendPass ?? 0} in uptrend${sc.live ? ` · ${sc.live.breakingOut} in buy zone` : ''}`,
      last: last('Screener'),
    },
    { key: 'analyst', ...AGENT_INFO.analyst, state: phase === 'market' ? 'ready' : 'standby', detail: `${ctx.db.get('SELECT COUNT(*) AS n FROM signals WHERE date = ?', ist(ctx.clock.now()).date).n} signals rated today`, last: last('Analyst') },
    { key: 'executor', ...AGENT_INFO.executor, state: pend ? 'waiting' : openCount ? 'managing' : 'standby', detail: `${openCount} open · ${pend} awaiting your approval`, last: last('Executor') },
  ];
}

function phaseText(phase, ctx) {
  if (ctx.settings.agentsPaused) return 'New buys paused by you — stops still active';
  if (!ctx.demo && !ctx.kiteSession.connected) return 'Waiting for your daily Kite login';
  return { 'pre-market': 'Preparing for the open', market: 'Market open — scanning every minute', 'post-market': 'Market closed — reviewing the day', holiday: 'Market holiday — resting', starting: 'Starting up' }[phase] || phase;
}

function approvalsView(ctx, rows) {
  return rows.map((r) => {
    const d = JSON.parse(r.data);
    const l = ctx.live.get(r.symbol);
    return { id: r.id, ts: r.ts, expires: r.expires, status: r.status, ...d, ltp: l?.ltp ?? d.price, volPaceNow: l?.volPace };
  });
}

function positionsView(ctx, rows, withFills = false) {
  const today = ist(ctx.clock.now()).date;
  return rows.map((r) => {
    const l = ctx.live.get(r.symbol);
    const q = ctx.quotes.get(r.token);
    const ltp = r.status === 'open' ? q?.ltp ?? r.last_price ?? r.entry_price : r.exit_price;
    const unreal = r.status === 'open' ? r.qty_open * (ltp - r.entry_price) : 0;
    const setup = JSON.parse(r.setup || '{}');
    const out = {
      id: r.id,
      kind: r.kind,
      symbol: r.symbol,
      industry: r.industry,
      status: r.status,
      entryDate: r.entry_date,
      entryTs: r.entry_ts,
      entryPrice: r.entry_price,
      qtyInitial: r.qty_initial,
      qtyOpen: r.qty_open,
      stop: r.stop,
      initialStop: r.initial_stop,
      partialDone: !!r.partial_done,
      target: round(r.entry_price * (1 + ctx.settings.rules.partialAtPct / 100)),
      highest: r.highest,
      ltp,
      pnlPct: round((ltp / r.entry_price - 1) * 100),
      unrealized: round(unreal),
      realized: round(r.realized),
      totalPnl: round(r.realized + unreal),
      dayChange: r.status === 'open' && q?.prevClose ? round(r.qty_open * (ltp - (r.entry_date === today ? r.entry_price : q.prevClose))) : 0,
      changePct: l?.changePct ?? null,
      stopDistPct: r.status === 'open' ? round((r.stop / ltp - 1) * 100) : null,
      riskToStop: r.status === 'open' ? round(r.qty_open * (r.stop - r.entry_price)) : null,
      r: round(rMultiple({ entryPrice: r.entry_price, initialStop: r.initial_stop }, ltp), 2),
      exitDate: r.exit_date,
      exitPrice: r.exit_price,
      exitReason: r.exit_reason,
      holdDays: tradingDaysBetween(r.entry_date, r.exit_date || today, ctx.settings.holidays),
      grade: r.grade,
      score: r.score,
      isReentry: !!r.is_reentry,
      gtt: !!r.gtt_id,
      pivot: setup.pivot,
      shadowReason: setup.shadowReason,
      stage: setup.stage || 0,
      plannedAdd: setup.plannedAdd || 0,
      addTime: setup.addTime,
      value: round(r.qty_open * ltp),
    };
    if (withFills) out.fills = ctx.db.all('SELECT ts, side, qty, price, charges, reason FROM fills WHERE position_id = ? ORDER BY id', r.id);
    return out;
  });
}

function tradeView(ctx, r) {
  const sells = ctx.db.all("SELECT qty, price FROM fills WHERE position_id = ? AND side = 'SELL'", r.id);
  const q = sells.reduce((s, f) => s + f.qty, 0);
  const avgExit = q ? sells.reduce((s, f) => s + f.qty * f.price, 0) / q : r.exit_price;
  return {
    id: r.id,
    symbol: r.symbol,
    industry: r.industry,
    entryDate: r.entry_date,
    exitDate: r.exit_date,
    entryPrice: r.entry_price,
    exitPrice: round(avgExit),
    qtyInitial: r.qty_initial,
    initialStop: r.initial_stop,
    realized: r.realized,
    charges: r.charges,
    exitReason: { stop: r.partial_done ? 'Breakeven stop' : 'Stop-loss', trail: 'Trailing exit', manual: 'Manual', outside: 'Outside Pivot', partial: 'Partial', failed: 'Failed breakout', time: 'Time exit' }[r.exit_reason] || r.exit_reason,
    grade: r.grade,
    isReentry: !!r.is_reentry,
    holdDays: tradingDaysBetween(r.entry_date, r.exit_date, ctx.settings.holidays),
    rMultiple: round(rMultiple({ entryPrice: r.entry_price, initialStop: r.initial_stop }, avgExit), 2),
    pnlPct: round((r.realized / (r.entry_price * r.qty_initial)) * 100),
  };
}

function slimBacktest(r) {
  const eq = r.equity;
  const step = Math.max(1, Math.floor(eq.length / 400));
  return {
    params: r.params,
    stats: r.stats,
    signals: r.signals,
    coverage: r.coverage || null,
    equity: eq.filter((_, i) => i % step === 0 || i === eq.length - 1),
    trades: r.trades.slice(0, 300).map((t) => ({
      symbol: t.symbol,
      entryDate: t.entryDate,
      exitDate: t.exitDate,
      entryTime: t.entryTime,
      exitTime: t.exitTime,
      entryPrice: t.entryPrice,
      exitPrice: t.exitPrice,
      realized: Math.round(t.realized),
      pct: round((t.realized / (t.entryPrice * t.qtyInitial)) * 100),
      r: t.rMultiple,
      reason: t.exitReason,
      grade: t.grade,
      reentry: t.isReentry,
      days: t.holdDays,
    })),
    openAtEnd: r.openAtEnd,
  };
}
