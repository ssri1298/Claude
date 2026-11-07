import { AgentBus } from './bus.js';
import { YieldAgent } from './yieldAgent.js';
import { PlannerAgent, studyCost, recallCost } from './plannerAgent.js';
import { TodoAgent } from './todoAgent.js';
import { CalendarAgent, studiedMinutesByDay } from './calendarAgent.js';
import { getSettings, tx } from '../db.js';
import { addDays, diffDays, today as todayFn } from '../dates.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * StudyAgent — the orchestrator. Exposes high-level intents to the API and delegates the
 * work to its subagents over the bus:
 *   yield    → past-exam frequency scoring & Study Next ranking
 *   planner  → daily time split between new videos and active recall
 *   todo     → checklist creation / completion (subagent)
 *   calendar → time-blocking, session logging, calendar views (subagent)
 */
export class StudyAgent {
  constructor(db, { now = () => new Date(), today = todayFn } = {}) {
    this.db = db;
    this.now = now;
    this.todayFn = today;
    this.bus = new AgentBus(db);
    this.bus.register(new YieldAgent(db));
    this.bus.register(new PlannerAgent(db));
    this.bus.register(new TodoAgent(db));
    this.bus.register(new CalendarAgent(db));
    this.bus.on('day.complete', ({ date }) => this.bus.log('orchestrator', 'day.complete', `All tasks for ${date} finished — offering more topics or extra revision`));
    this.rolledFor = null;
  }

  get settings() {
    return getSettings(this.db);
  }

  today() {
    return this.todayFn();
  }

  rollover(date) {
    if (this.rolledFor === date) return;
    this.bus.request('todo.rollover', { date });
    this.bus.request('calendar.rollover', { date });
    this.rolledFor = date;
  }

  plan(date) {
    const plan = this.db.prepare('SELECT * FROM plans WHERE date = ?').get(date);
    if (!plan) return null;
    plan.items = this.db
      .prepare(
        `SELECT pi.*, t.title, t.subject, t.duration_min, t.yield_area, COALESCE(t.yield_override, t.yield_weight) AS weight
         FROM plan_items pi JOIN topics t ON t.id = pi.topic_id WHERE pi.plan_id = ? ORDER BY pi.position, pi.id`,
      )
      .all(plan.id);
    return plan;
  }

  // ── Intents ──────────────────────────────────────────────────────────────

  getToday() {
    const date = this.today();
    this.rollover(date);
    const plan = this.plan(date);
    const todos = this.bus.request('todo.list', { date });
    const events = this.bus.request('calendar.day', { date }).events;
    return {
      date,
      checkInNeeded: !plan,
      plan,
      todos,
      events,
      allDone: todos.length > 0 && todos.every((t) => t.status === 'done'),
      settings: this.settings,
    };
  }

  startDay({ availableMin, startTime = '09:00', replan = false }) {
    const date = this.today();
    this.rollover(date);
    availableMin = Math.round(Number(availableMin));
    if (!(availableMin >= 15 && availableMin <= 16 * 60)) throw new HttpError(400, 'Available time must be between 15 minutes and 16 hours');
    if (!/^\d{2}:\d{2}$/.test(startTime)) throw new HttpError(400, 'Start time must be HH:MM');
    const existing = this.db.prepare('SELECT * FROM plans WHERE date = ?').get(date);
    if (existing?.status === 'final') {
      if (!replan) throw new HttpError(409, 'Today is already planned');
      this.resetDay();
    }
    const settings = this.settings;
    const draft = this.bus.request('planner.draft', { date, availableMin, settings });
    tx(this.db, () => {
      this.db.prepare('DELETE FROM plans WHERE date = ?').run(date);
      const planId = Number(
        this.db.prepare("INSERT INTO plans(date, available_min, start_time, revision_share, status) VALUES (?, ?, ?, ?, 'draft')").run(date, availableMin, startTime, settings.revisionShare).lastInsertRowid,
      );
      const ins = this.db.prepare('INSERT INTO plan_items(plan_id, topic_id, kind, minutes, position) VALUES (?, ?, ?, ?, ?)');
      draft.items.forEach((it) => ins.run(planId, it.topic_id, it.kind, it.minutes, it.position));
    });
    this.bus.log('orchestrator', 'day.started', `${availableMin} min available from ${startTime}`);
    return { plan: this.plan(date), summary: draft.summary };
  }

