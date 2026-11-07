import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, BrainCircuit, Clock, Flame, ImageUp, Trophy, Sun } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import QuoteCard from './QuoteCard.jsx';
import AgentFeed from './AgentFeed.jsx';
import { StatusDonut, StudyTimeChart, SubjectBars, TopicsWeeklyChart } from './StudyCharts.jsx';
import { Card, ProgressRing, Segmented, Skeleton, YieldBadge, fmtMin } from './ui.jsx';

const fade = (i) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.05 * i, duration: 0.45, ease: [0.22, 1, 0.36, 1] } });

function Kpi({ icon: Icon, label, value, sub, accent, i }) {
  return (
    <motion.div {...fade(i)}>
      <Card className="h-full p-5">
        <div className="flex items-center justify-between">
          <span className="label">{label}</span>
          <div className={`grid h-9 w-9 place-items-center rounded-xl ${accent}`}>
            <Icon size={16} />
          </div>
        </div>
        <div className="mt-4 font-display text-3xl font-semibold tracking-tight text-white">{value}</div>
        <div className="mt-1 text-xs text-slate-500">{sub}</div>
      </Card>
    </motion.div>
  );
}

export default function Dashboard() {
  const { version, navigate, today, setCheckInOpen } = useApp();
  const [days, setDays] = useState(14);
  const [stats, setStats] = useState(null);
  const [next, setNext] = useState(null);

  useEffect(() => {
    api.stats(days).then(setStats).catch(() => {});
  }, [days, version]);
  useEffect(() => {
    api.studyNext().then(setNext).catch(() => {});
  }, [version]);

  const t = stats?.today;
  const pct = t?.total ? t.done / t.total : 0;

  return (
    <div className="space-y-6">
      <motion.div {...fade(0)}>
        <QuoteCard />
      </motion.div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <motion.div {...fade(1)}>
          <Card gradient className="flex h-full items-center gap-5 p-5">
            <ProgressRing value={pct} size={96} stroke={9} id="todayRing">
              <div className="font-display text-xl font-semibold text-white">{Math.round(pct * 100)}%</div>
            </ProgressRing>
            <div>
              <div className="label">Today</div>
              <div className="mt-1 font-display text-2xl font-semibold text-white">
                {t ? `${t.done}/${t.total}` : '–'} <span className="text-sm font-normal text-slate-400">tasks</span>
              </div>
              <div className="mt-1 text-xs text-slate-500">{t ? `${fmtMin(t.studied)} studied` : ' '}</div>
              {today?.checkInNeeded ? (
                <button className="mt-2 text-xs font-medium text-amber-300 hover:text-amber-200" onClick={() => setCheckInOpen(true)}>
                  <Sun size={12} className="mr-1 inline" /> Plan today →
                </button>
              ) : (
                <button className="mt-2 text-xs font-medium text-violet-300 hover:text-violet-200" onClick={() => navigate('today')}>
                  Open to-do list →
                </button>
              )}
            </div>
          </Card>
        </motion.div>
        <Kpi i={2} icon={Flame} label="Streak" value={stats ? `${stats.totals.streak}d` : '–'} sub="consecutive study days" accent="bg-orange-500/10 text-orange-300" />
        <Kpi i={3} icon={Clock} label="Total studied" value={stats ? fmtMin(stats.totals.totalMinutes) : '–'} sub={stats ? `${fmtMin(stats.totals.weekMinutes)} this week` : ''} accent="bg-cyan-500/10 text-cyan-300" />
        <Kpi
          i={4}
          icon={Trophy}
          label="Topics mastered"
          value={stats ? `${stats.totals.topicsDone}/${stats.totals.topicsTotal}` : '–'}
          sub={stats ? `${stats.totals.dueToday} recall${stats.totals.dueToday === 1 ? '' : 's'} due today` : ''}
          accent="bg-emerald-500/10 text-emerald-300"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <motion.div {...fade(5)} className="xl:col-span-2">
          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="label">Study time</div>
                <div className="mt-1 font-display text-xl font-semibold text-white">
                  {stats ? fmtMin(stats.series.reduce((a, b) => a + b.total, 0)) : '–'}
                  <span className="ml-2 text-sm font-normal text-slate-500">in the last {days} days</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden items-center gap-3 text-xs text-slate-400 sm:flex">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-violet-500" />New</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-cyan-400" />Recall</span>
                </div>
                <Segmented value={days} onChange={setDays} options={[{ value: 14, label: '14d' }, { value: 30, label: '30d' }]} />
              </div>
            </div>
            {stats ? <StudyTimeChart series={stats.series} /> : <Skeleton className="h-[260px]" />}
          </Card>
        </motion.div>
        <motion.div {...fade(6)}>
          <Card className="h-full p-5 sm:p-6">
            <div className="label mb-4">Topic progress</div>
            {stats ? <StatusDonut status={stats.status} /> : <Skeleton className="h-40" />}
            <div className="mt-6">{stats && <SubjectBars bySubject={stats.bySubject} />}</div>
          </Card>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <motion.div {...fade(7)}>
          <Card className="h-full p-5 sm:p-6">
            <div className="label mb-1">Topics per week</div>
            <div className="mb-3 text-sm text-slate-400">New topics finished vs. recall sessions</div>
            {stats ? <TopicsWeeklyChart weeks={stats.weeks} /> : <Skeleton className="h-[220px]" />}
          </Card>
        </motion.div>
        <motion.div {...fade(8)}>
          <Card className="h-full p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="label">Study next · highest yield</div>
              <button className="text-xs font-medium text-violet-300 hover:text-violet-200" onClick={() => navigate('next')}>
                All <ArrowRight size={12} className="inline" />
              </button>
            </div>
            {next?.ranked?.length ? (
              <ol className="space-y-2.5">
                {next.ranked.slice(0, 5).map((t, i) => (
                  <li key={t.id} className="flex items-center gap-3 rounded-xl border border-white/[0.04] bg-white/[0.02] p-3">
                    <span className="font-display text-sm font-semibold text-slate-500">{String(i + 1).padStart(2, '0')}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-white">{t.title}</div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                        <YieldBadge weight={t.weight} /> {fmtMin(t.duration_min)}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="flex flex-col items-center py-8 text-center">
                <ImageUp className="mb-3 text-slate-600" />
                <div className="text-sm text-slate-400">No topics yet.</div>
                <button className="btn-primary mt-4 !py-2 text-xs" onClick={() => navigate('import')}>
                  <ImageUp size={14} /> Import video screenshots
                </button>
              </div>
            )}
          </Card>
        </motion.div>
        <motion.div {...fade(9)}>
          <Card className="h-full p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="label">Agent activity</div>
              <BrainCircuit size={14} className="text-slate-600" />
            </div>
            <AgentFeed limit={6} />
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
