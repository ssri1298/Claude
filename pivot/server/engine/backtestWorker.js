// Runs a backtest in a worker thread so the live agents never pause.
import { parentPort, workerData } from 'node:worker_threads';
import { openDb } from '../core/db.js';
import { runBacktest } from './backtest.js';

const { dbFile, params, indexToken } = workerData;
try {
  const db = openDb(dbFile);
  const uni = db.all('SELECT * FROM universe WHERE active = 1');
  const until = params.to || '9999-12-31';
  const stocks = uni.map((u) => ({
    ...u,
    candles: db.all('SELECT date,open,high,low,close,volume FROM candles WHERE token = ? AND date <= ? ORDER BY date', u.token, until),
  }));
  const index = db.all('SELECT date,open,high,low,close,volume FROM candles WHERE token = ? AND date <= ? ORDER BY date', indexToken, until);
  db.close();
  if (index.length < 260) throw new Error('Not enough history yet — at least ~1 year of data is needed. Use “Download 5 years of history” first.');
  // need ~250 bars of warm-up for the 200-day average + 52-week checks
  const earliest = index[Math.min(index.length - 1, 252)].date;
  const from = params.from && params.from > earliest ? params.from : earliest;
  const res = runBacktest({
    stocks,
    index,
    from,
    to: params.to,
    capital: params.capital,
    rules: params.rules,
    marketFilter: params.marketFilter,
    onProgress: (p) => parentPort.postMessage({ type: 'progress', progress: p }),
  });
  parentPort.postMessage({ type: 'done', result: res });
} catch (e) {
  parentPort.postMessage({ type: 'error', error: e.message });
}
