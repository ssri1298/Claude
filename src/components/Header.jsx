import { useEffect, useState } from 'react';
import { Flame, Clock, Hourglass, Sun } from 'lucide-react';
import { useApp } from '../store.jsx';
import { api } from '../api.js';
import { Logo } from './Sidebar.jsx';
import { fmtMin } from './ui.jsx';

const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? 'Burning the midnight oil' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

export default function Header() {
  const { version, today, setCheckInOpen } = useApp();
  const [stats, setStats] = useState(null);
  useEffect(() => {
    api.stats(7).then(setStats).catch(() => {});
  }, [version]);

  const dateStr = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const Pill = ({ icon: Icon, color, children, title }) => (
    <div title={title} className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-xs font-medium text-slate-300">
      <Icon size={14} className={color} />
      {children}
    </div>
  );

  return (
    <header className="sticky top-0 z-20 border-b border-white/[0.04] bg-ink-950/60 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1320px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-10">
        <div className="lg:hidden">
          <Logo />
        </div>
        <div className="hidden lg:block">
          <div className="text-xs text-slate-500">{dateStr}</div>
          <div className="font-display text-lg font-semibold text-white">{greeting()}, Doctor.</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill icon={Flame} color="text-orange-400" title="Consecutive study days">
            <span className="font-display text-sm text-white">{stats?.totals.streak ?? '–'}</span> day streak
          </Pill>
          <Pill icon={Clock} color="text-cyan-300" title="Studied this week">
            <span className="font-display text-sm text-white">{stats ? fmtMin(stats.totals.weekMinutes) : '–'}</span>
            <span className="hidden sm:inline">this week</span>
          </Pill>
          {stats?.daysToExam != null && (
            <Pill icon={Hourglass} color="text-violet-300" title={`Exam on ${stats.examDate}`}>
              <span className="font-display text-sm text-white">{Math.max(0, stats.daysToExam)}</span> days to exam
            </Pill>
          )}
          {today?.checkInNeeded && (
            <button className="btn-primary !py-2 text-xs" onClick={() => setCheckInOpen(true)}>
              <Sun size={14} /> Plan my day
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
