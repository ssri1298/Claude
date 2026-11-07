import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldRemind } from '../src/lib/reminder.js';

const r = { enabled: true, time: '10:00' };
const at = (h, m) => new Date(2026, 10, 7, h, m);

test('daily reminder fires at/after 10:00, once per day, not when planned or disabled', () => {
  assert.equal(shouldRemind({ now: at(9, 59), reminder: r }), false);
  assert.equal(shouldRemind({ now: at(10, 0), reminder: r }), true);
  assert.equal(shouldRemind({ now: at(15, 30), reminder: r }), true);
  assert.equal(shouldRemind({ now: at(10, 5), reminder: r, lastRemindedOn: '2026-11-07' }), false);
  assert.equal(shouldRemind({ now: at(10, 5), reminder: r, lastRemindedOn: '2026-11-06' }), true);
  assert.equal(shouldRemind({ now: at(10, 5), reminder: r, planFinal: true }), false);
  assert.equal(shouldRemind({ now: at(10, 5), reminder: { ...r, enabled: false } }), false);
  assert.equal(shouldRemind({ now: at(7, 30), reminder: { enabled: true, time: '07:15' } }), true);
});
