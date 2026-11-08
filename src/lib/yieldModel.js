import { useEffect, useState } from 'react';
import { api } from '../api.js';

// The topic-yield model (areas, weights, evidence), loaded once and shared.
let cache = null;
let pending = null;
const listeners = new Set();

export function loadYieldModel() {
  if (cache) return Promise.resolve(cache);
  pending ??= api.yieldTable().then((t) => {
    cache = { ...t, byArea: Object.fromEntries(t.areas.map((a) => [a.area, a])) };
    for (const fn of listeners) fn(cache);
    return cache;
  }).catch(() => (pending = null));
  return pending;
}

export function useYieldModel() {
  const [model, setModel] = useState(cache);
  useEffect(() => {
    if (cache) return;
    listeners.add(setModel);
    loadYieldModel();
    return () => listeners.delete(setModel);
  }, []);
  return model;
}
