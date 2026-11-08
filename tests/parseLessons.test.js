import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDuration, parseLessons, cleanTitle, detectHeaders, mergePasses, repairNumeralSequence, fixRomanNumerals } from '../src/lib/parseLessons.js';

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

// Real Tesseract output from a course app's video list (light theme, rating + duration line).
const REAL = `£                  General Surgery SS

( All . iscd         Completed         Unattempted

Trauma and Burns: MCQ
Discussion |

% 46 51Min

Breast : ll
w 47 71Min

Plastic Surgery (MCQ

78              Discussion)

% 46 31Min

PRO

IMPORTANT TABLES

Sabiston Important Tables : li
45 20 Min`;

test('parseLessons — real course-app OCR: multi-line titles, roman numerals, ratings, chrome', () => {
  const r = parseLessons(REAL, { ignore: ['General Surgery SS'] });
  assert.deepEqual(r, [
    { title: 'Trauma and Burns: MCQ Discussion I', duration_min: 51 },
    { title: 'Breast: II', duration_min: 71 },
    { title: 'Plastic Surgery (MCQ Discussion)', duration_min: 31 },
    { title: 'Sabiston Important Tables: II', duration_min: 20 },
  ]);
});

test('detectHeaders finds the page title repeated across screenshots', () => {
  const a = 'General Surgery SS\n\nAll Paused Completed\n\nLiver I\n4.7 67 Min';
  const b = 'General Surgery SS\n\nSpleen\n4.6 39 Min';
  assert.deepEqual(detectHeaders([a, b]), ['General Surgery SS']);
});

test('same title with different lengths is kept (Part II vs misread Part III)', () => {
  assert.equal(parseLessons('Breast : ll\n4.7 71 Min\n\nBreast : ll\n4.7 60 Min').length, 2);
});

test('mergePasses only fills gaps between rows the first pass found side by side', () => {
  const a = [{ title: 'Intestinal Obstruction II', duration_min: 37 }, { title: 'Appendix and its Disorders', duration_min: 53 }];
  const b = [
    { title: 'DOESN Wr', duration_min: 45 }, // header noise above the list: rejected
    { title: 'Intestinal Obstruction Il', duration_min: 37 },
    { title: 'Small & Large Bowel - Benign Conditions', duration_min: 75 },
    { title: 'Appendix and its Disorders', duration_min: 53 },
  ];
  const r = mergePasses(a, b);
  assert.deepEqual(r.map((x) => x.title), ['Intestinal Obstruction II', 'Small & Large Bowel - Benign Conditions', 'Appendix and its Disorders']);
  assert.equal(r[1].recovered, true);
});

test('repairNumeralSequence renumbers repeated parts in order, leaves correct runs alone', () => {
  const r = repairNumeralSequence([
    { title: 'Breast: I', duration_min: 51 }, { title: 'Breast: II', duration_min: 71 }, { title: 'Breast: II', duration_min: 60 },
    { title: 'Liver I', duration_min: 67 }, { title: 'Liver II', duration_min: 60 },
    { title: 'Spleen', duration_min: 39 },
  ]);
  assert.deepEqual(r.map((x) => x.title), ['Breast: I', 'Breast: II', 'Breast: III', 'Liver I', 'Liver II', 'Spleen']);
});

test('GI is not misread as Gl', () => {
  assert.equal(fixRomanNumerals('Upper Gl Hemorrhage'), 'Upper GI Hemorrhage');
});