  updatePlanItems(items) {
    const date = this.today();
    const plan = this.db.prepare('SELECT * FROM plans WHERE date = ?').get(date);
    if (!plan) throw new HttpError(404, 'No plan for today');
    if (plan.status === 'final') throw new HttpError(409, 'Plan already finalized');
    tx(this.db, () => {
      this.db.prepare('DELETE FROM plan_items WHERE plan_id = ?').run(plan.id);
      const ins = this.db.prepare('INSERT INTO plan_items(plan_id, topic_id, kind, minutes, position) VALUES (?, ?, ?, ?, ?)');
      items.forEach((it, i) => ins.run(plan.id, it.topic_id, it.kind === 'revision' ? 'revision' : 'new', Math.max(5, Math.round(it.minutes)), i));
    });
    return this.plan(date);
  }

  /** Cost of adding a topic to a draft (used by the plan builder's "add" picker). */
  itemFor(topicId, kind) {
    const t = this.db.prepare('SELECT * FROM topics WHERE id = ?').get(topicId);
    if (!t) throw new HttpError(404, 'Topic not found');
    const s = this.settings;
    return { topic_id: t.id, kind, title: t.title, minutes: kind === 'revision' ? recallCost(t, s.recallMinutes) : studyCost(t, s.durationMultiplier) };
  }

  finalizePlan() {
    const date = this.today();
    const plan = this.plan(date);
    if (!plan) throw new HttpError(404, 'No plan for today');
    if (plan.status === 'final') throw new HttpError(409, 'Plan already finalized');
    if (!plan.items.length) throw new HttpError(400, 'Plan is empty — add at least one topic');
    const todos = this.bus.request('todo.createFromPlan', { date, items: plan.items });
    const events = this.bus.request('calendar.scheduleDay', { date, startTime: plan.start_time, todos });
    this.db.prepare("UPDATE plans SET status = 'final' WHERE id = ?").run(plan.id);
    this.db.prepare('UPDATE plan_items SET committed = 1 WHERE plan_id = ?').run(plan.id);
    this.bus.log('orchestrator', 'plan.finalized', `${todos.length} to-dos handed to To-do & Calendar subagents`);
    return { plan: this.plan(date), todos: this.bus.request('todo.list', { date }), events };
  }

  resetDay() {
    const date = this.today();
    const done = this.db.prepare("SELECT COUNT(*) AS n FROM todos WHERE date = ? AND status = 'done'").get(date).n;
    if (done) throw new HttpError(409, 'Some tasks are already ticked — untick them before re-planning');
    tx(this.db, () => {
      for (const td of this.db.prepare('SELECT id FROM todos WHERE date = ?').all(date)) this.bus.request('todo.remove', { id: td.id });
      this.db.prepare("DELETE FROM calendar_events WHERE date = ? AND kind != 'pomodoro'").run(date);
      this.db.prepare('DELETE FROM plans WHERE date = ?').run(date);
    });
    this.bus.log('orchestrator', 'day.reset', date);
    return this.getToday();
  }

  completeTask(id, { done = true, rating, notes } = {}) {
    const res = this.bus.request('todo.toggle', { id, done, rating, notes });
    this.bus.request('calendar.markTodo', { todoId: id, done });
    return res;
  }

  removeTodo(id) {
    const r = this.bus.request('todo.remove', { id });
    if (r.removed) this.bus.request('calendar.removeTodo', { todoId: id });
    return r;
  }

  nowMin() {
    const n = this.now();
    return n.getHours() * 60 + n.getMinutes();
  }

