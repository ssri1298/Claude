// Runs backtests in a worker thread so the live agents never pause.
//   mode 'daily' — daily-candle backtest
//   mode 'scan'  — find breakout days that need 15-minute candles
//   mode 'run15' — replay candle by candle using cached 15-minute candles
import { parentPort, workerData } from 'node:worker_threads';
import { openDb } from '../core/db.js';
import { runBacktest } from './backtest.js';
import { findBreakoutDays, runBacktest15 } from './backtest15.js';

const { dbFile, params, indexToken, mode = 'daily' } = workerData;
try {
  const db = openDb(dbFile);
  const uni = db.all('SELECT * FROM universe WHERE active = 1');
  const until = params.to || '9999-12-31';
  const stocks = uni.map((u) => ({
    ...u,
    candles: db.all('SELECT date,open,high,low,close,volume FROM candles WHERE token = ? AND date <= ? ORDER BY date', u.token, until),
  }));
  const index = db.all('SELECT date,open,high,low,close,volume FROM candles WHERE token = ? AND date <= ? ORDER BY date', indexToken, until);
  if (index.length < 260) throw new Error('Not enough history yet — at least ~1 year of data is needed. Use “Get 5 years of data” first.');
  // need ~250 bars of warm-up for the 200-day average + 52-week checks
  const earliest = index[Math.min(index.length - 1, 252)].date;
  const from = params.from && params.from > earliest ? params.from : earliest;
  const progress = (p) => parentPort.postMessage({ type: 'progress', progress: p });
  const common = { stocks, index, from, to: params.to, capital: params.capital, rules: params.rules, marketFilter: params.marketFilter, compounding: params.compounding !== false, onProgress: progress };

  let result;
  if (mode === 'scan') result = findBreakoutDays(common);
  else if (mode === 'run15') {
    const stmt = db.raw.prepare('SELECT time, open, high, low, close, volume FROM candles15 WHERE token = ? AND date = ? ORDER BY time');
    result = runBacktest15({ ...common, getBars: (token, date) => stmt.all(token, date).map((r) => ({ ...r })) });
  } else result = runBacktest(common);
  db.close();
  parentPort.postMessage({ type: 'done', result });
} catch (e) {
  parentPort.postMessage({ type: 'error', error: e.message });
}
