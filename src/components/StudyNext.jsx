import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Check, ImageUp, Plus, Sparkles, X } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Card, Empty, SectionHeader, Skeleton, YieldBadge, fmtMin } from './ui.jsx';

function SkipTray({ items, onDone }) {
  const { toast } = useApp();
  if (!items.length) return null;
  const act = async (t, approve) => {
    await (approve ? api.skipTopic(t.id) : api.keepTopic(t.id));
    toast(approve ? `Skipped “${t.title}”` : `Keeping “${t.title}” in your queue`, approve ? 'info' : 'success');
    onDone();
  };
  const all = async () => {
    for (const t of items) await api.skipTopic(t.id);
    toast(`Skipped ${items.length} low-yield topics`, 'info');
    onDone();
  };
  return (
    <Card className="mb-6 border-amber-400/15 p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-300">
            <AlertTriangle size={18} />
          </div>
          <div>
            <div className="font-display text-lg font-semibold text-white">Suggested to skip · needs your OK</div>
            <p className="text-sm text-slate-400">These rarely appear in past NEET SS Surgical papers. Nothing is skipped unless you approve it, and you can restore any topic from the Library.</p>
          </div>
        </div>
        {items.length > 1 && <button className="btn-ghost shrink-0" onClick={all}>Approve all ({items.length})</button>}
      </div>
      <ul className="mt-4 grid gap-2 md:grid-cols-2">
        {items.map((t) => (
          <li key={t.id} className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-white">{t.title}</div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500"><YieldBadge weight={t.weight} /> {t.yield_area}</div>
            </div>
            <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => act(t, false)}><X size={13} /> Keep</button>
            <button className="btn !border !border-amber-400/30 !bg-amber-500/10 !px-3 !py-1.5 text-xs text-amber-200 hover:!bg-amber-500/20" onClick={() => act(t, true)}><Check size={13} /> Approve skip</button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function StudyNext() {
  const { version, navigate, toast, refresh, today } = useApp();
  const [data, setData] = useState(null);
  const load = () => api.studyNext().then(setData);
  useEffect(() => {
    load();
  }, [version]);

  const add = async (t) => {
    try {
      if (today?.plan?.status === 'draft') {
        const c = await api.itemCost(t.id, 'new');
        await api.updatePlan([...today.plan.items, c]);
      } else {
        await api.addTopicToday(t.id);
      }
      toast(`“${t.title}” added to today`);
      refresh();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const max = data?.ranked?.[0]?.score || 1;

  return (
    <div>
      <SectionHeader
        eyebrow="Priority queue"
        title="Study next"
        subtitle="Ranked by how often each topic area has appeared in past NEET SS Surgical papers, then by video length and course order. Topics carried over from a missed day jump to the top."
      />
      {!data ? (
        <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : (
        <>
          <SkipTray items={data.suggestedSkips} onDone={load} />
          {!data.ranked.length ? (
            <Card>
              <Empty icon={ImageUp} title="Your queue is empty" action={<button className="btn-primary" onClick={() => navigate('import')}><ImageUp size={16} /> Import screenshots</button>}>
                Import screenshots of your video lessons and they’ll be ranked here.
              </Empty>
            </Card>
          ) : (
            <ol className="space-y-2.5">
              <AnimatePresence initial={false}>
                {data.ranked.map((t, i) => (
                  <motion.li key={t.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 12) * 0.03 } }} exit={{ opacity: 0 }}>
                    <Card className={`flex items-center gap-4 p-4 transition hover:border-white/[0.12] ${i < 3 ? 'ring-gradient' : ''}`}>
                      <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl font-display text-base font-semibold ${i < 3 ? 'bg-gradient-to-br from-violet-600 to-cyan-500 text-white shadow-glow' : 'bg-white/[0.04] text-slate-400'}`}>
                        {i + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-white">{t.title}</span>
                          {t.carryover ? <span className="chip border-rose-400/30 text-rose-300">carried over</span> : null}
                          {t.status === 'planned' && <span className="chip border-violet-400/30 text-violet-300">today</span>}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                          <YieldBadge weight={t.weight} />
                          <span>{t.yield_area}</span>
                          <span>· {fmtMin(t.duration_min)}</span>
                        </div>
                        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.04]">
                          <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400" style={{ width: `${(t.score / max) * 100}%` }} />
                        </div>
                      </div>
                      <div className="hidden text-right sm:block">
                        <div className="font-display text-lg text-white">{t.score}</div>
                        <div className="text-[10px] uppercase tracking-widest text-slate-600">score</div>
                      </div>
                      <button className="btn-ghost !px-3" onClick={() => add(t)} title="Add to today">
                        <Plus size={15} /> <span className="hidden md:inline">Today</span>
                      </button>
                    </Card>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>
          )}
          <p className="mt-6 flex items-center gap-2 text-xs text-slate-500">
            <Sparkles size={12} /> The built-in frequency weights are estimates. Fine-tune them per topic in the Library, or import your own past-paper counts as a CSV.
          </p>
        </>
      )}
    </div>
  );
}
