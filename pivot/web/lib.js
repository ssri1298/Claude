import { useEffect, useRef, useState, useCallback, useSyncExternalStore } from 'react';

// ---------------------------------------------------------------- API
export class ApiError extends Error {}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty */
  }
  if (res.status === 401 && !path.startsWith('/auth')) {
    window.dispatchEvent(new Event('pivot:logout'));
  }
  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`);
  return data;
}

/** Fetch + auto-refresh on server pushes (and optionally on an interval). */
export function useApi(path, { interval, events = [], enabled = true } = {}) {
  const [state, set] = useState({ data: null, error: null, loading: true });
  const pathRef = useRef(path);
  pathRef.current = path;
  const load = useCallback(async () => {
    if (!pathRef.current) return;
    try {
      const data = await api(pathRef.current);
      set({ data, error: null, loading: false });
    } catch (e) {
      set((s) => ({ ...s, error: e.message, loading: false }));
    }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    set((s) => ({ ...s, loading: true }));
    load();
  }, [path, enabled, load]);
  useEffect(() => {
    if (!interval || !enabled) return;
    const t = setInterval(load, interval);
    return () => clearInterval(t);
  }, [interval, enabled, load]);
  useEffect(() => {
    if (!events.length || !enabled) return;
    let timer;
    const h = () => {
      clearTimeout(timer);
      timer = setTimeout(load, 250);
    };
    events.forEach((e) => window.addEventListener('pivot:' + e, h));
    return () => events.forEach((e) => window.removeEventListener('pivot:' + e, h));
  }, [events.join(','), enabled, load]);
  return { ...state, reload: load };
}

let es = null;
export function connectStream() {
  if (es) return;
  es = new EventSource('/api/stream');
  for (const type of ['event', 'approval', 'positions', 'scan', 'progress', 'kite', 'settings', 'backtest']) {
    es.addEventListener(type, (m) => {
      let detail = null;
      try {
        detail = JSON.parse(m.data);
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new CustomEvent('pivot:' + type, { detail }));
      window.dispatchEvent(new CustomEvent('pivot:any', { detail: { type, detail } }));
    });
  }
  es.onerror = () => {
    /* browser retries automatically */
  };
}
export function disconnectStream() {
  es?.close();
  es = null;
}

// ---------------------------------------------------------------- router (hash based)
function subscribeHash(cb) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}
export function useRoute() {
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash || '#/');
  const [path, query = ''] = hash.slice(1).split('?');
  const parts = path.split('/').filter(Boolean);
  return { path: '/' + parts.join('/'), parts, query: Object.fromEntries(new URLSearchParams(query)) };
}
export const go = (to) => {
  window.location.hash = to;
};

// ---------------------------------------------------------------- theme
export function getTheme() {
  try {
    return localStorage.getItem('pivot-theme') || 'system';
  } catch {
    return 'system';
  }
}
export function applyTheme(t) {
  try {
    localStorage.setItem('pivot-theme', t);
  } catch {
    /* ignore */
  }
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  window.dispatchEvent(new Event('pivot:theme'));
}
export function useIsDark() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('pivot:theme', cb);
      const mq = matchMedia('(prefers-color-scheme: dark)');
      const h = () => {
        if (getTheme() === 'system') applyTheme('system');
        cb();
      };
      mq.addEventListener('change', h);
      return () => {
        window.removeEventListener('pivot:theme', cb);
        mq.removeEventListener('change', h);
      };
    },
    () => document.documentElement.classList.contains('dark'),
  );
}
export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// ---------------------------------------------------------------- formatting
export const inr = (x, d = 0) => {
  if (x == null || Number.isNaN(x)) return '—';
  const neg = x < 0;
  const s = Math.abs(x).toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d });
  return (neg ? '−₹' : '₹') + s;
};
export const price = (x) => (x == null ? '—' : '₹' + Number(x).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const pct = (x, d = 1, sign = true) => (x == null || Number.isNaN(x) ? '—' : `${sign && x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(d)}%`);
export const signed = (x, d = 0) => (x == null ? '—' : `${x > 0 ? '+' : ''}${inr(x, d)}`);
export const compactInr = (x) => {
  if (x == null) return '—';
  const a = Math.abs(x);
  const s = a >= 1e7 ? (a / 1e7).toFixed(2) + 'Cr' : a >= 1e5 ? (a / 1e5).toFixed(2) + 'L' : a >= 1e3 ? (a / 1e3).toFixed(1) + 'K' : a.toFixed(0);
  return (x < 0 ? '−₹' : '₹') + s;
};
export const tone = (x) => (x > 0 ? 'text-mint' : x < 0 ? 'text-coral' : 'text-ink2');
export function timeAgo(iso, nowIso) {
  const s = Math.max(0, (new Date(nowIso || Date.now()) - new Date(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
export function istTime(iso) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
}
export function istDateTime(iso) {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
}
export function niceDate(d) {
  if (!d) return '—';
  return new Date(d + 'T12:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
}
