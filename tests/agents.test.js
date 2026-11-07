import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { StudyAgent } from '../server/agents/orchestrator.js';
import { classify, rankTopics, parseFrequencyCsv } from '../server/agents/yieldAgent.js';
import { planDay } from '../server/agents/plannerAgent.js';
import { review, initialSchedule } from '../server/agents/srs.js';
import { DEFAULT_SETTINGS } from '../server/db.js';

let day = '2026-11-07';
const mk = () => {
  const db = openDb(':memory:');
  const agent = new StudyAgent(db, { today: () => day, now: () => new Date(`${day}T10:00:00`) });
  return { db, agent };
};

test('yield classify maps titles to NEET SS Surgical areas', () => {
  assert.equal(classify('Carcinoma Breast - Part 1').area, 'Breast cancer — management');
  assert.equal(classify('Acute Pancreatitis').weight, 9);
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
  assert.ok(db.prepare("SELECT COUNT(*) n FROM calendar_events WHERE status='done'").get().n >= 1);

  const ext = agent.extendDay({ mode: 'new', minutes: 60 });
  assert.ok(ext.added >= 1);
  assert.equal(agent.getToday().allDone, false);

  // Next day: completed topics are due for recall; unfinished extension rolls over with carry-over
  day = '2026-11-08';
  const t2 = agent.getToday();
  assert.equal(t2.checkInNeeded, true);
  assert.ok(db.prepare("SELECT COUNT(*) n FROM todos WHERE status='missed'").get().n >= 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM topics WHERE carryover = 1').get().n, ext.added);
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
  assert.equal(db.prepare('SELECT status FROM topics').get().status, 'done');
  agent.completeTask(td.id, { done: false });
  assert.equal(db.prepare('SELECT status FROM topics').get().status, 'planned');
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
  agent.db.prepare("UPDATE topics SET yield_override = 2 WHERE title LIKE 'Gyn%'").run();
  const n = agent.studyNext();
  assert.equal(n.suggestedSkips.length, 1);
  assert.equal(n.suggestedSkips[0].status, 'pending');
  assert.equal(n.ranked.length, 1);
});
