// Live prices in the browser: one snapshot on load, then second-by-second updates over the stream.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { api } from './lib.js';

const state = { index: null, q: {}, phase: null, t: 0 };
const subs = new Set();
const emit = () => subs.forEach((f) => f());
let started = false;

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
    const t = setTimeout(() => setDir(null), 800);
    return () => clearTimeout(t);
  }, [value]);
  return dir;
}
