// The website build runs the engine in the browser; the local app talks to its Node server.
export const IS_WEB = import.meta.env.VITE_TARGET === 'web';

async function req(method, url, body) {
  if (IS_WEB) {
    const { call } = await import('./web/backend.js');
    return call(method, url, body);
  }
  const res = await fetch(`/api${url}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  today: () => req('GET', '/today'),
  startDay: (availableMin, startTime, replan = false) => req('POST', '/day/start', { availableMin, startTime, replan }),
  updatePlan: (items) => req('PUT', '/plan/items', { items }),
  itemCost: (topicId, kind) => req('GET', `/plan/item-cost?topicId=${topicId}&kind=${kind}`),
  finalize: () => req('POST', '/plan/finalize'),
  resetDay: () => req('POST', '/day/reset'),
  extendDay: (mode, minutes) => req('POST', '/day/extend', { mode, minutes }),
  addTopicToday: (topicId, kind = 'new') => req('POST', '/day/add-topic', { topicId, kind }),
  toggleTodo: (id, done, extra = {}) => req('POST', `/todos/${id}/toggle`, { done, ...extra }),
  removeTodo: (id) => req('DELETE', `/todos/${id}`),
  topics: () => req('GET', '/topics'),
  importTopics: (topics) => req('POST', '/topics/bulk', { topics }),
  patchTopic: (id, patch) => req('PATCH', `/topics/${id}`, patch),
  deleteTopic: (id) => req('DELETE', `/topics/${id}`),
  skipTopic: (id) => req('POST', `/topics/${id}/skip`),
  keepTopic: (id) => req('POST', `/topics/${id}/keep`),
  restoreTopic: (id) => req('POST', `/topics/${id}/restore`),
  studyNext: () => req('GET', '/study-next'),
  yieldTable: () => req('GET', '/yield/table'),
  yieldCsv: (csv) => req('POST', '/yield/csv', { csv }),
  revision: () => req('GET', '/revision'),
  review: (topicId, rating, notes) => req('POST', '/reviews', { topicId, rating, notes }),
  month: (m) => req('GET', `/calendar/month/${m}`),
  day: (d) => req('GET', `/calendar/day/${d}`),
  logSession: (s) => req('POST', '/sessions', s),
  stats: (days = 14) => req('GET', `/stats?days=${days}`),
  agentLog: () => req('GET', '/agent-log'),
  settings: () => req('GET', '/settings'),
  saveSettings: (s) => req('PUT', '/settings', s),
  exportData: () => req('GET', '/export'),
  importData: (d) => req('POST', '/import', d),
};
