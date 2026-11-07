import { timeToMin, minToTime, addDays, toISODate } from '../dates.js';
import { tx } from '../db.js';

const BREAK_AFTER = 50; // minutes of continuous work before a break block
const BREAK_LEN = 10;

/**
 * Calendar subagent — owns `calendar_events` and `study_sessions`.
 * Time-blocks the finalized day, appends extension blocks, logs Pomodoro sessions,
 * and answers month/day/streak queries for the in-app calendar.
 */
export class CalendarAgent {
  name = 'calendar';
  handles = ['calendar.scheduleDay', 'calendar.append', 'calendar.markTodo', 'calendar.removeTodo', 'calendar.logSession', 'calendar.day', 'calendar.month', 'calendar.rollover'];
  constructor(db) {
    this.db = db;
  }

  layout(date, startMin, todos, workedSinceBreak = 0) {
    const ins = this.db.prepare('INSERT INTO calendar_events(date, start, end, title, kind, todo_id, topic_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
    let cur = startMin;
    let run = workedSinceBreak;
    todos.forEach((td, i) => {
      if (run >= BREAK_AFTER && i > 0) {
        ins.run(date, minToTime(cur), minToTime(cur + BREAK_LEN), 'Break · stretch & hydrate', 'break', null, null);
        cur += BREAK_LEN;
        run = 0;
      }
      ins.run(date, minToTime(cur), minToTime(cur + td.minutes), td.title, td.kind, td.id, td.topic_id);
      cur += td.minutes;
      run += td.minutes;
    });
    return cur;
  }

  day(date) {
    return this.db.prepare('SELECT * FROM calendar_events WHERE date = ? ORDER BY start, id').all(date);
  }

  handle({ type, payload }) {
    switch (type) {
      case 'calendar.scheduleDay': {
        const { date, startTime, todos } = payload;
        tx(this.db, () => {
          this.db.prepare("DELETE FROM calendar_events WHERE date = ? AND kind != 'pomodoro'").run(date);
          this.layout(date, timeToMin(startTime), todos);
        });
        this.bus?.log('calendar', 'day.scheduled', `${todos.length} blocks from ${startTime}`);
        return this.day(date);
      }

      case 'calendar.append': {
        const { date, todos, nowMin } = payload;
        const last = this.db.prepare("SELECT end FROM calendar_events WHERE date = ? AND kind != 'pomodoro' ORDER BY end DESC LIMIT 1").get(date);
        const start = Math.max(last ? timeToMin(last.end) : 0, nowMin ?? 0);
        tx(this.db, () => this.layout(date, start, todos, BREAK_AFTER));
        this.bus?.log('calendar', 'blocks.appended', `${todos.length} blocks at ${minToTime(start)}`);
        return this.day(date);
      }

      case 'calendar.markTodo': {
        this.db.prepare('UPDATE calendar_events SET status = ? WHERE todo_id = ?').run(payload.done ? 'done' : 'scheduled', payload.todoId);
        return { ok: true };
      }

      case 'calendar.removeTodo': {
        this.db.prepare('DELETE FROM calendar_events WHERE todo_id = ?').run(payload.todoId);
        return { ok: true };
      }

      case 'calendar.logSession': {
        const { startTs, minutes, category = 'new', todoId = null, topicId = null } = payload;
        const start = new Date(startTs);
        const date = toISODate(start);
        const sMin = start.getHours() * 60 + start.getMinutes();
        const r = this.db
          .prepare('INSERT INTO study_sessions(date, start_ts, minutes, category, todo_id, topic_id) VALUES (?, ?, ?, ?, ?, ?)')
          .run(date, start.toISOString(), minutes, category, todoId, topicId);
        const title = payload.title ? `Focus · ${payload.title}` : 'Focus session';
        this.db
          .prepare("INSERT INTO calendar_events(date, start, end, title, kind, todo_id, topic_id, status) VALUES (?, ?, ?, ?, 'pomodoro', ?, ?, 'logged')")
          .run(date, minToTime(sMin), minToTime(sMin + Math.max(1, Math.round(minutes))), title, todoId, topicId);
        this.bus?.log('calendar', 'session.logged', `${Math.round(minutes)} min focus${payload.title ? ` · ${payload.title}` : ''}`);
        return { id: Number(r.lastInsertRowid), date };
      }

      case 'calendar.day':
        return { date: payload.date, events: this.day(payload.date) };

      case 'calendar.month': {
        const [y, m] = payload.month.split('-').map(Number);
        const from = `${payload.month}-01`;
        const to = addDays(toISODate(new Date(y, m, 1)), -1);
        const days = {};
        const mins = studiedMinutesByDay(this.db, from, to);
        for (const [d, v] of Object.entries(mins)) days[d] = { ...v, events: 0, done: 0, missed: 0 };
        for (const r of this.db
          .prepare(
            `SELECT date, COUNT(*) AS events, SUM(status = 'done') AS done, SUM(status = 'missed') AS missed
             FROM calendar_events WHERE date BETWEEN ? AND ? AND kind IN ('new','revision') GROUP BY date`,
          )
          .all(from, to)) {
          days[r.date] = { ...(days[r.date] || { new: 0, revision: 0, total: 0 }), events: r.events, done: r.done, missed: r.missed };
        }
        return { month: payload.month, from, to, days };
      }

      case 'calendar.rollover': {
        const n = this.db.prepare("UPDATE calendar_events SET status = 'missed' WHERE date < ? AND status = 'scheduled' AND kind IN ('new','revision')").run(payload.date).changes;
        return { missed: n };
      }
    }
  }
}

/**
 * Minutes studied per day, split new/revision. A completed to-do counts its logged Pomodoro
 * minutes if any, otherwise its planned minutes. Unlinked Pomodoro sessions count on their own.
 */
export function studiedMinutesByDay(db, from, to) {
  const out = {};
  const add = (d, cat, m) => {
    out[d] ??= { new: 0, revision: 0, total: 0 };
    const k = cat === 'revision' ? 'revision' : 'new';
    out[d][k] += m;
    out[d].total += m;
  };
  for (const r of db
    .prepare(
      `SELECT td.date, td.kind, td.minutes FROM todos td
       WHERE td.status = 'done' AND td.date BETWEEN ? AND ?
         AND NOT EXISTS (SELECT 1 FROM study_sessions s WHERE s.todo_id = td.id)`,
    )
    .all(from, to))
    add(r.date, r.kind, r.minutes);
  for (const r of db.prepare('SELECT date, category, minutes FROM study_sessions WHERE date BETWEEN ? AND ?').all(from, to)) add(r.date, r.category, r.minutes);
  for (const v of Object.values(out)) {
    v.new = Math.round(v.new);
    v.revision = Math.round(v.revision);
    v.total = Math.round(v.total);
  }
  return out;
}
