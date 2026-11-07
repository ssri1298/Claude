import { effectiveWeight, rankTopics } from './yieldAgent.js';
import { diffDays } from '../dates.js';

export const studyCost = (t, multiplier) => Math.max(5, Math.ceil((t.duration_min || 0) * multiplier));
export const recallCost = (t, base) => base + (effectiveWeight(t) >= 8 ? 3 : 0);

/**
 * Pure planning function.
 *  - Reserves a break buffer.
 *  - Gives `revisionShare` of the remaining time to active recall of due topics (most overdue first).
 *  - Fills the rest greedily with the highest-ranked new videos that fit.
 *  - Unused revision time flows to new topics and vice-versa.
 */
export function planDay({ availableMin, settings, ranked, due, date }) {
  const notes = [];
  const buffer = Math.round(availableMin * settings.breakBufferPct);
  const effective = Math.max(0, availableMin - buffer);
  const dueSorted = [...due].sort(
    (a, b) => diffDays(date, b.next_review) - diffDays(date, a.next_review) || effectiveWeight(b) - effectiveWeight(a),
  );
  const items = [];

  // 1. Active recall
  const revBudget = dueSorted.length ? Math.round(effective * settings.revisionShare) : 0;
  let revUsed = 0;
  const usedRev = new Set();
  for (const t of dueSorted) {
    const m = recallCost(t, settings.recallMinutes);
    if (revUsed + m > revBudget) continue;
    items.push({ topic_id: t.id, kind: 'revision', minutes: m, title: t.title });
    usedRev.add(t.id);
    revUsed += m;
  }

  // 2. New videos
  const newBudget = effective - revUsed;
  let newUsed = 0;
  for (const t of ranked) {
    const m = studyCost(t, settings.durationMultiplier);
    if (newUsed + m > newBudget) continue;
    items.push({ topic_id: t.id, kind: 'new', minutes: m, title: t.title });
    newUsed += m;
  }
  if (ranked.length && !items.some((i) => i.kind === 'new')) {
    notes.push(`Next topic "${ranked[0].title}" needs ~${studyCost(ranked[0], settings.durationMultiplier)} min — more than today's free time. Consider splitting it.`);
  }
  if (!ranked.length) notes.push('No pending new topics — import more screenshots or continue revision.');

  // 3. Leftover time → extra recall
  let spare = effective - revUsed - newUsed;
  for (const t of dueSorted) {
    if (usedRev.has(t.id)) continue;
    const m = recallCost(t, settings.recallMinutes);
    if (m > spare) continue;
    items.push({ topic_id: t.id, kind: 'revision', minutes: m, title: t.title });
    usedRev.add(t.id);
    revUsed += m;
    spare -= m;
  }

  const ordered = [...items.filter((i) => i.kind === 'revision'), ...items.filter((i) => i.kind === 'new')];
  return {
    items: ordered.map((i, position) => ({ ...i, position })),
    summary: {
      available: availableMin,
      buffer,
      effective,
      revisionMin: revUsed,
      newMin: newUsed,
      freeMin: effective - revUsed - newUsed,
      dueCount: dueSorted.length,
      notes,
    },
  };
}

export class PlannerAgent {
  name = 'planner';
  handles = ['planner.draft', 'planner.extend', 'planner.due'];
  constructor(store) {
    this.store = store;
  }

  due(date, exclude = new Set()) {
    return this.store.all('topics', (t) => t.status === 'done' && t.next_review != null && t.next_review <= date && !exclude.has(t.id));
  }

  handle({ type, payload }) {
    const { date, settings } = payload;
    switch (type) {
      case 'planner.due':
        return this.due(date);
      case 'planner.draft': {
        const topics = this.store.all('topics');
        const th = settings.lowYieldThreshold;
        const ranked = rankTopics(topics).filter((t) => !(t.weight <= th && !t.skip_dismissed));
        const plan = planDay({ availableMin: payload.availableMin, settings, ranked, due: this.due(date), date });
        this.bus?.log('planner', 'plan.drafted', `${plan.items.length} items · ${plan.summary.newMin}m new · ${plan.summary.revisionMin}m recall`);
        return plan;
      }
      case 'planner.extend': {
        // Extra block after the day's list is finished: either more new topics or more recall.
        const inToday = new Set(this.store.all('todos', (r) => r.date === date).map((r) => r.topic_id));
        const minutes = payload.minutes;
        if (payload.mode === 'new') {
          const topics = this.store.all('topics');
          const th = settings.lowYieldThreshold;
          const ranked = rankTopics(topics).filter((t) => !inToday.has(t.id) && !(t.weight <= th && !t.skip_dismissed));
          const plan = planDay({
            availableMin: minutes,
            settings: { ...settings, revisionShare: 0, breakBufferPct: 0 },
            ranked,
            due: [],
            date,
          });
          this.bus?.log('planner', 'plan.extended', `+${plan.items.length} new topics`);
          return plan;
        }
        // Revision: due topics first, then the weakest/least-recently reviewed done topics.
        let pool = this.due(date, inToday);
        if (!pool.length) {
          pool = this.store
            .all('topics', (t) => t.status === 'done' && !inToday.has(t.id))
            .sort((a, b) => a.ease - b.ease || String(a.last_reviewed ?? a.completed_at ?? '').localeCompare(String(b.last_reviewed ?? b.completed_at ?? '')))
            .map((t) => ({ ...t, next_review: date }));
        }
        const plan = planDay({
          availableMin: minutes,
          settings: { ...settings, revisionShare: 1, breakBufferPct: 0 },
          ranked: [],
          due: pool,
          date,
        });
        plan.items = plan.items.filter((i) => i.kind === 'revision');
        plan.summary.notes = pool.length ? [] : ['Nothing to revise yet — finish some topics first.'];
        this.bus?.log('planner', 'plan.extended', `+${plan.items.length} recall blocks`);
        return plan;
      }
    }
  }
}
