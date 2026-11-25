// SQLite persistence (Node's built-in node:sqlite — no native build needed).

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS universe (
  symbol TEXT PRIMARY KEY, name TEXT, industry TEXT, token INTEGER, tick REAL DEFAULT 0.05, active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS candles (
  token INTEGER, date TEXT, open REAL, high REAL, low REAL, close REAL, volume INTEGER,
  PRIMARY KEY (token, date)
);

CREATE TABLE IF NOT EXISTS analysis (
  symbol TEXT PRIMARY KEY, as_of TEXT, score REAL, stage TEXT, data TEXT
);

CREATE TABLE IF NOT EXISTS watchlist (
  symbol TEXT PRIMARY KEY, status TEXT, first_seen TEXT, updated TEXT, pivot REAL, stop REAL,
  score REAL, best_score REAL, days_watched INTEGER DEFAULT 0, note TEXT, data TEXT
);

CREATE TABLE IF NOT EXISTS score_history (
  symbol TEXT, date TEXT, score REAL, grade TEXT, stage TEXT, rs INTEGER, close REAL, pivot REAL, trend_pass INTEGER, parts TEXT,
  PRIMARY KEY (symbol, date)
);

CREATE TABLE IF NOT EXISTS screen_runs (
  date TEXT PRIMARY KEY, total INTEGER, trend_pass INTEGER, setups INTEGER, near INTEGER, regime TEXT, data TEXT
);

CREATE TABLE IF NOT EXISTS signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, date TEXT, symbol TEXT, type TEXT, price REAL, pivot REAL,
  score REAL, grade TEXT, vol_pace REAL, status TEXT, reason TEXT, data TEXT
);
CREATE INDEX IF NOT EXISTS signals_date ON signals(date);

CREATE TABLE IF NOT EXISTS approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, signal_id INTEGER, symbol TEXT, side TEXT, qty INTEGER,
  price REAL, stop REAL, status TEXT, expires TEXT, decided_ts TEXT, decided_by TEXT, data TEXT
);

CREATE TABLE IF NOT EXISTS positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, symbol TEXT, token INTEGER, industry TEXT, status TEXT,
  entry_ts TEXT, entry_date TEXT, entry_price REAL, qty_initial INTEGER, qty_open INTEGER,
  stop REAL, initial_stop REAL, partial_done INTEGER DEFAULT 0, highest REAL, last_price REAL,
  exit_ts TEXT, exit_date TEXT, exit_price REAL, exit_reason TEXT,
  realized REAL DEFAULT 0, charges REAL DEFAULT 0, gtt_id TEXT, signal_id INTEGER, is_reentry INTEGER DEFAULT 0,
  score REAL, grade TEXT, setup TEXT
);
CREATE INDEX IF NOT EXISTS positions_status ON positions(status, kind);

CREATE TABLE IF NOT EXISTS fills (
  id INTEGER PRIMARY KEY AUTOINCREMENT, position_id INTEGER, ts TEXT, side TEXT, qty INTEGER, price REAL,
  charges REAL, reason TEXT, order_id TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, position_id INTEGER, symbol TEXT, side TEXT, qty INTEGER,
  price REAL, status TEXT, broker_id TEXT, filled_qty INTEGER DEFAULT 0, avg_price REAL, reason TEXT, mode TEXT, message TEXT
);

CREATE TABLE IF NOT EXISTS equity (
  date TEXT, kind TEXT, equity REAL, cash REAL, invested REAL, open_pnl REAL, PRIMARY KEY (date, kind)
);

CREATE TABLE IF NOT EXISTS candles15 (
  token INTEGER, date TEXT, time TEXT, open REAL, high REAL, low REAL, close REAL, volume INTEGER,
  PRIMARY KEY (token, date, time)
);

CREATE TABLE IF NOT EXISTS candles15_ranges (
  token INTEGER, from_date TEXT, to_date TEXT, fetched TEXT
);
CREATE INDEX IF NOT EXISTS c15r_token ON candles15_ranges(token);

CREATE TABLE IF NOT EXISTS journal (
  id INTEGER PRIMARY KEY AUTOINCREMENT, position_id INTEGER, symbol TEXT, ts TEXT, date TEXT, text TEXT, tags TEXT
);
CREATE INDEX IF NOT EXISTS journal_pos ON journal(position_id);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT, token INTEGER, op TEXT, price REAL, note TEXT, created TEXT, triggered TEXT, triggered_price REAL, active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, type TEXT, ts TEXT, kind TEXT, data TEXT, UNIQUE(date, type)
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, agent TEXT, level TEXT, message TEXT, data TEXT
);
`;

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 10000;');
  db.exec(SCHEMA);
  // Columns added after the first release (ignored if they already exist)
  for (const sql of ['ALTER TABLE positions ADD COLUMN power_date TEXT', 'ALTER TABLE positions ADD COLUMN climax_done INTEGER DEFAULT 0']) {
    try {
      db.exec(sql);
    } catch {}
  }
  const stmtCache = new Map();
  const prep = (sql) => {
    let s = stmtCache.get(sql);
    if (!s) stmtCache.set(sql, (s = db.prepare(sql)));
    return s;
  };
  const api = {
    raw: db,
    all: (sql, ...p) => prep(sql).all(...p).map((r) => ({ ...r })),
    get: (sql, ...p) => {
      const r = prep(sql).get(...p);
      return r ? { ...r } : undefined;
    },
    run: (sql, ...p) => prep(sql).run(...p),
    tx(fn) {
      db.exec('BEGIN');
      try {
        const r = fn();
        db.exec('COMMIT');
        return r;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    kvGet(key, fallback = null) {
      const r = api.get('SELECT value FROM kv WHERE key = ?', key);
      return r ? JSON.parse(r.value) : fallback;
    },
    kvSet(key, value) {
      api.run('INSERT INTO kv(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
    },
    /** Insert an object into a table; returns the new id. */
    insert(table, obj) {
      const keys = Object.keys(obj);
      const sql = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`;
      return Number(prep(sql).run(...keys.map((k) => norm(obj[k]))).lastInsertRowid);
    },
    update(table, id, obj) {
      const keys = Object.keys(obj);
      if (!keys.length) return;
      const sql = `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
      prep(sql).run(...keys.map((k) => norm(obj[k])), id);
    },
    close: () => db.close(),
  };
  return api;
}

function norm(v) {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v !== null && typeof v === 'object') return JSON.stringify(v);
  return v;
}
