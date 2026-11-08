import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BrainCircuit, Check, ChevronDown, ChevronUp, Minus, Plus, RefreshCcw, Sparkles, Sun, Timer, Trash2, Trophy, Wand2, ListChecks, Coffee } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import RecallModal from './RecallModal.jsx';
import { Card, Empty, KindBadge, ProgressRing, SectionHeader, YieldBadge, fmtMin } from './ui.jsx';

export const linkPomodoro = (todo) => window.dispatchEvent(new CustomEvent('pomodoro:link', { detail: todo }));

function SplitBar({ items, available }) {
  const rev = items.filter((i) => i.kind === 'revision').reduce((a, b) => a + b.minutes, 0);
  const nw = items.filter((i) => i.kind === 'new').reduce((a, b) => a + b.minutes, 0);
  const total = Math.max(available, rev + nw, 1);
  const over = rev + nw > available;
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-white/[0.05]">
        <motion.div layout className="bg-gradient-to-r from-cyan-500 to-cyan-300" style={{ width: `${(rev / total) * 100}%` }} />
        <motion.div layout className="bg-gradient-to-r from-violet-600 to-violet-400" style={{ width: `${(nw / total) * 100}%` }} />
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-400">
        <span><span className="text-cyan-300">●</span> Recall {fmtMin(rev)}</span>
        <span><span className="text-violet-300">●</span> New videos {fmtMin(nw)}</span>
        <span className={over ? 'text-rose-300' : ''}>
          {over ? `Over by ${fmtMin(rev + nw - available)}` : `${fmtMin(available - rev - nw)} breaks & buffer`}
        </span>
      </div>
    </div>
  );
}

