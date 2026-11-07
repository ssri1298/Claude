// In-browser backend for the hosted website. Runs the same study engine as the local server and
// saves it to the viewer's private storage on the site (the `db` capability, under
// data/users/<id>/), falling back to this browser's localStorage when that isn't available.
import { Store } from '../../core/store.js';
import { StudyAgent } from '../../core/agents/orchestrator.js';
import { createRoutes, dispatch } from '../../core/routes.js';

const LOCAL_KEY = 'scalpel.state.v2';
const CHUNK = 60000; // characters per stored document (well under the 256 KiB document limit)
const TAB = Math.random().toString(36).slice(2);

let ready = null;
let cloudDb = null; // the website database, when available (used for Claude's inbox)
const statusListeners = new Set();
let status = { mode: 'loading', saving: false, error: null };
const setStatus = (patch) => {
  status = { ...status, ...patch };
  for (const fn of statusListeners) fn(status);
};
export const onStatus = (fn) => (statusListeners.add(fn), fn(status), () => statusListeners.delete(fn));

const readLocal = () => {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const writeLocal = (json) => {
  try {
    localStorage.setItem(LOCAL_KEY, json);
  } catch {}
};

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'timeout' })), ms))]);

/** Cloud persistence: the whole state, split into generation-stamped chunks plus a manifest. */
function cloudAdapter(db, uid) {
  const manifest = db.doc(`data/users/${uid}/scalpel`);
  const chunks = manifest.collection('chunks');
  let rev = 0;

  async function readGen(m) {
    const parts = [];
    for (let i = 0; i < m.count; i++) {
      const d = await chunks.doc(`g${m.rev}-${m.tab}-${i}`).get();
      if (!d.exists) throw new Error('Saved data is incomplete');
      parts.push(d.data().s);
    }
    return JSON.parse(parts.join(''));
  }

  return {
    async load() {
      const m = await manifest.get();
      if (!m.exists) return null;
      const meta = m.data();
      rev = meta.rev || 0;
      return readGen(meta);
    },
    async save(json) {
      const next = rev + 1;
      const parts = [];
      for (let i = 0; i < json.length; i += CHUNK) parts.push(json.slice(i, i + CHUNK));
      if (!parts.length) parts.push('{}');
      for (let i = 0; i < parts.length; i++) await chunks.doc(`g${next}-${TAB}-${i}`).set({ s: parts[i] });
      await manifest.set({ rev: next, count: parts.length, savedAt: new Date().toISOString(), tab: TAB });
      rev = next;
      // Remove older generations now that the manifest points at the new one (best effort).
      const all = await chunks.get().catch(() => null);
      for (const d of all?.docs || []) {
        const gen = Number(d.id.slice(1).split('-')[0]);
        if (gen < next) await chunks.doc(d.id).delete().catch(() => {});
      }
    },
    /** Hear saves from other tabs/devices. */
    watch(onRemote) {
      return manifest.onSnapshot(
        (snap) => {
          if (!snap.exists || snap.metadata.hasPendingWrites) return;
          const m = snap.data();
          if (m.tab !== TAB && m.rev > rev) {
            readGen(m)
              .then((data) => {
                rev = m.rev;
                onRemote(data);
              })
              .catch(() => {});
          }
        },
        () => {},
      );
    },
  };
}

async function init() {
  const store = new Store();
  let adapter = null;
  let mode = 'browser';
  try {
    const c = window.claude;
    if (c?.use) {
      const [db, user] = await Promise.all([c.use('db'), c.use('user')]);
      const uid = db && user ? await user.id() : null;
      if (db) cloudDb = db;
      if (db && uid) {
        adapter = cloudAdapter(db, uid);
        mode = 'cloud';
      }
    }
  } catch {}

  let loaded = null;
  if (adapter) {
    try {
      loaded = await withTimeout(adapter.load(), 12000);
      if (!loaded) {
        // First visit on the website: bring over anything this browser already had.
        loaded = readLocal();
      }
    } catch (e) {
      // Can't reach saved data: work from this browser's copy and don't overwrite the cloud copy.
      loaded = readLocal();
      adapter = null;
      mode = 'offline';
    }
  } else {
    loaded = readLocal();
  }
  if (loaded) store.load(loaded);

  const agent = new StudyAgent(store);
  const routes = createRoutes(agent);

  // Persist on change: debounce, one save at a time, always save the newest state.
  let timer = null;
  let saving = null;
  let dirty = false;
  let applyingRemote = false;
  const save = async () => {
    if (saving) {
      dirty = true;
      return;
    }
    const json = JSON.stringify(store.toJSON());
    writeLocal(json);
    if (!adapter) return;
    setStatus({ saving: true });
    saving = adapter
      .save(json)
      .then(() => setStatus({ saving: false, error: null, savedAt: new Date() }))
      .catch((e) => setStatus({ saving: false, error: e?.code === 'quota_exceeded' ? 'Your saved data is full. Export a backup and remove old topics.' : 'Changes could not be saved to your account. They are kept in this browser for now.' }));
    await saving;
    saving = null;
    if (dirty) {
      dirty = false;
      save();
    }
  };
  store.onChange(() => {
    if (applyingRemote) return;
    clearTimeout(timer);
    timer = setTimeout(save, 900);
  });
  window.addEventListener('pagehide', () => {
    if (timer) {
      clearTimeout(timer);
      save();
    }
  });

  adapter?.watch((data) => {
    if (timer || saving) return; // our own unsaved edits win; they will be saved next
    applyingRemote = true;
    store.load(data);
    agent.rolledFor = null;
    applyingRemote = false;
    writeLocal(JSON.stringify(data));
    window.dispatchEvent(new Event('scalpel:remote-update'));
  });

  setStatus({ mode });
  return { routes };
}

/**
 * Claude's inbox: topic batches Claude prepared (e.g. from screenshots sent in chat), stored in
 * the shared `inbox` collection of this private page. Each doc: {title, createdAt, topics:[...]}.
 */
export async function listInbox() {
  await backend();
  if (!cloudDb) return [];
  try {
    const snap = await withTimeout(cloudDb.collection('inbox').get(), 10000);
    return snap.docs.filter((d) => d.exists && Array.isArray(d.data()?.topics)).map((d) => ({ inboxId: d.id, ...d.data() }));
  } catch {
    return [];
  }
}

export async function deleteInbox(id) {
  if (!cloudDb) return;
  await cloudDb.collection('inbox').doc(id).delete().catch(() => {});
}

export function backend() {
  return (ready ??= init());
}

export async function call(method, url, body) {
  const { routes } = await backend();
  try {
    // Clone so UI code can never mutate engine state by accident.
    return structuredClone(dispatch(routes, method, url, body === undefined ? undefined : structuredClone(body)));
  } catch (e) {
    if (!e.status) console.error(e);
    throw new Error(e.message || 'Something went wrong');
  }
}
