import { initialSchedule, review } from './srs.js';
import { nowStamp } from '../store.js';

const SRS_COLS = ['status', 'ease', 'interval_days', 'repetitions', 'next_review', 'last_reviewed', 'completed_at', 'carryover'];
const byPos = (a, b) => a.position - b.position || a.id - b.id;

/**
 * To-do subagent — owns the `todos` table.
 * Turns finalized plan items into a tickable checklist, records completions (which feed the
 * spaced-repetition schedule), and announces "day.complete" when every item is ticked off.
 */
export class TodoAgent {
  name = 'todo';
  handles = ['todo.createFromPlan', 'todo.toggle', 'todo.list', 'todo.rollover', 'todo.reviewTopic', 'todo.remove'];
  constructor(store) {
    this.store = store;
  }

  list(date) {
    return this.store
      .all('todos', (td) => td.date === date)
      .sort(byPos)
      .map((td) => {
        const t = this.store.get('topics', td.topic_id) || {};
        return { ...td, subject: t.subject, yield_area: t.yield_area, duration_min: t.duration_min, weight: t.yield_override ?? t.yield_weight };
      });
  }

  snapshot(topicId) {
    const t = this.store.get('topics', topicId);
    return t ? JSON.stringify(Object.fromEntries(SRS_COLS.map((c) => [c, t[c]]))) : null;
  }

  restore(topicId, snap) {
    this.store.update('topics', topicId, JSON.parse(snap));
  }

  applyReview(topicId, rating, notes, date) {
    const t = this.store.get('topics', topicId);
    if (!t) throw new Error('Topic not found');
    const next = review(t, rating, date);
    this.store.update('topics', topicId, { ...next, last_reviewed: date });
    this.store.insert('reviews', { topic_id: topicId, date, rating, notes: notes ?? null });
    return next;
  }

  dayCounts(date) {
    const all = this.store.all('todos', (td) => td.date === date);
    return { open: all.filter((t) => t.status === 'open').length, total: all.length };
  }

  handle({ type, payload }) {
    const s = this.store;
    switch (type) {
      case 'todo.list':
        return this.list(payload.date);

      case 'todo.createFromPlan': {
        const { date, items } = payload;
        const maxPos = Math.max(-1, ...s.all('todos', (td) => td.date === date).map((td) => td.position));
        const created = s.tx(() =>
          items.map((it, i) => {
            const id = s.insert('todos', { date, plan_item_id: it.id ?? null, topic_id: it.topic_id, kind: it.kind, title: it.title, minutes: it.minutes, position: maxPos + 1 + i });
            if (it.kind === 'new') s.update('topics', (t) => t.id === it.topic_id && t.status === 'pending', { status: 'planned', carryover: 0 });
            return id;
          }),
        );
        this.bus?.log('todo', 'todos.created', `${created.length} to-dos for ${date}`);
        return s.all('todos', (td) => created.includes(td.id)).sort(byPos);
      }

      case 'todo.toggle': {
        const { id, done, rating = 'ok', notes } = payload;
        const td = s.get('todos', id);
        if (!td) throw new Error('To-do not found');
        s.tx(() => {
          if (done && td.status !== 'done') {
            const snap = this.snapshot(td.topic_id);
            if (td.kind === 'new') {
              s.update('topics', td.topic_id, { ...initialSchedule(td.date), status: 'done', completed_at: td.date, carryover: 0 });
            } else {
              this.applyReview(td.topic_id, rating, notes, td.date);
            }
            s.update('todos', id, { status: 'done', done_at: nowStamp(), undo: snap });
          } else if (!done && td.status === 'done') {
            if (td.undo) this.restore(td.topic_id, td.undo);
            if (td.kind === 'revision') {
              const last = s.all('reviews', (r) => r.topic_id === td.topic_id && r.date === td.date).sort((a, b) => b.id - a.id)[0];
              if (last) s.remove('reviews', last.id);
            }
            s.update('todos', id, { status: 'open', done_at: null, undo: null });
          }
        });
        const { open, total } = this.dayCounts(td.date);
        const allDone = total > 0 && open === 0;
        this.bus?.log('todo', done ? 'todo.done' : 'todo.reopened', td.title);
        if (allDone && done) this.bus?.notify('day.complete', { date: td.date });
        return { todo: s.get('todos', id), allDone, open, total };
      }

      case 'todo.remove': {
        const td = s.get('todos', payload.id);
        if (!td) return { removed: false };
        s.tx(() => {
          if (td.status === 'done' && td.undo) this.restore(td.topic_id, td.undo);
          if (td.kind === 'new') s.update('topics', (t) => t.id === td.topic_id && t.status === 'planned', { status: 'pending' });
          s.remove('todos', td.id);
        });
        this.bus?.log('todo', 'todo.removed', td.title);
        return { removed: true, todo: td };
      }

      case 'todo.reviewTopic': {
        const next = s.tx(() => this.applyReview(payload.topicId, payload.rating, payload.notes, payload.date));
        this.bus?.log('todo', 'recall.logged', `topic #${payload.topicId} rated ${payload.rating}`);
        return next;
      }

      case 'todo.rollover': {
        // Unfinished items from earlier days become "missed"; their topics go back to the queue
        // with a carry-over boost so they're planned first next time.
        const stale = s.all('todos', (td) => td.date < payload.date && td.status === 'open');
        if (!stale.length) return { rolled: 0 };
        s.tx(() => {
          for (const td of stale) {
            s.update('todos', td.id, { status: 'missed' });
            if (td.kind === 'new') s.update('topics', (t) => t.id === td.topic_id && t.status === 'planned', { status: 'pending', carryover: 1 });
          }
        });
        this.bus?.log('todo', 'todos.rolledOver', `${stale.length} unfinished item(s) carried forward`);
        return { rolled: stale.length };
      }
    }
  }
}