  extendDay({ mode, minutes = 60 }) {
    const date = this.today();
    if (!['new', 'revision'].includes(mode)) throw new HttpError(400, 'mode must be new or revision');
    minutes = Math.max(10, Math.min(8 * 60, Math.round(Number(minutes))));
    const ext = this.bus.request('planner.extend', { date, mode, minutes, settings: this.settings });
    if (!ext.items.length) return { added: 0, notes: ext.summary.notes.length ? ext.summary.notes : ['Nothing fits in that time.'], todos: this.bus.request('todo.list', { date }) };
    return { ...this.addItemsToDay(date, ext.items), notes: ext.summary.notes };
  }

  addTopicToday({ topicId, kind = 'new' }) {
    const date = this.today();
    return this.addItemsToDay(date, [this.itemFor(topicId, kind)]);
  }

  addItemsToDay(date, items) {
    let plan = this.db.prepare('SELECT * FROM plans WHERE date = ?').get(date);
    if (!plan) {
      const id = this.db.prepare("INSERT INTO plans(date, available_min, start_time, status) VALUES (?, 0, ?, 'final')").run(date, '09:00').lastInsertRowid;
      plan = { id: Number(id) };
    }
    const maxPos = this.db.prepare('SELECT COALESCE(MAX(position), -1) AS p FROM plan_items WHERE plan_id = ?').get(plan.id).p;
    const ins = this.db.prepare('INSERT INTO plan_items(plan_id, topic_id, kind, minutes, position, committed) VALUES (?, ?, ?, ?, ?, 1)');
    const withIds = items.map((it, i) => ({ ...it, id: Number(ins.run(plan.id, it.topic_id, it.kind, it.minutes, maxPos + 1 + i).lastInsertRowid) }));
    this.db.prepare('UPDATE plans SET available_min = available_min + ? WHERE id = ?').run(items.reduce((a, b) => a + b.minutes, 0), plan.id);
    const todos = this.bus.request('todo.createFromPlan', { date, items: withIds });
    this.bus.request('calendar.append', { date, todos, nowMin: this.nowMin() });
    return { added: todos.length, todos: this.bus.request('todo.list', { date }) };
  }

  logSession(p) {
    const minutes = Number(p.minutes);
    if (!(minutes > 0 && minutes <= 240)) throw new HttpError(400, 'minutes must be between 0 and 240');
    let { category, topicId, title } = p;
    if (p.todoId) {
      const td = this.db.prepare('SELECT * FROM todos WHERE id = ?').get(p.todoId);
      if (td) {
        category = td.kind;
        topicId = td.topic_id;
        title = td.title;
      }
    }
    return this.bus.request('calendar.logSession', { startTs: p.startTs || new Date(this.now().getTime() - minutes * 60000).toISOString(), minutes, category, todoId: p.todoId ?? null, topicId: topicId ?? null, title });
  }

