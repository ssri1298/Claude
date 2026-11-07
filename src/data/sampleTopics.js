// Example video topics for trying Scalpel before importing your own course list.
// They are marked as samples and can be removed in one click from the Library.
export const SAMPLE_TOPICS = [
  ['Acute Pancreatitis: Atlanta classification & management', 52],
  ['Carcinoma Breast: surgical management', 73],
  ['Thyroid Nodule & Bethesda System', 39],
  ['Portal Hypertension and Varices', 47],
  ['ATLS Primary Survey', 42],
  ['Hirschsprung Disease', 29],
  ['Colorectal Cancer: staging and TME', 58],
  ['Parathyroid Adenoma & Hyperparathyroidism', 33],
  ['Burns: fluid resuscitation', 36],
  ['Gynaecomastia', 13],
].map(([title, duration_min]) => ({ title, duration_min, source: 'sample' }));
