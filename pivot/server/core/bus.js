// Event bus shared by all agents. Every logged message is stored and streamed to the UI.

import { EventEmitter } from 'node:events';

export class Bus extends EventEmitter {
  constructor(db, clock) {
    super();
    this.db = db;
    this.clock = clock;
    this.setMaxListeners(50);
  }

  /** Log an agent message (persisted + pushed to the live UI). */
  log(agent, message, { level = 'info', data } = {}) {
    const ts = this.clock.now().toISOString();
    const id = this.db.insert('events', { ts, agent, level, message, data: data ?? null });
    const ev = { id, ts, agent, level, message, data };
    this.emit('event', ev);
    this.push('event', ev);
    if (level === 'error') console.error(`[${agent}] ${message}`);
    return ev;
  }

  /** Push a live update to connected browsers (not persisted). */
  push(type, payload) {
    this.emit('push', { type, payload });
  }
}
