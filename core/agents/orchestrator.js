import { AgentBus } from './bus.js';
import { YieldAgent } from './yieldAgent.js';
import { PlannerAgent, studyCost, recallCost } from './plannerAgent.js';
import { TodoAgent } from './todoAgent.js';
import { CalendarAgent, studiedMinutesByDay } from './calendarAgent.js';
import { getSettings, saveSettings } from '../settings.js';
import { initialSchedule } from './srs.js';
import { addDays, diffDays, today as todayFn } from '../dates.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const weightOf = (t) => t.yield_override ?? t.yield_weight;

/**
 * StudyAgent — the orchestrator. Exposes high-level intents to the API and delegates the
 * work to its subagents over the bus:
 *   yield    → past-exam frequency scoring & Study Next ranking
 *   planner  → daily time split between new videos and active recall
 *   todo     → checklist creation / completion (subagent)
 *   calendar → time-blocking, session logging, calendar views (subagent)
 */
export class StudyAgent {
  constructor(store, { now = () => new Date(), today = todayFn } = {}) {
    this.store = store;
    this.now = now;
    this.todayFn = today;
    this.bus = new AgentBus(store);
    this.bus.register(new YieldAgent(store));
    this.bus.register(new PlannerAgent(store));
    this.bus.register(new TodoAgent(store));
    this.bus.register(new CalendarAgent(store));
    this.bus.on('day.complete', ({ date }) => this.bus.log('orchestrator', 'day.complete', `All tasks for ${date} finished — offering more topics or extra revision`));
    this.rolledFor = null;
  }

