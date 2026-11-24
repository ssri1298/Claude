// Pivot server: agents + API + web app.
//   PIVOT_DEMO=1        simulated market (no Zerodha needed)
//   PIVOT_DATA=./data   where the database lives
//   PIVOT_PUBLIC_URL    e.g. https://13-233-10-20.sslip.io (used in Telegram links)
//   PORT                default 8080

import express from 'express';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntime } from './runtime.js';
import { createAuth } from './auth.js';
import { mountApi } from './api.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export async function startServer({ port = Number(process.env.PORT) || 8080, demo = process.env.PIVOT_DEMO === '1', dataDir = process.env.PIVOT_DATA || join(root, 'data') } = {}) {
  const dbFile = join(dataDir, demo ? 'pivot-demo.db' : 'pivot.db');
  const ctx = await createRuntime({ dbFile, demo, publicUrl: process.env.PIVOT_PUBLIC_URL || '' });
  const auth = createAuth(ctx.db);
  const app = express();
  app.set('trust proxy', 'loopback');
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });
  mountApi(app, ctx, auth, { dbFile, dataDir });
  const dist = join(root, 'dist');
  if (existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(dist, 'index.html')));
  }
  const server = await new Promise((resolve) => {
    const s = app.listen(port, process.env.HOST || '127.0.0.1', () => resolve(s));
  });
  console.log(`\n  ◆ Pivot ${demo ? '(DEMO) ' : ''}running → http://localhost:${port}\n`);
  return { app, server, ctx };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { ctx, server } = await startServer();
  const shutdown = () => {
    ctx.stop();
    server.close();
    setTimeout(() => process.exit(0), 500);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
