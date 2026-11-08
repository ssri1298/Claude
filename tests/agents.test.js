import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../core/store.js';
import { StudyAgent } from '../core/agents/orchestrator.js';
import { classify, rankTopics, parseFrequencyCsv } from '../core/agents/yieldAgent.js';
import { planDay } from '../core/agents/plannerAgent.js';
import { review, initialSchedule } from '../core/agents/srs.js';
import { DEFAULT_SETTINGS } from '../core/settings.js';
import { createRoutes, dispatch } from '../core/routes.js';

let day = '2026-11-07';
const mk = () => {
  const db = new Store();
  const agent = new StudyAgent(db, { today: () => day, now: () => new Date(`${day}T10:00:00`) });
  return { db, agent };
};

test('yield classify maps titles to NEET SS Surgical areas', () => {
  assert.equal(classify('Carcinoma Breast - Part 1').area, 'Breast cancer — management');
  assert.equal(classify('Acute Pancreatitis').area, 'Acute pancreatitis');
  assert.equal(classify('Laparoscopic cholecystectomy').area, 'Gallstones, cholecystitis & cholangitis');
  assert.equal(classify('Incisional hernia repair').area, 'Ventral, incisional hernia & abdominal wall');
  assert.equal(classify('Random intro video').area, 'Unclassified');
});

test('rankTopics orders by exam frequency, carry-over first', () => {
  const t = (id, title, w, extra = {}) => ({ id, title, status: 'pending', order_idx: id, duration_min: 30, yield_weight: w, yield_override: null, ...extra });
  const r = rankTopics([t(1, 'A', 4), t(2, 'B', 9), t(3, 'C', 6), t(4, 'D', 3, { carryover: 1 })]);
  assert.deepEqual(r.map((x) => x.id), [4, 2, 3, 1]);
});

test('frequency CSV is scaled to 1–10', () => {
  const r = parseFrequencyCsv('topic,count\nBreast cancer,20\nBurns,10\nCleft,1');
  assert.deepEqual(r.map((x) => x.weight), [10, 5, 1]);
});

test('planDay splits time between recall and new videos', () => {
  const s = { ...DEFAULT_SETTINGS };
  const ranked = [
    { id: 1, title: 'N1', duration_min: 60, yield_weight: 9 },
    { id: 2, title: 'N2', duration_min: 40, yield_weight: 8 },
    { id: 3, title: 'N3', duration_min: 30, yield_weight: 7 },
  ];
  const due = [
    { id: 10, title: 'R1', yield_weight: 9, next_review: '2026-11-05' },
    { id: 11, title: 'R2', yield_weight: 5, next_review: '2026-11-07' },
  ];
  const p = planDay({ availableMin: 240, settings: s, ranked, due, date: '2026-11-07' });
  // 240 - 24 buffer = 216; recall budget 65 → R1 (15) + R2 (12)
  assert.equal(p.summary.effective, 216);
  assert.deepEqual(p.items.filter((i) => i.kind === 'revision').map((i) => i.topic_id), [10, 11]);
  assert.equal(p.items[0].kind, 'revision');
  // new: N1 75 + N2 50 + N3 38 = 163 ≤ 189
  assert.deepEqual(p.items.filter((i) => i.kind === 'new').map((i) => i.topic_id), [1, 2, 3]);
  assert.ok(p.summary.revisionMin + p.summary.newMin <= 216);
});

test('planDay with no revision pool gives all time to new videos', () => {
  const p = planDay({ availableMin: 60, settings: DEFAULT_SETTINGS, ranked: [{ id: 1, title: 'X', duration_min: 40, yield_weight: 5 }], due: [], date: day });
  assert.equal(p.summary.revisionMin, 0);
  assert.equal(p.items.length, 1);
});

test('SRS ladder 1 → 3 → 7 → ×ease, hard shortens, again resets', () => {
  let s = initialSchedule('2026-11-07');
  assert.equal(s.next_review, '2026-11-08');
  s = review(s, 'ok', '2026-11-08');
  assert.equal(s.interval_days, 3);
  s = review(s, 'ok', '2026-11-11');
  assert.equal(s.interval_days, 7);
  const hard = review(s, 'hard', '2026-11-18');
  const ok = review(s, 'ok', '2026-11-18');
  assert.ok(hard.interval_days < ok.interval_days);
  assert.equal(review(s, 'again', '2026-11-18').interval_days, 1);
});