function PlanBuilder({ plan }) {
  const { refresh, toast } = useApp();
  const [items, setItems] = useState(plan.items);
  const [pool, setPool] = useState({ next: [], rev: [] });
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const saveTimer = useRef();

  useEffect(() => setItems(plan.items), [plan]);
  useEffect(() => {
    Promise.all([api.studyNext(), api.revision()]).then(([n, r]) => setPool({ next: n.ranked, rev: r }));
  }, []);

  const persist = (next) => {
    setItems(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => api.updatePlan(next).catch((e) => toast(e.message, 'error')), 350);
  };
  const move = (i, d) => {
    const n = [...items];
    const j = i + d;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j], n[i]];
    persist(n);
  };
  const adjust = (i, d) => persist(items.map((it, k) => (k === i ? { ...it, minutes: Math.max(5, it.minutes + d) } : it)));
  const remove = (i) => persist(items.filter((_, k) => k !== i));
  const add = async (topic, kind) => {
    const c = await api.itemCost(topic.id, kind);
    persist([...items, { ...c, weight: topic.weight, yield_area: topic.yield_area }]);
    setAdding(false);
  };
  const finalize = async () => {
    setBusy(true);
    clearTimeout(saveTimer.current);
    try {
      await api.updatePlan(items);
      const r = await api.finalize();
      await refresh();
      toast(`To-do subagent created ${r.todos.length} tasks · Calendar subagent blocked your day`);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const inPlan = new Set(items.map((i) => `${i.kind}:${i.topic_id}`));
  const notes = plan.notes || [];

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card gradient className="p-5 sm:p-6 lg:col-span-2">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="label text-violet-300/80">Draft plan</div>
            <div className="mt-1 font-display text-xl font-semibold text-white">
              {fmtMin(plan.available_min)} available from {plan.start_time}
            </div>
          </div>
          <span className="chip border-amber-400/30 bg-amber-500/10 text-amber-200">Review, reorder, then finalize</span>
        </div>
        <SplitBar items={items} available={plan.available_min} />

        <ul className="mt-6 space-y-2.5">
          <AnimatePresence initial={false}>
            {items.map((it, i) => (
              <motion.li
                key={`${it.kind}-${it.topic_id}`}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className={`group flex items-center gap-3 rounded-xl border bg-white/[0.02] p-3 sm:p-3.5 ${it.kind === 'revision' ? 'border-cyan-400/10' : 'border-violet-400/10'}`}
              >
                <div className="flex flex-col">
                  <button className="btn-icon h-6 w-6" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"><ChevronUp size={14} /></button>
                  <button className="btn-icon h-6 w-6" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Move down"><ChevronDown size={14} /></button>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white">{it.title}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <KindBadge kind={it.kind} />
                    {it.weight != null && <YieldBadge weight={it.weight} area={it.yield_area} />}
                  </div>
                </div>
                <div className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-ink-900/60 px-1">
                  <button className="btn-icon h-7 w-7" onClick={() => adjust(i, -5)} aria-label="Less"><Minus size={13} /></button>
                  <span className="w-12 text-center font-display text-sm text-white">{fmtMin(it.minutes)}</span>
                  <button className="btn-icon h-7 w-7" onClick={() => adjust(i, 5)} aria-label="More"><Plus size={13} /></button>
                </div>
                <button className="btn-icon text-slate-500 hover:text-rose-300" onClick={() => remove(i)} aria-label="Remove"><Trash2 size={15} /></button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        {!items.length && <div className="py-6 text-center text-sm text-slate-500">Plan is empty — add a topic below.</div>}

        {notes.map((n) => (
          <div key={n} className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/[0.06] px-4 py-3 text-xs text-amber-200">{n}</div>
        ))}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-between">
          <button className="btn-ghost" onClick={() => setAdding((v) => !v)}><Plus size={16} /> Add topic</button>
          <button className="btn-primary" onClick={finalize} disabled={busy || !items.length}>
            <Check size={16} /> {busy ? 'Finalizing…' : 'Finalize & create to-do list'}
          </button>
        </div>

        <AnimatePresence>
          {adding && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <div className="label mb-2">New videos (by yield)</div>
                  <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                    {pool.next.filter((t) => !inPlan.has(`new:${t.id}`)).slice(0, 30).map((t) => (
                      <button key={t.id} onClick={() => add(t, 'new')} className="flex w-full items-center gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2 text-left text-sm hover:border-violet-400/30">
                        <span className="min-w-0 flex-1 truncate text-slate-200">{t.title}</span>
                        <span className="text-xs text-slate-500">{fmtMin(t.duration_min)}</span>
                      </button>
                    ))}
                    {!pool.next.length && <div className="text-xs text-slate-500">No pending topics.</div>}
                  </div>
                </div>
                <div>
                  <div className="label mb-2">Recall (studied topics)</div>
                  <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                    {pool.rev.filter((t) => !inPlan.has(`revision:${t.id}`)).slice(0, 30).map((t) => (
                      <button key={t.id} onClick={() => add(t, 'revision')} className="flex w-full items-center gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2 text-left text-sm hover:border-cyan-400/30">
                        <span className="min-w-0 flex-1 truncate text-slate-200">{t.title}</span>
                        {t.due && <span className="text-[10px] text-cyan-300">due</span>}
                      </button>
                    ))}
                    {!pool.rev.length && <div className="text-xs text-slate-500">Nothing studied yet.</div>}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      <Card className="h-fit p-5 sm:p-6">
        <div className="label mb-3">How the planner decided</div>
        <ul className="space-y-3 text-sm text-slate-400">
          <li className="flex gap-2.5"><BrainCircuit size={16} className="mt-0.5 shrink-0 text-cyan-300" /> Overdue recalls go first so memories don’t decay (spaced repetition 1 → 3 → 7 → 14+ days).</li>
          <li className="flex gap-2.5"><Sparkles size={16} className="mt-0.5 shrink-0 text-violet-300" /> New videos are picked by past NEET SS frequency, then length, then course order.</li>
          <li className="flex gap-2.5"><Timer size={16} className="mt-0.5 shrink-0 text-amber-300" /> Video time × {plan.multiplier ?? '1.25'} for pausing and notes, plus a break buffer.</li>
          <li className="flex gap-2.5"><ListChecks size={16} className="mt-0.5 shrink-0 text-emerald-300" /> Finalizing hands the list to the To-do and Calendar subagents.</li>
        </ul>
      </Card>
    </div>
  );
}

function Celebration() {
  const { refresh, toast } = useApp();
  const [minutes, setMinutes] = useState(60);
  const [busy, setBusy] = useState(false);
  const extend = async (mode) => {
    setBusy(true);
    try {
      const r = await api.extendDay(mode, minutes);
      await refresh();
      if (r.added) toast(`Added ${r.added} ${mode === 'new' ? 'new topic' : 'recall block'}${r.added > 1 ? 's' : ''} to today`);
      else toast(r.notes?.[0] || 'Nothing to add', 'info');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
      <Card gradient className="relative overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-60 w-60 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center">
          <div className="grid h-16 w-16 shrink-0 animate-float place-items-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 shadow-[0_10px_40px_-10px_rgba(251,191,36,.6)]">
            <Trophy className="text-white" size={28} />
          </div>
          <div className="flex-1">
            <div className="font-display text-2xl font-semibold text-white">Today’s list is done. Brilliant work.</div>
            <p className="mt-1 text-sm text-slate-400">Still have energy? Pull in more high-yield topics, or keep consolidating with active recall.</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {[30, 60, 90, 120].map((m) => (
                <button key={m} onClick={() => setMinutes(m)} className={`chip cursor-pointer px-3 py-1 text-xs ${minutes === m ? 'border-violet-400/50 bg-violet-500/20 text-white' : 'border-white/10 text-slate-400'}`}>
                  +{fmtMin(m)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row md:flex-col">
            <button className="btn-primary" disabled={busy} onClick={() => extend('new')}><Sparkles size={16} /> Add more topics</button>
            <button className="btn-ghost" disabled={busy} onClick={() => extend('revision')}><BrainCircuit size={16} /> Continue revision</button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

function TodoList({ todos, events }) {
  const { refresh, toast } = useApp();
  const [recall, setRecall] = useState(null);
  const slot = useMemo(() => Object.fromEntries(events.filter((e) => e.todo_id && e.kind !== 'pomodoro').map((e) => [e.todo_id, e])), [events]);

  const toggle = async (td, done, extra) => {
    try {
      const r = await api.toggleTodo(td.id, done, extra);
      await refresh();
      if (done && r.allDone) toast('Every task ticked off — day complete! 🎉');
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  const onCheck = (td) => {
    if (td.status === 'done') return toggle(td, false);
    if (td.kind === 'revision') return setRecall(td);
    return toggle(td, true);
  };
  const remove = async (td) => {
    await api.removeTodo(td.id);
    refresh();
  };

  const done = todos.filter((t) => t.status === 'done').length;
  const sections = [
    { kind: 'revision', title: 'Active recall', icon: BrainCircuit, color: 'text-cyan-300' },
    { kind: 'new', title: 'New video topics', icon: Sparkles, color: 'text-violet-300' },
  ];

  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-5 flex items-center gap-4">
        <ProgressRing value={todos.length ? done / todos.length : 0} size={64} stroke={6} id="todoRing">
          <span className="font-display text-sm font-semibold text-white">{done}/{todos.length}</span>
        </ProgressRing>
        <div>
          <div className="label">To-do list</div>
          <div className="font-display text-xl font-semibold text-white">{todos.length - done ? `${todos.length - done} to go` : 'All clear'}</div>
          <div className="text-xs text-slate-500">
            {fmtMin(todos.filter((t) => t.status === 'done').reduce((a, b) => a + b.minutes, 0))} of {fmtMin(todos.reduce((a, b) => a + b.minutes, 0))}
          </div>
        </div>
      </div>
      {sections.map(({ kind, title, icon: Icon, color }) => {
        const list = todos.filter((t) => t.kind === kind);
        if (!list.length) return null;
        return (
          <div key={kind} className="mt-5 first-of-type:mt-0">
            <div className={`mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] ${color}`}>
              <Icon size={14} /> {title}
            </div>
            <ul className="space-y-2">
              {list.map((td) => {
                const isDone = td.status === 'done';
                const ev = slot[td.id];
                return (
                  <motion.li layout key={td.id} className={`group flex items-center gap-3 rounded-xl border p-3 transition sm:p-3.5 ${isDone ? 'border-emerald-400/10 bg-emerald-500/[0.03]' : 'border-white/[0.05] bg-white/[0.02] hover:border-white/[0.1]'}`}>
                    <button
                      onClick={() => onCheck(td)}
                      aria-label={isDone ? 'Mark not done' : 'Mark done'}
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border-2 transition ${isDone ? 'border-emerald-400 bg-emerald-400 text-ink-950' : kind === 'revision' ? 'border-cyan-400/40 hover:border-cyan-300' : 'border-violet-400/40 hover:border-violet-300'}`}
                    >
                      <AnimatePresence>{isDone && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}><Check size={16} strokeWidth={3} /></motion.span>}</AnimatePresence>
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className={`truncate text-sm font-medium transition ${isDone ? 'text-slate-500 line-through decoration-slate-600' : 'text-white'}`}>{td.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                        {ev && <span className="font-display text-slate-400">{ev.start}–{ev.end}</span>}
                        <span>{fmtMin(td.minutes)}</span>
                        {td.weight != null && <YieldBadge weight={td.weight} area={td.yield_area} />}
                      </div>
                    </div>
                    {!isDone && (
                      <>
                        <button className="btn-icon text-slate-500 hover:text-amber-300" title="Focus with Pomodoro" onClick={() => linkPomodoro(td)} aria-label="Focus with Pomodoro"><Timer size={16} /></button>
                        <button className="btn-icon hidden text-slate-600 hover:text-rose-300 group-hover:inline-flex" title="Remove from today" onClick={() => remove(td)} aria-label="Remove"><Trash2 size={15} /></button>
                      </>
                    )}
                  </motion.li>
                );
              })}
            </ul>
          </div>
        );
      })}
      <RecallModal
        topic={recall}
        onClose={() => setRecall(null)}
        onSubmit={async (rating, notes) => {
          await toggle(recall, true, { rating, notes });
          setRecall(null);
        }}
      />
    </Card>
  );
}

function DayTimeline({ events }) {
  if (!events.length) return null;
  const color = { new: 'bg-violet-400', revision: 'bg-cyan-400', break: 'bg-slate-600', pomodoro: 'bg-amber-400' };
  return (
    <Card className="p-5 sm:p-6">
      <div className="label mb-4">Today’s timeline · Calendar subagent</div>
      <ol className="relative space-y-3 before:absolute before:bottom-1 before:left-[5px] before:top-1 before:w-px before:bg-white/[0.07]">
        {events.map((e) => (
          <li key={e.id} className="relative flex gap-3 pl-0">
            <span className={`relative z-10 mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full ring-4 ring-ink-950 ${color[e.kind]} ${e.status === 'done' ? 'opacity-40' : ''}`} />
            <div className="min-w-0">
              <div className="font-display text-xs text-slate-500">{e.start} – {e.end}</div>
              <div className={`truncate text-sm ${e.kind === 'break' ? 'text-slate-500' : e.status === 'done' ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                {e.kind === 'break' && <Coffee size={12} className="mr-1 inline" />}
                {e.title}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

export default function TodayPage() {
  const { today, setCheckInOpen, refresh, toast } = useApp();
  if (!today) return null;
  const { plan, todos, events, allDone } = today;
  const dateStr = new Date(today.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  const replan = async () => {
    try {
      await api.resetDay();
      await refresh();
      setCheckInOpen(true);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <div>
      <SectionHeader
        eyebrow={dateStr}
        title="Today’s operating list"
        subtitle="Your daily plan: fresh video topics plus active recall of what you’ve already covered."
        right={
          plan && !todos.some((t) => t.status === 'done') && (
            <button className="btn-ghost" onClick={plan.status === 'final' ? replan : () => setCheckInOpen(true)}>
              <RefreshCcw size={15} /> Re-plan
            </button>
          )
        }
      />
      {!plan ? (
        <Card>
          <Empty
            icon={Sun}
            title="Good morning. Let’s plan your day."
            action={<button className="btn-primary" onClick={() => setCheckInOpen(true)}><Wand2 size={16} /> How much time do I have?</button>}
          >
            Tell the planner how much time you have and it will split it between new high-yield videos and active recall.
          </Empty>
        </Card>
      ) : plan.status === 'draft' ? (
        <PlanBuilder plan={{ ...plan, multiplier: today.settings.durationMultiplier }} />
      ) : (
        <div className="space-y-5">
          {allDone && <Celebration />}
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <TodoList todos={todos} events={events} />
            </div>
            <DayTimeline events={events} />
          </div>
        </div>
      )}
    </div>
  );
}
