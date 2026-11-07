// Saves the study store to data/study.json (atomic write, debounced). On first run it imports
// data from the older SQLite database (data/study.db) if one exists.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Store, TABLES } from '../core/store.js';

async function readLegacySqlite(path) {
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(path, { readOnly: true });
    const out = {};
    for (const t of [...TABLES, 'settings']) {
      try {
        out[t] = db.prepare(`SELECT * FROM ${t}`).all().map((r) => ({ ...r }));
      } catch {
        out[t] = [];
      }
    }
    db.close();
    return out;
  } catch (e) {
    console.warn(`  Could not read old database ${path}: ${e.message}`);
    return null;
  }
}

export async function openStore(file = process.env.DATA_FILE || 'data/study.json') {
  const store = new Store();
  if (file === ':memory:') return { store, flush() {} };
  mkdirSync(dirname(file), { recursive: true });
  if (existsSync(file)) {
    store.load(JSON.parse(readFileSync(file, 'utf8')));
  } else {
    const legacy = join(dirname(file), 'study.db');
    if (existsSync(legacy)) {
      const data = await readLegacySqlite(legacy);
      if (data) {
        store.load(data);
        console.log(`  Imported your data from ${legacy}`);
      }
    }
  }
  const write = () => {
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(store.toJSON()));
    renameSync(tmp, file);
  };
  let timer = null;
  store.onChange(() => {
    clearTimeout(timer);
    timer = setTimeout(write, 300);
  });
  if (!existsSync(file)) write();
  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      write();
    }
  };
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => (flush(), process.exit(0)));
  process.on('exit', flush);
  return { store, flush };
}
