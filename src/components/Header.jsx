import { useEffect, useState } from 'react';
import { Flame, Clock, Hourglass, Sun, BellRing } from 'lucide-react';
import { permission, requestPermission } from '../lib/reminder.js';
import { useApp } from '../store.jsx';
import { api, IS_WEB } from '../api.js';
import { Logo } from './Sidebar.jsx';
import { fmtMin } from './ui.jsx';
import SaveStatus from './SaveStatus.jsx';

const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? 'Burning the midnight oil' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

export default function Header() {
  const { version, today, setCheckInOpen, settings, toast } = useApp();
  const [stats, setStats] = useState(null);
  const [perm, setPerm] = useState(permission);
  const enableReminder = async () => {
    const p = await requestPermission();
    setPerm(p);
    if (p === 'granted') toast(`Daily reminder on — I’ll ask for your plan at ${settings?.reminder?.time || '10:00'}`);
    else toast('Notifications blocked — allow them in your browser’s site settings', 'error');
  };
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
    <header style={{ top: 'env(safe-area-inset-top, 0px)' }} className="sticky z-20 border-b border-white/[0.04] bg-ink-950/60 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1320px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-10">
        <div className="flex items-center gap-3 lg:hidden">
          <Logo />
          <SaveStatus compact />
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
          {!IS_WEB && settings?.reminder?.enabled && perm === 'default' && (
            <button className="btn-ghost !py-2 text-xs" onClick={enableReminder} title="Allow notifications for the daily plan reminder">
              <BellRing size={14} className="text-amber-300" /> Enable {settings.reminder.time} reminder
            </button>
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