  importTopics(list) {
    const maxOrder = this.db.prepare('SELECT COALESCE(MAX(order_idx), -1) AS m FROM topics').get().m;
    const ins = this.db.prepare('INSERT INTO topics(title, subject, duration_min, source, order_idx, yield_area, yield_weight) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const clean = list
      .map((t) => ({ title: String(t.title || '').trim().slice(0, 200), duration_min: Math.max(0, Math.round(Number(t.duration_min) || 0)), subject: t.subject, source: t.source || 'manual' }))
      .filter((t) => t.title.length >= 2);
    const ids = tx(this.db, () =>
      clean.map((t, i) => {
        const c = this.bus.request('yield.classify', { title: t.title });
        return Number(ins.run(t.title, t.subject || c.subject, t.duration_min, t.source, maxOrder + 1 + i, c.area, c.weight).lastInsertRowid);
      }),
    );
    this.bus.log('orchestrator', 'topics.imported', `${ids.length} video topic(s) added and scored`);
    return ids;
  }

  studyNext() {
    return this.bus.request('yield.rank', { lowYieldThreshold: this.settings.lowYieldThreshold });
  }

  revisionQueue() {
    const date = this.today();
    const rows = this.db.prepare("SELECT *, COALESCE(yield_override, yield_weight) AS weight FROM topics WHERE status = 'done' ORDER BY next_review ASC").all();
    return rows.map((t) => ({ ...t, overdue: t.next_review ? diffDays(date, t.next_review) : 0, due: t.next_review && t.next_review <= date }));
  }

  reviewTopic({ topicId, rating, notes }) {
    return this.bus.request('todo.reviewTopic', { topicId, rating, notes, date: this.today() });
  }

  calendarMonth(month) {
    return this.bus.request('calendar.month', { month });
  }

  calendarDay(date) {
    return this.bus.request('calendar.day', { date });
  }

  stats(days = 14) {
    const date = this.today();
    const from = addDays(date, -(days - 1));
    const byDay = studiedMinutesByDay(this.db, from, date);
    const series = [];
    for (let i = 0; i < days; i++) {
      const d = addDays(from, i);
      series.push({ date: d, ...(byDay[d] || { new: 0, revision: 0, total: 0 }) });
    }
    // Weekly topic completions, last 8 weeks (weeks start Monday)
    const dow = (new Date(date + 'T00:00:00').getDay() + 6) % 7;
    const thisMonday = addDays(date, -dow);
    const weeks = [];
    for (let w = 7; w >= 0; w--) {
      const start = addDays(thisMonday, -7 * w);
      const end = addDays(start, 6);
      const n = this.db.prepare("SELECT COUNT(*) AS n FROM todos WHERE status = 'done' AND kind = 'new' AND date BETWEEN ? AND ?").get(start, end).n;
      const r = this.db.prepare('SELECT COUNT(*) AS n FROM reviews WHERE date BETWEEN ? AND ?').get(start, end).n;
      weeks.push({ week: start, topics: n, recalls: r });
    }
    const status = this.db.prepare('SELECT status, COUNT(*) AS n FROM topics GROUP BY status').all();
    const bySubject = this.db
      .prepare(
        `SELECT COALESCE(subject,'General') AS subject, SUM(status='done') AS done, SUM(status IN ('pending','planned')) AS pending,
                SUM(status='skipped') AS skipped, COUNT(*) AS total FROM topics GROUP BY subject ORDER BY total DESC`,
      )
      .all();
    const allTime = studiedMinutesByDay(this.db, '0000-01-01', '9999-12-31');
    const totalMinutes = Object.values(allTime).reduce((a, b) => a + b.total, 0);
    let streak = 0;
    let cursor = allTime[date]?.total ? date : addDays(date, -1);
    while (allTime[cursor]?.total > 0) {
      streak++;
      cursor = addDays(cursor, -1);
    }
    const weekMinutes = Object.entries(allTime).filter(([d]) => d >= thisMonday && d <= date).reduce((a, [, v]) => a + v.total, 0);
    const todos = this.db.prepare('SELECT status, minutes FROM todos WHERE date = ?').all(date);
    const settings = this.settings;
    const counts = Object.fromEntries(status.map((s) => [s.status, s.n]));
    return {
      date,
      series,
      weeks,
      status: counts,
      bySubject,
      totals: {
        totalMinutes,
        weekMinutes,
        streak,
        topicsDone: counts.done || 0,
        topicsTotal: (counts.done || 0) + (counts.pending || 0) + (counts.planned || 0),
        dueToday: this.db.prepare("SELECT COUNT(*) AS n FROM topics WHERE status='done' AND next_review <= ?").get(date).n,
      },
      today: {
        done: todos.filter((t) => t.status === 'done').length,
        total: todos.length,
        minutesDone: todos.filter((t) => t.status === 'done').reduce((a, b) => a + b.minutes, 0),
        minutesPlanned: todos.reduce((a, b) => a + b.minutes, 0),
        studied: allTime[date]?.total || 0,
      },
      examDate: settings.examDate,
      daysToExam: settings.examDate ? diffDays(settings.examDate, date) : null,
    };
  }

  agentLog(limit = 40) {
    return this.db.prepare('SELECT * FROM agent_log ORDER BY id DESC LIMIT ?').all(limit);
  }
}
