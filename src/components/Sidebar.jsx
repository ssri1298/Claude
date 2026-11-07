import { motion } from 'framer-motion';
import { LayoutDashboard, CalendarCheck, Sparkles, ImageUp, Library, BrainCircuit, CalendarDays, Settings, Scissors } from 'lucide-react';
import { useApp } from '../store.jsx';

export const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'today', label: 'Today', icon: CalendarCheck },
  { id: 'next', label: 'Study Next', icon: Sparkles },
  { id: 'import', label: 'Import', icon: ImageUp },
  { id: 'revision', label: 'Revision', icon: BrainCircuit },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'library', label: 'Library', icon: Library },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="relative grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500 shadow-glow">
        <Scissors size={18} className="-rotate-45 text-white" />
      </div>
      <div>
        <div className="font-display text-lg font-semibold leading-none tracking-tight text-white">Scalpel</div>
        <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">NEET SS · Surgical</div>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const { page, navigate, today } = useApp();
  const openTodos = today?.todos?.filter((t) => t.status === 'open').length || 0;
  return (
    <>
      {/* Desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col border-r border-white/[0.05] bg-ink-950/60 px-5 py-6 backdrop-blur-2xl lg:flex">
        <Logo />
        <nav className="mt-10 flex flex-1 flex-col gap-1">
          {NAV.map(({ id, label, icon: Icon }) => {
            const active = page === id;
            return (
              <button
                key={id}
                onClick={() => navigate(id)}
                className={`group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${active ? 'text-white' : 'text-slate-400 hover:text-slate-100'}`}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-xl border border-white/[0.08] bg-gradient-to-r from-violet-500/[0.16] to-cyan-500/[0.06]"
                    transition={{ type: 'spring', damping: 30, stiffness: 350 }}
                  />
                )}
                <Icon size={18} className={`relative ${active ? 'text-violet-300' : 'text-slate-500 group-hover:text-slate-300'}`} />
                <span className="relative">{label}</span>
                {id === 'today' && openTodos > 0 && (
                  <span className="relative ml-auto rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-semibold text-violet-200">{openTodos}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="glass p-4">
          <div className="label">Agents online</div>
          <div className="mt-3 space-y-2 text-xs text-slate-400">
            {['Study orchestrator', 'Planner', 'To-do subagent', 'Calendar subagent'].map((a) => (
              <div key={a} className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-pulseRing rounded-full bg-emerald-400" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                {a}
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.06] bg-ink-950/85 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl lg:hidden">
        <div className="flex overflow-x-auto">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => navigate(id)}
              className={`flex min-w-[64px] flex-1 flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-medium ${page === id ? 'text-violet-300' : 'text-slate-500'}`}
            >
              <Icon size={19} />
              {label.split(' ')[0]}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}
