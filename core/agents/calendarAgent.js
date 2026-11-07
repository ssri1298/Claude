import { timeToMin, minToTime, addDays, toISODate } from '../dates.js';

const BREAK_AFTER = 50; // minutes of continuous work before a break block
const BREAK_LEN = 10;
const byStart = (a, b) => a.start.localeCompare(b.start) || a.id - b.id;

/**
 * Calendar subagent — owns `calendar_events` and `study_sessions`.
 * Time-blocks the finalized day, appends extension blocks, logs Pomodoro sessions,
 * and answers month/day/streak queries for the in-app calendar.
 */
export class CalendarAgent {
  name = 'calendar';
  handles = ['calendar.scheduleDay', 'calendar.append', 'calendar.markTodo', 'calendar.removeTodo', 'calendar.logSession', 'calendar.day', 'calendar.month', 'calendar.rollover'];
  constructor(store) {
    this.store = store;
  }

  layout(date, startMin, todos, workedSinceBreak = 0) {
    const s = this.store;
    let cur = startMin;
    let run = workedSinceBreak;
    todos.forEach((td, i) => {
      if (run >= BREAK_AFTER && i > 0) {
        s.insert('calendar_events', { date, start: minToTime(cur), end: minToTime(cur + BREAK_LEN), title: 'Break · stretch & hydrate', kind: 'break' });
        cur += BREAK_LEN;
        run = 0;
      }
      s.insert('calendar_events', { date, start: minToTime(cur), end: minToTime(cur + td.minutes), title: td.title, kind: td.kind, todo_id: td.id, topic_id: td.topic_id });
      cur += td.minutes;
      run += td.minutes;
    });
    return cur;
  }

  day(date) {
    return this.store.all('calendar_events', (e) => e.date === date).sort(byStart);
  }

  handle({ type, payload }) {
    const s = this.store;
    switch (type) {
      case 'calendar.scheduleDay': {
        const { date, startTime, todos } = payload;
        s.tx(() => {
          s.remove('calendar_events', (e) => e.date === date && e.kind !== 'pomodoro');
          this.layout(date, timeToMin(startTime), todos);
        });
        this.bus?.log('calendar', 'day.scheduled', `${todos.length} blocks from ${startTime}`);
        return this.day(date);
      }

      case 'calendar.append': {
        const { date, todos, nowMin } = payload;
        const ends = s.all('calendar_events', (e) => e.date === date && e.kind !== 'pomodoro').map((e) => timeToMin(e.end));
        const start = Math.max(ends.length ? Math.max(...ends) : 0, nowMin ?? 0);
        s.tx(() => this.layout(date, start, todos, BREAK_AFTER));
        this.bus?.log('calendar', 'blocks.appended', `${todos.length} blocks at ${minToTime(start)}`);
        return this.day(date);
      }

      case 'calendar.markTodo':
        s.update('calendar_events', (e) => e.todo_id === payload.todoId && e.kind !== 'pomodoro', { status: payload.done ? 'done' : 'scheduled' });
        return { ok: true };

      case 'calendar.removeTodo':
        s.remove('calendar_events', (e) => e.todo_id === payload.todoId);
        return { ok: true };

      case 'calendar.logSession': {
        const { startTs, minutes, category = 'new', todoId = null, topicId = null } = payload;
        const start = new Date(startTs);
        const date = toISODate(start);
        const sMin = start.getHours() * 60 + start.getMinutes();
        const id = s.tx(() => {
          const sid = s.insert('study_sessions', { date, start_ts: start.toISOString(), minutes, category, todo_id: todoId, topic_id: topicId });
          s.insert('calendar_events', {
            date, start: minToTime(sMin), end: minToTime(sMin + Math.max(1, Math.round(minutes))),
            title: payload.title ? `Focus · ${payload.title}` : 'Focus session', kind: 'pomodoro', todo_id: todoId, topic_id: topicId, status: 'logged',
          });
          return sid;
        });
        this.bus?.log('calendar', 'session.logged', `${Math.round(minutes)} min focus${payload.title ? ` · ${payload.title}` : ''}`);
        return { id, date };
      }

      case 'calendar.day':
        return { date: payload.date, events: this.day(payload.date) };

      case 'calendar.month': {
        const [y, m] = payload.month.split('-').map(Number);
        const from = `${payload.month}-01`;
        const to = addDays(toISODate(new Date(y, m, 1)), -1);
        const days = {};
        for (const [d, v] of Object.entries(studiedMinutesByDay(s, from, to))) days[d] = { ...v, events: 0, done: 0, missed: 0 };
        for (const e of s.all('calendar_events', (e) => e.date >= from && e.date <= to && (e.kind === 'new' || e.kind === 'revision'))) {
          const d = (days[e.date] ??= { new: 0, revision: 0, total: 0, events: 0, done: 0, missed: 0 });
          d.events++;
          if (e.status === 'done') d.done++;
          if (e.status === 'missed') d.missed++;
        }
        return { month: payload.month, from, to, days };
      }

      case 'calendar.rollover': {
        const n = s.update('calendar_events', (e) => e.date < payload.date && e.status === 'scheduled' && (e.kind === 'new' || e.kind === 'revision'), { status: 'missed' });
        return { missed: n };
      }
    }
  }
}

/**
 * Minutes studied per day, split new/revision. A completed to-do counts its logged Pomodoro
 * minutes if any, otherwise its planned minutes. Unlinked Pomodoro sessions count on their own.
 */
export function studiedMinutesByDay(store, from, to) {
  const out = {};
  const add = (d, cat, m) => {
    out[d] ??= { new: 0, revision: 0, total: 0 };
    const k = cat === 'revision' ? 'revision' : 'new';
    out[d][k] += m;
    out[d].total += m;
  };
  const sessions = store.all('study_sessions', (x) => x.date >= from && x.date <= to);
  const linked = new Set(store.all('study_sessions', (x) => x.todo_id != null).map((x) => x.todo_id));
  for (const td of store.all('todos', (td) => td.status === 'done' && td.date >= from && td.date <= to && !linked.has(td.id))) add(td.date, td.kind, td.minutes);
  for (const x of sessions) add(x.date, x.category, x.minutes);
  for (const v of Object.values(out)) {
    v.new = Math.round(v.new);
    v.revision = Math.round(v.revision);
    v.total = Math.round(v.total);
  }
  return out;
}
