/**
 * Tiny in-process message bus used by the orchestrator to talk to subagents.
 *  - request(type, payload): routed to exactly one registered handler, returns its result.
 *  - notify(event, payload): broadcast notifications (e.g. "day.complete").
 * Every log entry lands in the agent_log table so the UI can show agent activity.
 */
export class AgentBus {
  constructor(store) {
    this.store = store;
    this.routes = new Map();
    this.handlers = new Map();
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
    return agent.handle({ type, payload });
  }

  log(agent, event, detail) {
    this.store.insert('agent_log', { agent, event, detail: detail == null ? null : typeof detail === 'string' ? detail : JSON.stringify(detail) });
  }

  on(event, fn) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event).add(fn);
  }

  notify(event, payload) {
    for (const fn of this.handlers.get(event) || []) fn(payload);
  }
}
