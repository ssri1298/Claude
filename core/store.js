// A tiny in-memory table store that replaces SQLite so the same study engine runs
// in Node (persisted to a JSON file) and in the browser (persisted to the website's
// private per-user database). Rows are plain objects with an auto-increment `id`.

export const TABLES = ['topics', 'reviews', 'plans', 'plan_items', 'todos', 'calendar_events', 'study_sessions', 'agent_log'];

const pad = (n) => String(n).padStart(2, '0');
export function nowStamp(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const DEFAULTS = {
  topics: () => ({
    subject: null, section: null, duration_min: 0, source: 'manual', order_idx: 0, status: 'pending', yield_area: null, yield_weight: 4,
    yield_override: null, skip_dismissed: 0, carryover: 0, ease: 2.5, interval_days: 0, repetitions: 0, next_review: null,
    last_reviewed: null, completed_at: null, created_at: nowStamp(),
  }),
  reviews: () => ({ notes: null, created_at: nowStamp() }),
  plans: () => ({ start_time: '09:00', revision_share: 0.3, status: 'draft' }),
  plan_items: () => ({ position: 0, committed: 0 }),
  todos: () => ({ plan_item_id: null, position: 0, status: 'open', done_at: null, undo: null }),
  calendar_events: () => ({ todo_id: null, topic_id: null, status: 'scheduled' }),
  study_sessions: () => ({ category: 'new', todo_id: null, topic_id: null }),
  agent_log: () => ({ ts: nowStamp(), detail: null }),
};

const AGENT_LOG_MAX = 300;

export class Store {
  constructor() {
    this.reset();
    this.listeners = new Set();
  }

  reset() {
    this.t = Object.fromEntries(TABLES.map((n) => [n, []]));
    this.seq = Object.fromEntries(TABLES.map((n) => [n, 0]));
    this.settings = {};
  }

  /** Subscribe to changes: fn(Set<tableName | 'settings'>). */
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  touch(name) {
    if (this._batch) this._batch.add(name);
    else for (const fn of this.listeners) fn(new Set([name]));
  }

  // ── Reads ──
  all(table, pred) {
    const rows = this.t[table];
    return (pred ? rows.filter(pred) : rows.slice()).map((r) => ({ ...r }));
  }
  find(table, pred) {
    const r = this.t[table].find(pred);
    return r ? { ...r } : undefined;
  }
  get(table, id) {
    return this.find(table, (r) => r.id === Number(id));
  }
  count(table, pred) {
    return pred ? this.t[table].reduce((n, r) => n + (pred(r) ? 1 : 0), 0) : this.t[table].length;
  }

  // ── Writes ──
  insert(table, row) {
    const id = ++this.seq[table];
    const full = { ...DEFAULTS[table](), ...row, id };
    this.t[table].push(full);
    if (table === 'agent_log' && this.t.agent_log.length > AGENT_LOG_MAX) this.t.agent_log.splice(0, this.t.agent_log.length - AGENT_LOG_MAX);
    this.touch(table);
    return id;
  }
  /** Update by id or predicate; patch may be an object or fn(row) => object. Returns rows changed. */
  update(table, where, patch) {
    const pred = typeof where === 'function' ? where : (r) => r.id === Number(where);
    let n = 0;
    for (const r of this.t[table]) {
      if (!pred(r)) continue;
      Object.assign(r, typeof patch === 'function' ? patch(r) : patch);
      n++;
    }
    if (n) this.touch(table);
    return n;
  }
  remove(table, where) {
    const pred = typeof where === 'function' ? where : (r) => r.id === Number(where);
    const before = this.t[table].length;
    this.t[table] = this.t[table].filter((r) => !pred(r));
    const n = before - this.t[table].length;
    if (n) this.touch(table);
    return n;
  }
  setSettings(patch) {
    this.settings = { ...this.settings, ...patch };
    this.touch('settings');
  }

  /** Run fn atomically: on throw, state is rolled back; listeners hear one batched change. */
  tx(fn) {
    if (this._batch) return fn();
    const snap = JSON.stringify({ t: this.t, seq: this.seq, settings: this.settings });
    this._batch = new Set();
    try {
      const r = fn();
      const changed = this._batch;
      this._batch = null;
      if (changed.size) for (const l of this.listeners) l(changed);
      return r;
    } catch (e) {
      const s = JSON.parse(snap);
      this.t = s.t;
      this.seq = s.seq;
      this.settings = s.settings;
      this._batch = null;
      throw e;
    }
  }

  // ── Serialization ──
  toJSON() {
    return { version: 2, tables: this.t, seq: this.seq, settings: this.settings };
  }

  /**
   * Load a saved state. Accepts this store's own format ({version:2, tables, seq, settings}) and the
   * older SQLite-era export ({topics:[...], ..., settings:[{key, value}]}).
   */
  load(data) {
    this.reset();
    if (!data) return this;
    const tables = data.version === 2 ? data.tables : data;
    for (const n of TABLES) {
      const rows = Array.isArray(tables?.[n]) ? tables[n] : [];
      this.t[n] = rows.map((r) => ({ ...DEFAULTS[n](), ...r, id: Number(r.id) }));
      this.seq[n] = Math.max(data.seq?.[n] || 0, ...this.t[n].map((r) => r.id), 0);
    }
    if (data.version === 2) this.settings = { ...(data.settings || {}) };
    else if (Array.isArray(data.settings)) {
      for (const r of data.settings) {
        try {
          this.settings[r.key] = JSON.parse(r.value);
        } catch {}
      }
    }
    for (const fn of this.listeners) fn(new Set([...TABLES, 'settings']));
    return this;
  }
}
