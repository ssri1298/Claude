import { addDays } from '../dates.js';

export const RATINGS = { again: 2, hard: 3, ok: 4, easy: 5 };

/** First exposure (video watched): review tomorrow. */
export function initialSchedule(date) {
  return { ease: 2.5, interval_days: 1, repetitions: 0, next_review: addDays(date, 1) };
}

/**
 * SM-2 style update with a fixed early ladder (1 → 3 → 7 → then interval × ease).
 * "hard" shortens the interval, "again" resets to tomorrow.
 */
export function review(state, rating, date) {
  const q = RATINGS[rating] ?? RATINGS.ok;
  let { ease = 2.5, interval_days = 1, repetitions = 0 } = state;
  if (q < 3) {
    repetitions = 0;
    interval_days = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) interval_days = 3;
    else if (repetitions === 2) interval_days = 7;
    else interval_days = Math.round(interval_days * ease);
    if (q === 3) interval_days = Math.max(1, Math.round(interval_days * 0.6));
    if (q === 5) interval_days = Math.round(interval_days * 1.3);
  }
  ease = Math.max(1.3, Math.round((ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)) * 100) / 100);
  interval_days = Math.min(interval_days, 120);
  return { ease, interval_days, repetitions, next_review: addDays(date, interval_days) };
}