test('full day flow: check-in → finalize → to-do & calendar subagents → day.complete → extend', () => {
  day = '2026-11-07';
  const { agent, db } = mk();
  agent.importTopics([
    { title: 'Acute Pancreatitis', duration_min: 50 },
    { title: 'Carcinoma Breast', duration_min: 60 },
    { title: 'Cleft lip basics', duration_min: 20 },
    { title: 'Thyroid nodule', duration_min: 30 },
  ]);
  assert.equal(agent.getToday().checkInNeeded, true);
  const { plan } = agent.startDay({ availableMin: 120, startTime: '08:00' });
  assert.equal(plan.status, 'draft');
  assert.ok(plan.items.length >= 1);
  assert.equal(plan.items[0].title, 'Carcinoma Breast'); // highest yield first

  const fin = agent.finalizePlan();
  assert.equal(fin.todos.length, plan.items.length);
  assert.equal(fin.events.filter((e) => e.kind !== 'break')[0].start, '08:00');
  assert.throws(() => agent.finalizePlan(), /already finalized/);

  let last;
  for (const td of fin.todos) last = agent.completeTask(td.id, { done: true });
  assert.equal(last.allDone, true);
  const log = agent.agentLog().map((l) => l.event);
  assert.ok(log.includes('day.complete'));
  assert.ok(log.includes('todos.created') && log.includes('day.scheduled'));
  assert.ok(db.count('calendar_events', (e) => e.status === 'done') >= 1);

  const ext = agent.extendDay({ mode: 'new', minutes: 60 });
  assert.ok(ext.added >= 1);
  assert.equal(agent.getToday().allDone, false);

  // Next day: completed topics are due for recall; unfinished extension rolls over with carry-over
  day = '2026-11-08';
  const t2 = agent.getToday();
  assert.equal(t2.checkInNeeded, true);
  assert.ok(db.count('todos', (t) => t.status === 'missed') >= 1);
  assert.equal(db.count('topics', (t) => t.carryover === 1), ext.added);
  const p2 = agent.startDay({ availableMin: 180 }).plan;
  assert.ok(p2.items.some((i) => i.kind === 'revision'));
  assert.ok(p2.items.filter((i) => i.kind === 'new').length >= 1);
});

test('untick restores SRS state; pomodoro minutes replace planned minutes in stats', () => {
  day = '2026-11-07';
  const { agent, db } = mk();
  agent.importTopics([{ title: 'Burns', duration_min: 40 }]);
  agent.startDay({ availableMin: 90 });
  const [td] = agent.finalizePlan().todos;
  agent.completeTask(td.id, { done: true });
  assert.equal(db.all('topics')[0].status, 'done');
  agent.completeTask(td.id, { done: false });
  assert.equal(db.all('topics')[0].status, 'planned');
  agent.completeTask(td.id, { done: true });
  assert.equal(agent.stats(7).today.studied, td.minutes);
  agent.logSession({ minutes: 25, todoId: td.id, startTs: `${day}T10:00:00` });
  const s = agent.stats(7);
  assert.equal(s.today.studied, 25);
  assert.equal(s.totals.streak, 1);
  assert.equal(agent.calendarDay(day).events.filter((e) => e.kind === 'pomodoro').length, 1);
});

test('low-yield topics are only suggested, never auto-skipped', () => {
  const { agent } = mk();
  agent.importTopics([{ title: 'Gynaecomastia overview', duration_min: 15 }, { title: 'Acute pancreatitis', duration_min: 30 }]);
  agent.store.update('topics', (t) => t.title.startsWith('Gyn'), { yield_override: 2 });
  const n = agent.studyNext();
  assert.equal(n.suggestedSkips.length, 1);
  assert.equal(n.suggestedSkips[0].status, 'pending');
  assert.equal(n.ranked.length, 1);
});

test('routes: dispatch, errors, export/import round-trip, legacy backup import', () => {
  const { agent, db } = mk();
  const routes = createRoutes(agent);
  const call = (m, u, b) => dispatch(routes, m, u, b);
  call('POST', '/api/topics/bulk', { topics: [{ title: 'Burns', duration_min: 30 }, { title: 'Hernia', duration_min: 20 }] });
  assert.equal(call('GET', '/api/topics').length, 2);
  assert.throws(() => call('GET', '/api/nope'), /No route/);
  assert.throws(() => call('POST', '/api/day/start', { availableMin: 5 }), (e) => e.status === 400);
  const t = call('PATCH', '/api/topics/1', { yield_override: 9 });
  assert.equal(t.weight, 9);
  call('PUT', '/api/settings', { revisionShare: 0.4, bogus: 1 });
  const backup = JSON.parse(JSON.stringify(call('GET', '/api/export')));
  call('DELETE', '/api/topics/1');
  assert.equal(call('GET', '/api/topics').length, 1);
  call('POST', '/api/import', backup);
  assert.equal(call('GET', '/api/topics').length, 2);
  assert.equal(call('GET', '/api/settings').revisionShare, 0.4);
  // ids keep increasing after a restore
  call('POST', '/api/topics/bulk', { topics: [{ title: 'Spleen', duration_min: 10 }] });
  assert.equal(Math.max(...call('GET', '/api/topics').map((x) => x.id)), 3);
  // SQLite-era export format
  call('POST', '/api/import', { topics: [{ id: 7, title: 'Old', duration_min: 5, status: 'pending', order_idx: 0, yield_weight: 6 }], settings: [{ key: 'recallMinutes', value: '15' }] });
  assert.equal(call('GET', '/api/topics')[0].title, 'Old');
  assert.equal(call('GET', '/api/settings').recallMinutes, 15);
  assert.throws(() => call('POST', '/api/import', { foo: 1 }), /not a Scalpel backup/);
});

