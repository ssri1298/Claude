// Live prices in the browser: one snapshot on load, then updates 4 times a second over the stream,
// plus each agent's live status (what it is doing right now).
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { api } from './lib.js';

const state = { index: null, q: {}, phase: null, t: 0, agents: null, skew: 0, beat: 0 };
const subs = new Set();
const emit = () => subs.forEach((f) => f());
let started = false;
let lastBeatAt = 0;

export function startLive() {
  if (started) return;
  started = true;
  const load = () =>
    api('/quotes')
      .then((d) => {
        state.index = d.index;
        state.q = d.q;
        state.phase = d.phase;
        state.t = d.t;
        if (d.agents) state.agents = d.agents;
        state.skew = Date.now() - d.t;
        emit();
      })
      .catch(() => {});
  load();
  setInterval(load, 60000); // safety net if the stream drops
  window.addEventListener('pivot:quotes', (e) => {
    const d = e.detail;
    if (!d) return;
    if (d.index) state.index = d.index;
    if (d.phase) state.phase = d.phase;
    state.q = { ...state.q, ...d.q };
    state.t = d.t;
    if (d.agents) state.agents = d.agents;
    state.skew = Date.now() - d.t; // server clock → browser clock
    if (Date.now() - lastBeatAt > 1000) {
      state.beat++; // heartbeat blink at most once a second
      lastBeatAt = Date.now();
    }
    emit();
  });
}

const subscribe = (f) => {
  subs.add(f);
  return () => subs.delete(f);
};

export function useIndex() {
  return useSyncExternalStore(subscribe, () => state.index);
}

export function usePhase() {
  return useSyncExternalStore(subscribe, () => state.phase);
}

/** Live [ltp, changePct] for a symbol, or undefined. */
export function useQuote(symbol) {
  const v = useSyncExternalStore(subscribe, () => state.q[symbol]);
  return v ? { ltp: v[0], changePct: v[1] } : undefined;
}

/** Returns 'up' | 'down' | null for ~0.8 s after the value changes (for a price flash). */
export function useFlash(value) {
  const prev = useRef(value);
  const [dir, setDir] = useState(null);
  useEffect(() => {
    if (value == null || prev.current == null || value === prev.current) {
      prev.current = value;
      return;
    }
    setDir(value > prev.current ? 'up' : 'down');
    prev.current = value;
    const t = setTimeout(() => setDir(null), 500);
    return () => clearTimeout(t);
  }, [value]);
  return dir;
}

/** Each agent's live status: { parent, screener, analyst, executor, feed }. */
export function useAgents() {
  return useSyncExternalStore(subscribe, () => state.agents);
}

/** Increments on every push from the server — for a heartbeat blink. */
export function useBeat() {
  return useSyncExternalStore(subscribe, () => state.beat);
}

/** Server timestamp (ms) → browser timestamp, so "3s ago" is right even if clocks differ. */
export const toLocal = (ms) => (ms == null ? null : ms + state.skew);

/** Re-renders every `ms` milliseconds; returns Date.now(). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** "just now", "12s ago", "3m ago" */
export function ago(ms, now = Date.now()) {
  if (!ms) return '';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 3) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

// ---- Known symbols (to turn stock names in messages into links). Loaded once per session.
let symbols = null;
let symbolsLoading = false;
const symSubs = new Set();
export function useSymbols() {
  const v = useSyncExternalStore(
    (f) => {
      symSubs.add(f);
      return () => symSubs.delete(f);
    },
    () => symbols,
  );
  if (!symbols && !symbolsLoading) {
    symbolsLoading = true;
    api('/symbols')
      .then((list) => {
        symbols = new Set(list);
        symSubs.forEach((f) => f());
      })
      .catch(() => (symbolsLoading = false));
  }
  return v;
}

/** All live quotes { SYMBOL: [ltp, changePct] } — re-renders on every price push. */
export function useAllQuotes() {
  return useSyncExternalStore(subscribe, () => state.q);
}

/** Live % distance from the pivot (falls back to the server value until a tick arrives). */
export function useDistPivot(symbol, pivot, fallback) {
  const q = useQuote(symbol);
  if (!pivot) return fallback ?? null;
  return q?.ltp ? (q.ltp / pivot - 1) * 100 : fallback ?? null;
}
