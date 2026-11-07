import { EventEmitter } from 'node:events';

/**
 * Tiny in-process message bus used by the orchestrator to talk to subagents.
 *  - request(type, payload): routed to exactly one registered handler, returns its result.
 *  - emit(event, payload):   broadcast notifications (e.g. "day.complete").
 * Every message is written to the agent_log table so the UI can show agent activity.
 */
export class AgentBus extends EventEmitter {
  constructor(db) {
    super();
    this.db = db;
    this.routes = new Map();
    this.logStmt = db.prepare('INSERT INTO agent_log(agent, event, detail) VALUES (?, ?, ?)');
  }

  register(agent) {
    for (const type of agent.handles) {
      if (this.routes.has(type)) throw new Error(`Duplicate handler for ${type}`);
      this.routes.set(type, agent);
    }
    agent.bus = this;
    return agent;
  }

  request(type, payload = {}) {
    const agent = this.routes.get(type);
    if (!agent) throw new Error(`No agent handles "${type}"`);
    const result = agent.handle({ type, payload });
    return result;
  }

  log(agent, event, detail) {
    this.logStmt.run(agent, event, detail == null ? null : typeof detail === 'string' ? detail : JSON.stringify(detail));
  }

  notify(event, payload) {
    this.emit(event, payload);
  }
}
