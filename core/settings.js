export const DEFAULT_SETTINGS = {
  revisionShare: 0.3,
  durationMultiplier: 1.25,
  breakBufferPct: 0.1,
  recallMinutes: 12,
  lowYieldThreshold: 3,
  examDate: null,
  pomodoro: { focus: 25, short: 5, long: 15, roundsBeforeLong: 4 },
  reminder: { enabled: true, time: '10:00' },
  yieldModelSeen: null, // version of the topic-yield model the student has re-scored with (or dismissed)
};

export function getSettings(store) {
  const s = structuredClone(DEFAULT_SETTINGS);
  for (const [k, v] of Object.entries(store.settings)) if (k in DEFAULT_SETTINGS) s[k] = structuredClone(v);
  return s;
}

export function saveSettings(store, patch) {
  const clean = Object.fromEntries(Object.entries(patch || {}).filter(([k]) => k in DEFAULT_SETTINGS));
  store.setSettings(clean);
  return getSettings(store);
}
