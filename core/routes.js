// Framework-agnostic API routes. The local Node server mounts them under /api; the website
// version calls dispatch() directly in the browser. Both share exactly the same behaviour.
import { HttpError } from './agents/orchestrator.js';
import { getSettings, saveSettings } from './settings.js';

const weightOf = (t) => ({ ...t, weight: t.yield_override ?? t.yield_weight });

export function createRoutes(agent) {
  const s = agent.store;
  const id = (p) => Number(p.id);
  const R = [];
  const on = (method, path, fn) => {
    const keys = [];
    const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
    R.push({ method, re, keys, fn });
  };

  // ── Today / planner ──
  on('GET', '/today', () => agent.getToday());
  on('POST', '/day/start', ({ body }) => agent.startDay(body));
  on('PUT', '/plan/items', ({ body }) => agent.updatePlanItems(body.items || []));
  on('GET', '/plan/item-cost', ({ query }) => agent.itemFor(Number(query.topicId), query.kind || 'new'));
  on('POST', '/plan/finalize', () => agent.finalizePlan());
  on('POST', '/day/reset', () => agent.resetDay());
  on('POST', '/day/extend', ({ body }) => agent.extendDay(body));
  on('POST', '/day/add-topic', ({ body }) => agent.addTopicToday(body));

  // ── To-dos (To-do subagent) ──
  on('POST', '/todos/:id/toggle', ({ params, body }) => agent.completeTask(id(params), body));
  on('DELETE', '/todos/:id', ({ params }) => agent.removeTodo(id(params)));

  // ── Topics ──
  on('GET', '/topics', () => s.all('topics').sort((a, b) => a.order_idx - b.order_idx || a.id - b.id).map(weightOf));
  on('POST', '/topics/bulk', ({ body }) => agent.importTopics(body.topics || []));
  on('PATCH', '/topics/:id', ({ params, body }) => {
    const allowed = ['title', 'subject', 'duration_min', 'yield_override', 'skip_dismissed', 'order_idx'];
    const patch = Object.fromEntries(Object.entries(body || {}).filter(([k]) => allowed.includes(k)));
    if (!Object.keys(patch).length) throw new HttpError(400, 'Nothing to update');
    if (!s.update('topics', id(params), patch)) throw new HttpError(404, 'Topic not found');
    return weightOf(s.get('topics', id(params)));
  });
  on('DELETE', '/topics/:id', ({ params }) => {
    const tid = id(params);
    s.tx(() => {
      for (const td of s.all('todos', (td) => td.topic_id === tid)) agent.removeTodo(td.id);
      s.remove('calendar_events', (e) => e.topic_id === tid);
      s.remove('plan_items', (pi) => pi.topic_id === tid);
      s.remove('reviews', (r) => r.topic_id === tid);
      s.remove('study_sessions', (x) => x.topic_id === tid);
      s.remove('topics', tid);
    });
  });
  on('POST', '/topics/:id/skip', ({ params }) => {
    // Only called after the student explicitly approves a skip suggestion.
    const t = s.get('topics', id(params));
    if (!t) throw new HttpError(404, 'Topic not found');
    s.update('topics', t.id, { status: 'skipped' });
    agent.bus.log('orchestrator', 'topic.skipped', `"${t.title}" skipped with your approval`);
  });
  on('POST', '/topics/:id/keep', ({ params }) => {
    s.update('topics', id(params), { skip_dismissed: 1 });
  });
  on('POST', '/topics/:id/restore', ({ params }) => {
    s.update('topics', (t) => t.id === id(params) && t.status === 'skipped', { status: 'pending', skip_dismissed: 1 });
  });

  // ── Study next / yield ──
  on('GET', '/study-next', () => agent.studyNext());
  on('GET', '/yield/table', () => agent.bus.request('yield.table'));
  on('POST', '/yield/csv', ({ body }) => agent.bus.request('yield.importCsv', { csv: body.csv || '' }));

  // ── Revision ──
  on('GET', '/revision', () => agent.revisionQueue());
  on('POST', '/reviews', ({ body }) => agent.reviewTopic(body));

  // ── Calendar (Calendar subagent) & sessions ──
  on('GET', '/calendar/month/:month', ({ params }) => agent.calendarMonth(params.month));
  on('GET', '/calendar/day/:date', ({ params }) => agent.calendarDay(params.date));
  on('POST', '/sessions', ({ body }) => agent.logSession(body));

  // ── Dashboard ──
  on('GET', '/stats', ({ query }) => agent.stats(Math.min(90, Math.max(7, Number(query.days) || 14))));
  on('GET', '/agent-log', () => agent.agentLog());

  // ── Settings & data ──
  on('GET', '/settings', () => getSettings(s));
  on('PUT', '/settings', ({ body }) => saveSettings(s, body));
  on('GET', '/export', () => s.toJSON());
  on('POST', '/import', ({ body }) => {
    if (!body || !(body.version === 2 ? Array.isArray(body.tables?.topics) : Array.isArray(body.topics))) throw new HttpError(400, 'That file is not a Scalpel backup');
    s.load(body);
    agent.rolledFor = null;
  });

  return R;
}

/** Route a request. Returns the handler's result (or {ok:true}); throws HttpError. */
export function dispatch(routes, method, url, body) {
  const u = new URL(url, 'http://x');
  const path = u.pathname.replace(/^\/api/, '');
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = path.match(r.re);
    if (!m) continue;
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    const out = r.fn({ params, query: Object.fromEntries(u.searchParams), body: body ?? {} });
    return out ?? { ok: true };
  }
  throw new HttpError(404, `No route for ${method} ${path}`);
}

/** Create an engine instance: store + orchestrator + routes. */
export { HttpError };
