import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  subject TEXT,
  duration_min INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual',
  order_idx INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',       -- pending | planned | done | skipped
  yield_area TEXT,
  yield_weight REAL NOT NULL DEFAULT 4,
  yield_override REAL,
  skip_dismissed INTEGER NOT NULL DEFAULT 0,
  carryover INTEGER NOT NULL DEFAULT 0,
  ease REAL NOT NULL DEFAULT 2.5,
  interval_days INTEGER NOT NULL DEFAULT 0,
  repetitions INTEGER NOT NULL DEFAULT 0,
  next_review TEXT,
  last_reviewed TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  rating TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  available_min INTEGER NOT NULL,
  start_time TEXT NOT NULL DEFAULT '09:00',
  revision_share REAL NOT NULL DEFAULT 0.3,
  status TEXT NOT NULL DEFAULT 'draft'          -- draft | final
);
CREATE TABLE IF NOT EXISTS plan_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                           -- new | revision
  minutes INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  committed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  plan_item_id INTEGER,
  topic_id INTEGER REFERENCES topics(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',          -- open | done | missed
  done_at TEXT,
  undo TEXT                                     -- snapshot of topic SRS state before completion
);
CREATE TABLE IF NOT EXISTS calendar_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  start TEXT NOT NULL,
  end TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,                           -- new | revision | break | pomodoro
  todo_id INTEGER,
  topic_id INTEGER,
  status TEXT NOT NULL DEFAULT 'scheduled'      -- scheduled | done | missed | logged
);
CREATE TABLE IF NOT EXISTS study_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  start_ts TEXT NOT NULL,
  minutes REAL NOT NULL,
  category TEXT NOT NULL DEFAULT 'new',         -- new | revision
  todo_id INTEGER,
  topic_id INTEGER
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  agent TEXT NOT NULL,
  event TEXT NOT NULL,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_todos_date ON todos(date);
CREATE INDEX IF NOT EXISTS idx_events_date ON calendar_events(date);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON study_sessions(date);
`;

export const DEFAULT_SETTINGS = {
  revisionShare: 0.3,
  durationMultiplier: 1.25,
  breakBufferPct: 0.1,
  recallMinutes: 12,
  lowYieldThreshold: 3,
  examDate: null,
  pomodoro: { focus: 25, short: 5, long: 15, roundsBeforeLong: 4 },
};

export function openDb(path = process.env.DB_PATH || 'data/study.db') {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

export function getSettings(db) {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const s = structuredClone(DEFAULT_SETTINGS);
  for (const r of rows) s[r.key] = JSON.parse(r.value);
  return s;
}

export function saveSettings(db, patch) {
  const stmt = db.prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [k, v] of Object.entries(patch)) {
    if (k in DEFAULT_SETTINGS) stmt.run(k, JSON.stringify(v));
  }
  return getSettings(db);
}

/** Run fn inside a transaction. */
export function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