  get settings() {
    return getSettings(this.store);
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

  planRow(date) {
    return this.store.find('plans', (p) => p.date === date);
  }

  plan(date) {
    const plan = this.planRow(date);
    if (!plan) return null;
    plan.items = this.store
      .all('plan_items', (pi) => pi.plan_id === plan.id)
      .sort((a, b) => a.position - b.position || a.id - b.id)
      .map((pi) => {
        const t = this.store.get('topics', pi.topic_id);
        return t ? { ...pi, title: t.title, subject: t.subject, duration_min: t.duration_min, yield_area: t.yield_area, weight: weightOf(t) } : null;
      })
      .filter(Boolean);
    return plan;
  }

  insertItems(planId, items, committed = 0, startPos = 0) {
    return items.map((it, i) =>
      this.store.insert('plan_items', { plan_id: planId, topic_id: it.topic_id, kind: it.kind === 'revision' ? 'revision' : 'new', minutes: Math.max(5, Math.round(it.minutes)), position: startPos + i, committed }),
    );
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
    const existing = this.planRow(date);
    if (existing?.status === 'final') {
      if (!replan) throw new HttpError(409, 'Today is already planned');
      this.resetDay();
    }
    const settings = this.settings;
    const draft = this.bus.request('planner.draft', { date, availableMin, settings });
    this.store.tx(() => {
      const old = this.planRow(date);
      if (old) {
        this.store.remove('plan_items', (pi) => pi.plan_id === old.id);
        this.store.remove('plans', old.id);
      }
      const planId = this.store.insert('plans', { date, available_min: availableMin, start_time: startTime, revision_share: settings.revisionShare, status: 'draft', notes: draft.summary.notes });
      this.insertItems(planId, draft.items);
    });
    this.bus.log('orchestrator', 'day.started', `${availableMin} min available from ${startTime}`);
    return { plan: this.plan(date), summary: draft.summary };
  }

  updatePlanItems(items) {
    const date = this.today();
    const plan = this.planRow(date);
    if (!plan) throw new HttpError(404, 'No plan for today');
    if (plan.status === 'final') throw new HttpError(409, 'Plan already finalized');
    this.store.tx(() => {
      this.store.remove('plan_items', (pi) => pi.plan_id === plan.id);
      this.insertItems(plan.id, items);
    });
    return this.plan(date);
  }

  /** Cost of adding a topic to a draft (used by the plan builder's "add" picker). */
  itemFor(topicId, kind) {
    const t = this.store.get('topics', topicId);
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
    const { todos, events } = this.store.tx(() => {
      const todos = this.bus.request('todo.createFromPlan', { date, items: plan.items });
      const events = this.bus.request('calendar.scheduleDay', { date, startTime: plan.start_time, todos });
      this.store.update('plans', plan.id, { status: 'final' });
      this.store.update('plan_items', (pi) => pi.plan_id === plan.id, { committed: 1 });
      return { todos, events };
    });
    this.bus.log('orchestrator', 'plan.finalized', `${todos.length} to-dos handed to To-do & Calendar subagents`);
    return { plan: this.plan(date), todos: this.bus.request('todo.list', { date }), events };
  }

  resetDay() {
    const date = this.today();
    if (this.store.count('todos', (td) => td.date === date && td.status === 'done')) throw new HttpError(409, 'Some tasks are already ticked — untick them before re-planning');
    this.store.tx(() => {
      for (const td of this.store.all('todos', (td) => td.date === date)) this.bus.request('todo.remove', { id: td.id });
      this.store.remove('calendar_events', (e) => e.date === date && e.kind !== 'pomodoro');
      const p = this.planRow(date);
      if (p) {
        this.store.remove('plan_items', (pi) => pi.plan_id === p.id);
        this.store.remove('plans', p.id);
      }
    });
    this.bus.log('orchestrator', 'day.reset', date);
    return this.getToday();
  }

  completeTask(id, { done = true, rating, notes } = {}) {
    return this.store.tx(() => {
      const res = this.bus.request('todo.toggle', { id, done, rating, notes });
      this.bus.request('calendar.markTodo', { todoId: id, done });
      return res;
    });
  }

  removeTodo(id) {
    return this.store.tx(() => {
      const r = this.bus.request('todo.remove', { id });
      if (r.removed) this.bus.request('calendar.removeTodo', { todoId: id });
      return r;
    });
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
    return this.addItemsToDay(this.today(), [this.itemFor(topicId, kind)]);
  }

  addItemsToDay(date, items) {
    return this.store.tx(() => {
      let plan = this.planRow(date);
      if (!plan) plan = { id: this.store.insert('plans', { date, available_min: 0, start_time: '09:00', status: 'final' }), available_min: 0 };
      const maxPos = Math.max(-1, ...this.store.all('plan_items', (pi) => pi.plan_id === plan.id).map((pi) => pi.position));
      const ids = this.insertItems(plan.id, items, 1, maxPos + 1);
      const withIds = items.map((it, i) => ({ ...it, id: ids[i] }));
      this.store.update('plans', plan.id, (p) => ({ available_min: p.available_min + items.reduce((a, b) => a + b.minutes, 0) }));
      const todos = this.bus.request('todo.createFromPlan', { date, items: withIds });
      this.bus.request('calendar.append', { date, todos, nowMin: this.nowMin() });
      return { added: todos.length, todos: this.bus.request('todo.list', { date }) };
    });
  }

  logSession(p) {
    const minutes = Number(p.minutes);
    if (!(minutes > 0 && minutes <= 240)) throw new HttpError(400, 'minutes must be between 0 and 240');
    let { category, topicId, title } = p;
    if (p.todoId) {
      const td = this.store.get('todos', p.todoId);
      if (td) {
        category = td.kind;
        topicId = td.topic_id;
        title = td.title;
      }
    }
    return this.bus.request('calendar.logSession', {
      startTs: p.startTs || new Date(this.now().getTime() - minutes * 60000).toISOString(),
      minutes, category, todoId: p.todoId ?? null, topicId: topicId ?? null, title,
    });
  }

  /**
   * Add video topics. Each item: {title, duration_min, section?, subject?, source?, status?}.
   * `section` (the course heading) helps classify generic titles; status 'done' marks a video
   * already watched, which goes straight into the revision schedule. Titles already in the
   * library are skipped.
   */
  importTopics(list) {
    const key = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
    const wasEmpty = this.store.count('topics') === 0;
    const existing = new Set(this.store.all('topics').map((t) => key(t.title)));
    const maxOrder = Math.max(-1, ...this.store.all('topics').map((t) => t.order_idx));
    const date = this.today();
    const skipped = [];
    const clean = [];
    for (const t of Array.isArray(list) ? list : []) {
      const title = String(t.title || '').trim().slice(0, 200);
      if (title.length < 2) continue;
      if (existing.has(key(title))) {
        skipped.push(title);
        continue;
      }
      existing.add(key(title));
      clean.push({
        title,
        duration_min: Math.max(0, Math.round(Number(t.duration_min) || 0)),
        section: t.section ? String(t.section).slice(0, 120) : null,
        subject: t.subject,
        source: t.source || 'manual',
        done: t.status === 'done',
      });
    }
    const ids = this.store.tx(() =>
      clean.map((t, i) => {
        const c = this.bus.request('yield.classify', { title: t.title, hint: t.section });
        const row = { title: t.title, section: t.section, subject: t.subject || c.subject, duration_min: t.duration_min, source: t.source, order_idx: maxOrder + 1 + i, yield_area: c.area, yield_weight: c.weight };
        if (t.done) Object.assign(row, initialSchedule(date), { status: 'done', completed_at: date });
        return this.store.insert('topics', row);
      }),
    );
    // A first import is already scored with the current model: nothing to re-score.
    if (wasEmpty && ids.length) saveSettings(this.store, { yieldModelSeen: this.bus.request('yield.table').version || null });
    const done = clean.filter((t) => t.done).length;
    this.bus.log('orchestrator', 'topics.imported', `${ids.length} video topic(s) added and scored${done ? ` (${done} already watched)` : ''}${skipped.length ? `, ${skipped.length} already in library` : ''}`);
    return { ids, skipped };
  }

  studyNext() {
    return this.bus.request('yield.rank', { lowYieldThreshold: this.settings.lowYieldThreshold });
  }

  revisionQueue() {
    const date = this.today();
    return this.store
      .all('topics', (t) => t.status === 'done')
      .sort((a, b) => String(a.next_review ?? '').localeCompare(String(b.next_review ?? '')))
      .map((t) => ({ ...t, weight: weightOf(t), overdue: t.next_review ? diffDays(date, t.next_review) : 0, due: !!t.next_review && t.next_review <= date }));
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
    const s = this.store;
    const date = this.today();
    const from = addDays(date, -(days - 1));
    const byDay = studiedMinutesByDay(s, from, date);
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
      weeks.push({
        week: start,
        topics: s.count('todos', (td) => td.status === 'done' && td.kind === 'new' && td.date >= start && td.date <= end),
        recalls: s.count('reviews', (r) => r.date >= start && r.date <= end),
      });
    }
    const topics = s.all('topics');
    const counts = {};
    for (const t of topics) counts[t.status] = (counts[t.status] || 0) + 1;
    const subj = {};
    for (const t of topics) {
      const k = t.subject || 'General';
      const v = (subj[k] ??= { subject: k, done: 0, pending: 0, skipped: 0, total: 0 });
      v.total++;
      if (t.status === 'done') v.done++;
      else if (t.status === 'skipped') v.skipped++;
      else v.pending++;
    }
    const bySubject = Object.values(subj).sort((a, b) => b.total - a.total);
    const allTime = studiedMinutesByDay(s, '0000-01-01', '9999-12-31');
    const totalMinutes = Object.values(allTime).reduce((a, b) => a + b.total, 0);
    let streak = 0;
    let cursor = allTime[date]?.total ? date : addDays(date, -1);
    while (allTime[cursor]?.total > 0) {
      streak++;
      cursor = addDays(cursor, -1);
    }
    const weekMinutes = Object.entries(allTime).filter(([d]) => d >= thisMonday && d <= date).reduce((a, [, v]) => a + v.total, 0);
    const todos = s.all('todos', (td) => td.date === date);
    const settings = this.settings;
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
        dueToday: s.count('topics', (t) => t.status === 'done' && t.next_review != null && t.next_review <= date),
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
    return this.store.all('agent_log').sort((a, b) => b.id - a.id).slice(0, limit);
  }
}
