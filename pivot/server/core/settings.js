// User settings with safe defaults. Stored in the kv table under "settings".
// Secrets live under "secrets" and are never sent to the browser in full.

import { DEFAULT_RULES } from '../engine/rules.js';

export const DEFAULT_SETTINGS = {
  tradingMode: 'paper', // 'paper' | 'live'
  confirmTrades: true, // ask before every BUY (exits follow your rules automatically)
  approvalMinutes: 15,
  agentsPaused: false,
  capitalSource: 'kite', // 'kite' (live funds) | 'fixed'
  fixedCapital: 500000,
  paperCapital: 500000,
  marketFilter: 'pause', // 'pause' | 'half' | 'off'
  backupGtt: true,
  rules: DEFAULT_RULES,
  holidays: [],
  schedule: { login: '08:00', prep: '08:30', closeCheck: '15:20', post: '15:40' },
  notify: { login: true, proposals: true, fills: true, exits: true, morningBrief: true, eveningReport: true, weeklyReport: true, health: true, alerts: true, nearPivot: false },
  backup: { daily: true, telegram: false },
  theme: 'system',
  universe: 'nifty500', // which stocks to watch: nifty500 | total | all
};

export function mergeDeep(base, patch) {
  if (Array.isArray(base) || Array.isArray(patch) || typeof patch !== 'object' || patch === null) return patch ?? base;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = typeof v === 'object' && v !== null && !Array.isArray(v) && typeof base?.[k] === 'object' ? mergeDeep(base[k], v) : v;
  }
  return out;
}

export function loadSettings(db) {
  return mergeDeep(DEFAULT_SETTINGS, db.kvGet('settings', {}));
}

export function saveSettings(db, patch) {
  const current = db.kvGet('settings', {});
  const next = mergeDeep(current, sanitize(patch));
  db.kvSet('settings', next);
  return loadSettings(db);
}

function sanitize(p) {
  const out = { ...p };
  if (out.rules) {
    const r = { ...out.rules };
    const clampNum = (k, a, b) => {
      if (r[k] != null) r[k] = Math.max(a, Math.min(b, Number(r[k])));
    };
    clampNum('positionPct', 1, 100);
    clampNum('maxPositions', 1, 30);
    clampNum('maxStopPct', 1, 15);
    clampNum('minStopPct', 0.5, 10);
    clampNum('partialAtPct', 2, 100);
    clampNum('minScore', 0, 100);
    clampNum('minVolPace', 0.5, 10);
    clampNum('buyZonePct', 0.5, 15);
    out.rules = r;
  }
  return out;
}

export function loadSecrets(db) {
  return { kiteApiKey: '', kiteApiSecret: '', kiteUserId: '', telegramToken: '', telegramChatId: '', ...db.kvGet('secrets', {}) };
}

export function saveSecrets(db, patch) {
  const cur = loadSecrets(db);
  const next = { ...cur };
  for (const [k, v] of Object.entries(patch)) if (typeof v === 'string' && !v.includes('•')) next[k] = v.trim();
  if (patch.telegramToken) {
    // Accept a pasted BotFather message: keep only the token itself (digits:letters)
    const m = String(patch.telegramToken).match(/\d{6,}:[A-Za-z0-9_-]{20,}/);
    if (m) next.telegramToken = m[0];
  }
  db.kvSet('secrets', next);
  return next;
}

export function maskSecrets(s) {
  const m = (v) => (v ? (v.length > 6 ? v.slice(0, 3) + '•••••' + v.slice(-2) : '•••••') : '');
  return {
    kiteApiKey: s.kiteApiKey || '',
    kiteApiSecret: m(s.kiteApiSecret),
    kiteUserId: s.kiteUserId || '',
    telegramToken: m(s.telegramToken),
    telegramChatId: s.telegramChatId || '',
    heartbeatUrl: m(s.heartbeatUrl),
  };
}