test('store transactions roll back on error', () => {
  const s = new Store();
  s.insert('topics', { title: 'A' });
  assert.throws(() => s.tx(() => { s.insert('topics', { title: 'B' }); throw new Error('boom'); }));
  assert.equal(s.count('topics'), 1);
  assert.equal(s.insert('topics', { title: 'C' }), 2);
});

test('import: already-watched videos go to revision, duplicates are skipped, section helps classify', () => {
  day = '2026-11-07';
  const { agent, db } = mk();
  const r1 = agent.importTopics([
    { title: 'Benign Pancreatic Conditions', duration_min: 84, status: 'done', section: 'Gastrointestinal' },
    { title: 'GIT Part I', duration_min: 35, section: 'Recent Updates - Bailey 28th Edition' },
    { title: 'Spleen', duration_min: 39 },
  ]);
  assert.equal(r1.ids.length, 3);
  const [pan, git] = db.all('topics');
  assert.equal(pan.status, 'done');
  assert.equal(pan.next_review, '2026-11-08');
  assert.equal(git.yield_area, 'Textbook updates & important tables');
  assert.equal(git.section, 'Recent Updates - Bailey 28th Edition');
  const r2 = agent.importTopics([{ title: 'spleen', duration_min: 39 }, { title: 'Hernia I', duration_min: 85 }]);
  assert.deepEqual(r2.skipped, ['spleen']);
  assert.equal(r2.ids.length, 1);
  day = '2026-11-08';
  assert.equal(agent.revisionQueue().filter((t) => t.due).length, 1);
});

test('yield model: calibrated weights stay 1–10 and every area records its evidence', async () => {
  const { default: T } = await import('../core/data/neetss-surgical.js');
  for (const a of T.areas) {
    assert.ok(Number.isInteger(a.weight) && a.weight >= 1 && a.weight <= 10, a.area);
    assert.ok(typeof a.evidence === 'string' && a.evidence.length > 10, a.area);
    assert.ok(['high', 'medium', 'low'].includes(a.confidence), a.area);
  }
  assert.ok(T.calibrated.sources.length >= 3);
});

test('calibrate() is deterministic and blends evidence with the prior', async () => {
  const { calibrate } = await import('../scripts/calibrate-yield.js');
  const table = { areas: [
    { area: 'A', weight: 5, keywords: [] },
    { area: 'B', weight: 9, keywords: [] },
    { area: 'C', weight: 6, keywords: [] },
    { area: 'U', weight: 8, keywords: [], priority: true },
  ] };
  const ev = { checked: 'x', method: 'm', sources: [], recallTotals: { 2022: 150, 2023: 150 }, recall: { A: { 2022: 10, 2023: 10 }, B: { 2022: 0, 2023: 1 } }, mentions: { C: ['s1', 's2'] } };
  const out = calibrate(table, ev);
  const w = Object.fromEntries(out.areas.map((a) => [a.area, a.weight]));
  assert.equal(w.A, 8); // evidence 10 · 0.6 + prior 5 · 0.4
  assert.equal(w.B, 6); // ≈4.5 · 0.6 + 9 · 0.4 = 6.3
  assert.equal(w.C, 4); // never asked, but 2 sources → 3 · 0.6 + 6 · 0.4 = 4.2
  assert.equal(w.U, 8); // priority area untouched
  assert.deepEqual(calibrate(out, ev).areas.map((a) => a.weight), out.areas.map((a) => a.weight)); // re-run uses prior_weight
});

test('rescore updates model weights but keeps manual overrides', () => {
  const { agent, db } = mk();
  const routes = createRoutes(agent);
  agent.importTopics([{ title: 'Tetralogy of Fallot', duration_min: 30 }, { title: 'Breast: I', duration_min: 50 }]);
  db.update('topics', (t) => t.title === 'Tetralogy of Fallot', { yield_weight: 1, yield_area: 'Old area' });
  db.update('topics', (t) => t.title === 'Breast: I', { yield_override: 3 });
  const r = dispatch(routes, 'POST', '/api/yield/rescore');
  assert.equal(r.changed, 1);
  const [tof, br] = db.all('topics');
  assert.equal(tof.yield_area, 'Congenital heart disease');
  assert.equal(br.yield_override, 3);
  assert.equal(dispatch(routes, 'GET', '/api/settings').yieldModelSeen, r.version);
});
