import { useEffect, useState } from 'react';
import { Bot, CalendarDays, ListChecks, Sparkles, Wand2 } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';

const META = {
  orchestrator: { icon: Bot, label: 'Orchestrator', color: 'text-violet-300 bg-violet-500/10' },
  planner: { icon: Wand2, label: 'Planner', color: 'text-fuchsia-300 bg-fuchsia-500/10' },
  todo: { icon: ListChecks, label: 'To-do subagent', color: 'text-emerald-300 bg-emerald-500/10' },
  calendar: { icon: CalendarDays, label: 'Calendar subagent', color: 'text-cyan-300 bg-cyan-500/10' },
  yield: { icon: Sparkles, label: 'Yield scorer', color: 'text-amber-300 bg-amber-500/10' },
};

export default function AgentFeed({ limit = 8 }) {
  const { version } = useApp();
  const [log, setLog] = useState([]);
  useEffect(() => {
    api.agentLog().then(setLog).catch(() => {});
  }, [version]);
  if (!log.length) return <div className="py-8 text-center text-sm text-slate-500">Agent activity will appear here.</div>;
  return (
    <ol className="relative space-y-3.5 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-white/[0.06]">
      {log.slice(0, limit).map((l) => {
        const m = META[l.agent] || META.orchestrator;
        const Icon = m.icon;
        return (
          <li key={l.id} className="relative flex gap-3">
            <div className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-1 ring-white/5 ${m.color}`}>
              <Icon size={14} />
            </div>
            <div className="min-w-0 pt-0.5">
              <div className="text-xs text-slate-500">
                <span className="font-medium text-slate-300">{m.label}</span> · {l.event} · {l.ts.slice(11, 16)}
              </div>
              {l.detail && <div className="truncate text-sm text-slate-300">{l.detail}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
