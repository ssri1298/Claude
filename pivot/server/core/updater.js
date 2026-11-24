// App side of the in-app updater. The app never updates itself: it leaves a request file that a
// root-owned systemd service (deploy/updater.sh) picks up, and reads back the status it writes.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function createUpdater({ dataDir, getToken, log }) {
  const dir = join(dataDir, 'update');
  const read = (f) => {
    try {
      return JSON.parse(readFileSync(f, 'utf8'));
    } catch {
      return null;
    }
  };
  const api = {
    available: () => existsSync(dir),
    version: () => read(join(appRoot, 'version.json')),
    status: () => read(join(dir, 'status.json')),
    request(action) {
      if (!api.available()) throw Object.assign(new Error('In-app updates need the server installer — run the install command once from the SSH terminal'), { status: 400 });
      const token = getToken() || undefined;
      writeFileSync(join(dir, 'request.json'), JSON.stringify({ action, token }), { mode: 0o600 });
      log?.(action === 'update' ? 'Update started — Pivot will restart in a minute or two' : 'Checking for a new version of Pivot');
      return { ok: true };
    },
    lastLog() {
      try {
        return readFileSync(join(dir, 'update.log'), 'utf8').split('\n').slice(-15).join('\n');
      } catch {
        return '';
      }
    },
  };
  // check once shortly after start, then daily
  if (api.available()) {
    setTimeout(() => api.request('check'), 60 * 1000).unref?.();
    setInterval(() => api.request('check'), 24 * 3600 * 1000).unref?.();
  }
  return api;
}
