import express from 'express';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { StudyAgent } from './agents/orchestrator.js';
import { apiRouter } from './routes/api.js';

export function createApp(db = openDb()) {
  const agent = new StudyAgent(db);
  const app = express();
  app.use(express.json({ limit: '20mb' }));
  app.use('/api', apiRouter(agent));

  const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(join(dist, 'index.html')));
  }
  return { app, agent };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || (process.env.NODE_ENV === 'production' ? 5173 : 5174);
  const { app } = createApp();
  app.listen(port, () => console.log(`\n  🩺 Scalpel API ready → http://localhost:${port}\n`));
}
