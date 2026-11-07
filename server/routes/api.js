import { Router } from 'express';
import { HttpError } from '../agents/orchestrator.js';
import { getSettings, saveSettings, tx } from '../db.js';

const TABLES = ['topics', 'reviews', 'plans', 'plan_items', 'todos', 'calendar_events', 'study_sessions', 'settings'];

export function apiRouter(agent) {
  const db = agent.db;
  const r = Router();
  const h = (fn) => (req, res, next) => {
    try {
      const out = fn(req, res);
      res.json(out ?? { ok: true });
    } catch (e) {
      next(e);
    }
  };
  const id = (req) => Number(req.params.id);

  // ── Today / planner ──
  r.get('/today', h(() => agent.getToday()));
  r.post('/day/start', h((req) => agent.startDay(req.body)));
  r.put('/plan/items', h((req) => agent.updatePlanItems(req.body.items || [])));
  r.get('/plan/item-cost', h((req) => agent.itemFor(Number(req.query.topicId), req.query.kind || 'new')));
  r.post('/plan/finalize', h(() => agent.finalizePlan()));
  r.post('/day/reset', h(() => agent.resetDay()));
  r.post('/day/extend', h((req) => agent.extendDay(req.body)));
  r.post('/day/add-topic', h((req) => agent.addTopicToday(req.body)));

  // ── To-dos (To-do subagent) ──
  r.post('/todos/:id/toggle', h((req) => agent.completeTask(id(req), req.body)));
  r.delete('/todos/:id', h((req) => agent.removeTodo(id(req))));

  // ── Topics ──
  r.get('/topics', h(() => db.prepare('SELECT *, COALESCE(yield_override, yield_weight) AS weight FROM topics ORDER BY order_idx, id').all()));
  r.post('/topics/bulk', h((req) => ({ ids: agent.importTopics(req.body.topics || []) })));
  r.patch('/topics/:id', h((req) => {
    const allowed = ['title', 'subject', 'duration_min', 'yield_override', 'skip_dismissed', 'order_idx'];
    const patch = Object.entries(req.body).filter(([k]) => allowed.includes(k));
    if (!patch.length) throw new HttpError(400, 'Nothing to update');
    db.prepare(`UPDATE topics SET ${patch.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...patch.map(([, v]) => v), id(req));
    return db.prepare('SELECT *, COALESCE(yield_override, yield_weight) AS weight FROM topics WHERE id = ?').get(id(req));
  }));
  r.delete('/topics/:id', h((req) => {
    db.prepare('DELETE FROM calendar_events WHERE topic_id = ?').run(id(req));
    db.prepare('DELETE FROM topics WHERE id = ?').run(id(req));
  }));
  r.post('/topics/:id/skip', h((req) => {
    // Only called after the student explicitly approves a skip suggestion.
    const t = db.prepare('SELECT * FROM topics WHERE id = ?').get(id(req));
    if (!t) throw new HttpError(404, 'Topic not found');
    db.prepare("UPDATE topics SET status = 'skipped' WHERE id = ?").run(t.id);
    agent.bus.log('orchestrator', 'topic.skipped', `"${t.title}" skipped with your approval`);
  }));
  r.post('/topics/:id/keep', h((req) => {
    db.prepare('UPDATE topics SET skip_dismissed = 1 WHERE id = ?').run(id(req));
  }));
  r.post('/topics/:id/restore', h((req) => {
    db.prepare("UPDATE topics SET status = 'pending', skip_dismissed = 1 WHERE id = ? AND status = 'skipped'").run(id(req));
  }));

  // ── Study next / yield ──
  r.get('/study-next', h(() => agent.studyNext()));
  r.get('/yield/table', h(() => agent.bus.request('yield.table')));
  r.post('/yield/csv', h((req) => agent.bus.request('yield.importCsv', { csv: req.body.csv || '' })));

  // ── Revision ──
  r.get('/revision', h(() => agent.revisionQueue()));
  r.post('/reviews', h((req) => agent.reviewTopic(req.body)));

  // ── Calendar (Calendar subagent) & sessions ──
  r.get('/calendar/month/:month', h((req) => agent.calendarMonth(req.params.month)));
  r.get('/calendar/day/:date', h((req) => agent.calendarDay(req.params.date)));
  r.post('/sessions', h((req) => agent.logSession(req.body)));

  // ── Dashboard ──
  r.get('/stats', h((req) => agent.stats(Math.min(90, Math.max(7, Number(req.query.days) || 14)))));
  r.get('/agent-log', h(() => agent.agentLog()));

  // ── Settings & data ──
  r.get('/settings', h(() => getSettings(db)));
  r.put('/settings', h((req) => saveSettings(db, req.body)));
  r.get('/export', h(() => Object.fromEntries(TABLES.map((t) => [t, db.prepare(`SELECT * FROM ${t}`).all()]))));
  r.post('/import', h((req) => {
    const data = req.body;
    if (!data || !Array.isArray(data.topics)) throw new HttpError(400, 'Not a Scalpel export file');
    tx(db, () => {
      for (const t of [...TABLES].reverse()) db.prepare(`DELETE FROM ${t}`).run();
      for (const t of TABLES) {
        for (const row of data[t] || []) {
          const cols = Object.keys(row);
          if (!cols.length) continue;
          db.prepare(`INSERT INTO ${t}(${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map((c) => row[c]));
        }
      }
    });
    agent.rolledFor = null;
  }));

  r.use((err, req, res, _next) => {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: err.message || 'Server error' });
  });
  return r;
}
