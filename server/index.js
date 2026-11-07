import express from 'express';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StudyAgent } from '../core/agents/orchestrator.js';
import { createRoutes, dispatch } from '../core/routes.js';
import { openStore } from './persist.js';

export function createApp(store) {
  const agent = new StudyAgent(store);
  const routes = createRoutes(agent);
  const app = express();
  app.use(express.json({ limit: '20mb' }));
  app.all('/api/*', (req, res) => {
    try {
      res.json(dispatch(routes, req.method, req.originalUrl, req.body));
    } catch (e) {
      const status = e.status || 500;
      if (status === 500) console.error(e);
      res.status(status).json({ error: e.message || 'Server error' });
    }
  });
  const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(join(dist, 'index.html')));
  }
  return { app, agent };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || (process.env.NODE_ENV === 'production' ? 5173 : 5174);
  const { store } = await openStore();
  const { app } = createApp(store);
  app.listen(port, () => console.log(`\n  🩺 Scalpel ready → http://localhost:${port}\n`));
}
