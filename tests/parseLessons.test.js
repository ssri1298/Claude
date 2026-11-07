import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDuration, parseLessons, cleanTitle } from '../src/lib/parseLessons.js';

test('parseDuration handles common formats', () => {
  assert.equal(parseDuration('1:05:30'), 66);
  assert.equal(parseDuration('45:12'), 46);
  assert.equal(parseDuration('1h 20m'), 80);
  assert.equal(parseDuration('1 hr 5 min'), 65);
  assert.equal(parseDuration('45 min'), 45);
  assert.equal(parseDuration('2 hours'), 120);
  assert.equal(parseDuration('38m'), 38);
  assert.equal(parseDuration('no time here'), null);
});

test('parseLessons — title and duration on the same line', () => {
  const txt = `Surgery Module
1. Acute Pancreatitis  52:10
2. Carcinoma Breast - Part 1   1:12:45 Watched
3 Thyroid Nodule Approach 38 min
✓ Parathyroid Adenoma 24:05`;
  const r = parseLessons(txt);
  assert.deepEqual(r.map((x) => x.title), ['Acute Pancreatitis', 'Carcinoma Breast - Part 1', 'Thyroid Nodule Approach', 'Parathyroid Adenoma']);
  assert.deepEqual(r.map((x) => x.duration_min), [53, 73, 38, 25]);
});

test('parseLessons — duration on its own line below the title', () => {
  const txt = `Portal Hypertension and Varices
Video · 1h 5m
Hirschsprung Disease
42:00
100%`;
  const r = parseLessons(txt);
  assert.deepEqual(r, [
    { title: 'Portal Hypertension and Varices', duration_min: 65 },
    { title: 'Hirschsprung Disease', duration_min: 42 },
  ]);
});

test('parseLessons — progress "watched / total" keeps the total, dedupes overlaps', () => {
  const txt = `Burns Management 12:30 / 48:20\nBurns Management 48:20`;
  const r = parseLessons(txt);
  assert.equal(r.length, 1);
  assert.equal(r[0].duration_min, 49);
});

test('cleanTitle strips numbering and badges', () => {
  assert.equal(cleanTitle('Lecture 12: Gastric Cancer  Completed'), 'Gastric Cancer');
  assert.equal(cleanTitle('07) Wilms Tumour •'), 'Wilms Tumour');
});
