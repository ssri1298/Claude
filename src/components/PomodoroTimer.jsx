import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Coffee, Minimize2, Pause, Play, RotateCcw, SkipForward, Timer, Unlink, Brain } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { ProgressRing } from './ui.jsx';

const KEY = 'scalpel.pomodoro';
const load = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || null;
  } catch {
    return null;
  }
};
const save = (s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
};

const INITIAL = { mode: 'focus', running: false, endsAt: null, remaining: null, round: 0, linked: null, accum: 0, segStart: null, firstStart: null };

function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [660, 880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 1);
    });
  } catch {}
}

const fmt = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

export default function PomodoroTimer() {
  const { settings, toast, refresh, navigate } = useApp();
  const cfg = settings?.pomodoro || { focus: 25, short: 5, long: 15, roundsBeforeLong: 4 };
  const [s, setS] = useState(() => ({ ...INITIAL, ...load() }));
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [prompt, setPrompt] = useState(null); // linked todo to offer ticking off
  const completing = useRef(false);

  const durFor = useCallback((mode) => (mode === 'focus' ? cfg.focus : mode === 'short' ? cfg.short : cfg.long) * 60, [cfg.focus, cfg.short, cfg.long]);
  const update = useCallback((patch) => setS((p) => {
    const n = typeof patch === 'function' ? patch(p) : { ...p, ...patch };
    save(n);
    return n;
  }), []);

  const total = durFor(s.mode);
  const remaining = s.running ? Math.max(0, (s.endsAt - now) / 1000) : s.remaining ?? total;
  const focusElapsed = s.mode === 'focus' ? s.accum + (s.running && s.segStart ? (now - s.segStart) / 1000 : 0) : 0;

  useEffect(() => {
    if (!s.running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [s.running]);

  // Link a to-do from anywhere (Today page "Focus" buttons)
  useEffect(() => {
    const onLink = (e) => {
      const td = e.detail;
      update((p) => ({ ...p, linked: { id: td.id, title: td.title, kind: td.kind }, mode: 'focus', ...(p.running ? {} : { remaining: null, accum: 0, firstStart: null }) }));
      setOpen(true);
      toast(`Pomodoro linked to “${td.title}”`, 'info');
    };
    window.addEventListener('pomodoro:link', onLink);
    return () => window.removeEventListener('pomodoro:link', onLink);
  }, [update, toast]);

  const logFocus = useCallback(async (seconds, state) => {
    const minutes = Math.round((seconds / 60) * 10) / 10;
    if (minutes < 1) return;
    try {
      await api.logSession({ minutes, todoId: state.linked?.id, startTs: new Date(state.firstStart || Date.now() - seconds * 1000).toISOString(), title: state.linked?.title });
      refresh();
    } catch (e) {
      toast(e.message, 'error');
    }
  }, [refresh, toast]);

  const start = () => {
    const t = Date.now();
    const rem = s.remaining ?? total;
    update({ running: true, endsAt: t + rem * 1000, segStart: s.mode === 'focus' ? t : null, firstStart: s.mode === 'focus' ? s.firstStart || t : null });
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  };
  const pause = () => update((p) => ({ ...p, running: false, remaining: Math.max(0, (p.endsAt - Date.now()) / 1000), accum: p.mode === 'focus' && p.segStart ? p.accum + (Date.now() - p.segStart) / 1000 : p.accum, segStart: null }));

  const switchMode = (mode, extra = {}) => update((p) => ({ ...p, mode, running: false, endsAt: null, remaining: null, accum: 0, segStart: null, firstStart: null, ...extra }));

  const reset = async () => {
    if (s.mode === 'focus' && focusElapsed >= 60) {
      await logFocus(focusElapsed, s);
      toast(`Logged ${Math.round(focusElapsed / 60)} min of focus`);
    }
    switchMode(s.mode);
  };

  const complete = useCallback(async () => {
    if (completing.current) return;
    completing.current = true;
    const st = s;
    chime();
    if (st.mode === 'focus') {
      const secs = st.accum + (st.segStart ? (Math.min(Date.now(), st.endsAt) - st.segStart) / 1000 : 0);
      await logFocus(secs, st);
      const round = st.round + 1;
      const next = round % cfg.roundsBeforeLong === 0 ? 'long' : 'short';
      toast(`Focus block done — ${Math.round(secs / 60)} min logged. Time for a ${next} break.`);
      try {
        if (Notification.permission === 'granted') new Notification('Scalpel · Focus complete', { body: `Take a ${next} break.` });
      } catch {}
      if (st.linked) setPrompt(st.linked);
      switchMode(next, { round });
    } else {
      toast('Break over — back to the table.', 'info');
      try {
        if (Notification.permission === 'granted') new Notification('Scalpel · Break over', { body: 'Ready for the next focus block?' });
      } catch {}
      switchMode('focus');
    }
    completing.current = false;
  }, [s, cfg.roundsBeforeLong, logFocus, switchMode, toast]);

  useEffect(() => {
    if (s.running && remaining <= 0) complete();
  }, [s.running, remaining, complete]);

  const tickLinked = async () => {
    const td = prompt;
    setPrompt(null);
    if (td.kind === 'revision') {
      navigate('today');
      toast('Tick the recall item to rate how well you remembered it', 'info');
      return;
    }
    try {
      await api.toggleTodo(td.id, true);
      update({ linked: null });
      await refresh();
      toast(`“${td.title}” ticked off`);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const progress = 1 - remaining / total;
  const modeMeta = {
    focus: { label: 'Focus', from: '#8b5cf6', to: '#22d3ee', icon: Brain },
    short: { label: 'Short break', from: '#34d399', to: '#22d3ee', icon: Coffee },
    long: { label: 'Long break', from: '#f59e0b', to: '#f43f5e', icon: Coffee },
  }[s.mode];

  return (
    <div className="fixed bottom-20 right-4 z-40 lg:bottom-6 lg:right-6">
      <AnimatePresence mode="wait">
        {!open ? (
          <motion.button
            key="pill"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            onClick={() => setOpen(true)}
            className={`glass-strong flex items-center gap-3 rounded-full py-2 pl-2 pr-4 ${s.running ? 'shadow-glow' : ''}`}
            aria-label="Open Pomodoro timer"
          >
            <ProgressRing value={progress} size={38} stroke={4} id="pomoMini" from={modeMeta.from} to={modeMeta.to}>
              <Timer size={14} className="text-slate-300" />
            </ProgressRing>
            <div className="text-left">
              <div className="font-display text-sm font-semibold tabular-nums text-white">{fmt(remaining)}</div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500">{s.running ? modeMeta.label : 'Pomodoro'}</div>
            </div>
          </motion.button>
        ) : (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="glass-strong ring-gradient w-[min(340px,calc(100vw-2rem))] p-5"
          >
            <div className="flex items-center justify-between">
              <div className="label flex items-center gap-1.5"><Timer size={12} /> Pomodoro</div>
              <button className="btn-icon h-8 w-8" onClick={() => setOpen(false)} aria-label="Minimise"><Minimize2 size={15} /></button>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1">
              {['focus', 'short', 'long'].map((m) => (
                <button key={m} onClick={() => switchMode(m)} className={`rounded-lg py-1.5 text-[11px] font-medium transition ${s.mode === m ? 'bg-white/[0.08] text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                  {m === 'focus' ? 'Focus' : m === 'short' ? 'Short' : 'Long'}
                </button>
              ))}
            </div>
            <div className="my-5 flex justify-center">
              <ProgressRing value={progress} size={190} stroke={12} id="pomoBig" from={modeMeta.from} to={modeMeta.to}>
                <div>
                  <div className="font-display text-5xl font-semibold tabular-nums tracking-tight text-white">{fmt(remaining)}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">{modeMeta.label}</div>
                </div>
              </ProgressRing>
            </div>
            <div className="mb-4 flex justify-center gap-1.5">
              {Array.from({ length: cfg.roundsBeforeLong }).map((_, i) => (
                <span key={i} className={`h-1.5 w-6 rounded-full ${i < s.round % cfg.roundsBeforeLong ? 'bg-gradient-to-r from-violet-500 to-cyan-400' : 'bg-white/10'}`} />
              ))}
            </div>
            {s.linked ? (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-violet-400/20 bg-violet-500/[0.07] px-3 py-2">
                <span className="text-[10px] uppercase tracking-widest text-violet-300">Studying</span>
                <span className="min-w-0 flex-1 truncate text-sm text-white">{s.linked.title}</span>
                <button className="btn-icon h-7 w-7" onClick={() => update({ linked: null })} title="Unlink" aria-label="Unlink"><Unlink size={13} /></button>
              </div>
            ) : (
              <p className="mb-4 text-center text-xs text-slate-500">Tip: press the <Timer size={11} className="inline" /> button on a to-do to link this timer to it.</p>
            )}
            <div className="flex items-center justify-center gap-3">
              <button className="btn-icon h-11 w-11 rounded-full border border-white/[0.08]" onClick={reset} title="Reset (logs partial focus)" aria-label="Reset"><RotateCcw size={17} /></button>
              <button
                className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-violet-600 to-cyan-500 text-white shadow-glow transition hover:brightness-110 active:scale-95"
                onClick={s.running ? pause : start}
                aria-label={s.running ? 'Pause' : 'Start'}
              >
                {s.running ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="translate-x-0.5" />}
              </button>
              <button className="btn-icon h-11 w-11 rounded-full border border-white/[0.08]" onClick={complete} title="Finish this block now" aria-label="Skip"><SkipForward size={17} /></button>
            </div>
            <div className="mt-4 text-center text-[11px] text-slate-500">
              {cfg.focus}/{cfg.short}/{cfg.long} min · round {s.round + (s.mode === 'focus' ? 1 : 0)} · focus time is logged to your calendar
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {prompt && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="glass-strong absolute bottom-full right-0 mb-3 w-[min(320px,calc(100vw-2rem))] p-4">
            <div className="text-sm text-white">Finished <span className="font-medium">“{prompt.title}”</span>?</div>
            <div className="mt-3 flex gap-2">
              <button className="btn-primary flex-1 !py-2 text-xs" onClick={tickLinked}><Check size={14} /> Tick it off</button>
              <button className="btn-ghost flex-1 !py-2 text-xs" onClick={() => setPrompt(null)}>Not yet</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
