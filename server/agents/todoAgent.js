import { initialSchedule, review } from './srs.js';
import { tx } from '../db.js';

const SRS_COLS = ['status', 'ease', 'interval_days', 'repetitions', 'next_review', 'last_reviewed', 'completed_at', 'carryover'];

/**
 * To-do subagent — owns the `todos` table.
 * Turns finalized plan items into a tickable checklist, records completions (which feed the
 * spaced-repetition schedule), and announces "day.complete" when every item is ticked off.
 */
export class TodoAgent {
  name = 'todo';
  handles = ['todo.createFromPlan', 'todo.toggle', 'todo.list', 'todo.rollover', 'todo.reviewTopic', 'todo.remove'];
  constructor(db) {
    this.db = db;
  }

  list(date) {
    return this.db
      .prepare(
        `SELECT td.*, t.subject, t.yield_area, t.duration_min, COALESCE(t.yield_override, t.yield_weight) AS weight
         FROM todos td LEFT JOIN topics t ON t.id = td.topic_id
         WHERE td.date = ? ORDER BY td.position, td.id`,
      )
      .all(date);
  }

  snapshot(topicId) {
    const t = this.db.prepare(`SELECT ${SRS_COLS.join(',')} FROM topics WHERE id = ?`).get(topicId);
    return t ? JSON.stringify(t) : null;
  }

  restore(topicId, snap) {
    const s = JSON.parse(snap);
    this.db.prepare(`UPDATE topics SET ${SRS_COLS.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...SRS_COLS.map((c) => s[c]), topicId);
  }

  applyReview(topicId, rating, notes, date) {
    const t = this.db.prepare('SELECT * FROM topics WHERE id = ?').get(topicId);
    const next = review(t, rating, date);
    this.db
      .prepare('UPDATE topics SET ease = ?, interval_days = ?, repetitions = ?, next_review = ?, last_reviewed = ? WHERE id = ?')
      .run(next.ease, next.interval_days, next.repetitions, next.next_review, date, topicId);
    this.db.prepare('INSERT INTO reviews(topic_id, date, rating, notes) VALUES (?, ?, ?, ?)').run(topicId, date, rating, notes ?? null);
    return next;
  }

  handle({ type, payload }) {
    switch (type) {
      case 'todo.list':
        return this.list(payload.date);

      case 'todo.createFromPlan': {
        const { date, items } = payload;
        const maxPos = this.db.prepare('SELECT COALESCE(MAX(position), -1) AS p FROM todos WHERE date = ?').get(date).p;
        const ins = this.db.prepare('INSERT INTO todos(date, plan_item_id, topic_id, kind, title, minutes, position) VALUES (?, ?, ?, ?, ?, ?, ?)');
        const created = tx(this.db, () =>
          items.map((it, i) => {
            const r = ins.run(date, it.id ?? null, it.topic_id, it.kind, it.title, it.minutes, maxPos + 1 + i);
            if (it.kind === 'new') this.db.prepare("UPDATE topics SET status = 'planned', carryover = 0 WHERE id = ? AND status = 'pending'").run(it.topic_id);
            return Number(r.lastInsertRowid);
          }),
        );
        this.bus?.log('todo', 'todos.created', `${created.length} to-dos for ${date}`);
        return this.db.prepare(`SELECT * FROM todos WHERE id IN (${created.map(() => '?').join(',') || 'NULL'}) ORDER BY position`).all(...created);
      }

      case 'todo.toggle': {
        const { id, done, rating = 'ok', notes } = payload;
        const td = this.db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
        if (!td) throw new Error('To-do not found');
        tx(this.db, () => {
          if (done && td.status !== 'done') {
            const snap = this.snapshot(td.topic_id);
            if (td.kind === 'new') {
              const s = initialSchedule(td.date);
              this.db
                .prepare("UPDATE topics SET status = 'done', completed_at = ?, ease = ?, interval_days = ?, repetitions = ?, next_review = ?, carryover = 0 WHERE id = ?")
                .run(td.date, s.ease, s.interval_days, s.repetitions, s.next_review, td.topic_id);
            } else {
              this.applyReview(td.topic_id, rating, notes, td.date);
            }
            this.db.prepare("UPDATE todos SET status = 'done', done_at = datetime('now','localtime'), undo = ? WHERE id = ?").run(snap, id);
          } else if (!done && td.status === 'done') {
            if (td.undo) this.restore(td.topic_id, td.undo);
            if (td.kind === 'revision') {
              const last = this.db.prepare('SELECT id FROM reviews WHERE topic_id = ? AND date = ? ORDER BY id DESC LIMIT 1').get(td.topic_id, td.date);
              if (last) this.db.prepare('DELETE FROM reviews WHERE id = ?').run(last.id);
            }
            this.db.prepare("UPDATE todos SET status = 'open', done_at = NULL, undo = NULL WHERE id = ?").run(id);
          }
        });
        const open = this.db.prepare("SELECT COUNT(*) AS n FROM todos WHERE date = ? AND status = 'open'").get(td.date).n;
        const total = this.db.prepare('SELECT COUNT(*) AS n FROM todos WHERE date = ?').get(td.date).n;
        const allDone = total > 0 && open === 0;
        this.bus?.log('todo', done ? 'todo.done' : 'todo.reopened', td.title);
        if (allDone && done) this.bus?.notify('day.complete', { date: td.date });
        return { todo: this.db.prepare('SELECT * FROM todos WHERE id = ?').get(id), allDone, open, total };
      }

      case 'todo.remove': {
        const td = this.db.prepare('SELECT * FROM todos WHERE id = ?').get(payload.id);
        if (!td) return { removed: false };
        if (td.status === 'done' && td.undo) this.restore(td.topic_id, td.undo);
        if (td.kind === 'new') this.db.prepare("UPDATE topics SET status = 'pending' WHERE id = ? AND status = 'planned'").run(td.topic_id);
        this.db.prepare('DELETE FROM todos WHERE id = ?').run(td.id);
        this.bus?.log('todo', 'todo.removed', td.title);
        return { removed: true, todo: td };
      }

      case 'todo.reviewTopic': {
        const next = this.applyReview(payload.topicId, payload.rating, payload.notes, payload.date);
        this.bus?.log('todo', 'recall.logged', `topic #${payload.topicId} rated ${payload.rating}`);
        return next;
      }

      case 'todo.rollover': {
        // Unfinished items from earlier days become "missed"; their topics go back to the queue
        // with a carry-over boost so they're planned first next time.
        const stale = this.db.prepare("SELECT * FROM todos WHERE date < ? AND status = 'open'").all(payload.date);
        tx(this.db, () => {
          for (const td of stale) {
            this.db.prepare("UPDATE todos SET status = 'missed' WHERE id = ?").run(td.id);
            if (td.kind === 'new') this.db.prepare("UPDATE topics SET status = 'pending', carryover = 1 WHERE id = ? AND status = 'planned'").run(td.topic_id);
          }
        });
        if (stale.length) this.bus?.log('todo', 'todos.rolledOver', `${stale.length} unfinished item(s) carried forward`);
        return { rolled: stale.length };
      }
    }
  }
}
