import test from 'node:test';
import assert from 'node:assert/strict';
import { examCountdown } from '../src/lib/countdown.js';

test('more than 90 days shows whole calendar months', () => {
  const c = examCountdown('2026-11-08', '2027-03-15');
  assert.equal(c.days, 127);
  assert.deepEqual([c.value, c.unit], [4, 'months']);
  assert.equal(examCountdown('2026-11-08', '2027-02-07').days, 91);
  assert.equal(examCountdown('2026-11-08', '2027-02-07').value, 3); // never below 3 months
  assert.deepEqual([examCountdown('2027-01-31', '2027-04-30').value, examCountdown('2027-01-31', '2027-04-30').unit], [89, 'days']);
  assert.equal(examCountdown('2026-01-31', '2027-04-30').value, 14); // 31 Jan → 30 Apr: 15 calendar months not reached
});

test('90 days or fewer shows days; exam day and past dates', () => {
  assert.deepEqual([examCountdown('2026-11-08', '2027-02-06').value, examCountdown('2026-11-08', '2027-02-06').unit], [90, 'days']);
  assert.equal(examCountdown('2026-11-08', '2026-11-09').label, '1 day to exam');
  assert.equal(examCountdown('2026-11-08', '2026-11-08').label, 'Exam day');
  assert.equal(examCountdown('2026-11-08', '2026-11-01').label, 'Exam date passed');
  assert.equal(examCountdown('2026-11-08', null), null);
});
