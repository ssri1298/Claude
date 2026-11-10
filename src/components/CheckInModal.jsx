import { useEffect, useState } from 'react';
import { Sun, Wand2, Minus, Plus } from 'lucide-react';
import { Modal, SpeedPicker, fmtMin, fmtSpeed } from './ui.jsx';
import { useApp } from '../store.jsx';
import { api } from '../api.js';

const PRESETS = [60, 120, 180, 240, 360, 480];

const nextQuarter = () => {
  const d = new Date();
  const m = Math.ceil((d.getHours() * 60 + d.getMinutes() + 5) / 15) * 15;
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** Morning check-in: "How much time do you have today?" */
export default function CheckInModal() {
  const { checkInOpen, setCheckInOpen, today, refresh, navigate, toast } = useApp();
  const [minutes, setMinutes] = useState(240);
  const [start, setStart] = useState('09:00');
  const [speed, setSpeed] = useState(1);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (checkInOpen) {
      setStart(nextQuarter());
      setSpeed(today?.settings?.playbackSpeed || 1);
    }
  }, [checkInOpen]);

  const close = () => {
    try {
      localStorage.setItem('scalpel.checkinDismissed', today?.date || '');
    } catch {}
    setCheckInOpen(false);
  };

  const submit = async () => {
    setBusy(true);
    try {
      const replan = today?.plan?.status === 'final';
      const r = await api.startDay(minutes, start, replan, speed);
      await refresh();
      setCheckInOpen(false);
      navigate('today');
      toast(`Planner drafted ${r.plan.items.length} blocks — review and finalize`, 'info');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const h = Math.floor(minutes / 60), m = minutes % 60;
  const share = today?.settings?.revisionShare ?? 0.3;
  const mult = today?.settings?.durationMultiplier ?? 1.25;
  // Lecture time that fits in the new-video share at this speed (after pauses/notes).
  const lecture = ((minutes * 0.9 * (1 - share)) / mult) * speed;

  return (
    <Modal open={checkInOpen} onClose={close} width="max-w-xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-amber-400/25 to-rose-500/20 ring-1 ring-amber-300/20">
          <Sun className="text-amber-300" size={22} />
        </div>
        <div>
          <div className="label text-amber-300/80">Morning check-in</div>
          <h2 className="font-display text-2xl font-semibold text-white">How much time do you have today?</h2>
        </div>
      </div>

      <div className="flex items-center justify-center gap-5 py-4">
        <button className="btn-ghost h-12 w-12 !p-0" onClick={() => setMinutes((v) => Math.max(15, v - 15))} aria-label="Less time">
          <Minus size={18} />
        </button>
        <div className="min-w-[200px] text-center">
          <div className="font-display text-6xl font-semibold tracking-tight text-white">
            {h}
            <span className="text-2xl text-slate-500">h</span> {String(m).padStart(2, '0')}
            <span className="text-2xl text-slate-500">m</span>
          </div>
        </div>
        <button className="btn-ghost h-12 w-12 !p-0" onClick={() => setMinutes((v) => Math.min(960, v + 15))} aria-label="More time">
          <Plus size={18} />
        </button>
      </div>

      <input type="range" className="range mt-2" min={15} max={720} step={15} value={minutes} onChange={(e) => setMinutes(+e.target.value)} aria-label="Available time" />
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {PRESETS.map((p) => (
          <button key={p} onClick={() => setMinutes(p)} className={`chip cursor-pointer px-3 py-1 text-xs ${minutes === p ? 'border-violet-400/50 bg-violet-500/20 text-white' : 'border-white/10 text-slate-400 hover:text-white'}`}>
            {fmtMin(p)}
          </button>
        ))}
      </div>

      <div className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="label">Video speed</span>
          <span className="text-[11px] text-slate-400">≈ {fmtMin(lecture)} of lectures fit at {fmtSpeed(speed)}</span>
        </div>
        <div className="mt-2"><SpeedPicker value={speed} onChange={setSpeed} id="checkin-speed" /></div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">Start at</span>
          <input type="time" className="input mt-2" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
          <div className="label">Planner split</div>
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-white/5">
            <div className="bg-gradient-to-r from-violet-600 to-violet-400" style={{ width: `${(1 - share) * 90}%` }} />
            <div className="bg-gradient-to-r from-cyan-500 to-cyan-300" style={{ width: `${share * 90}%` }} />
            <div className="bg-slate-600" style={{ width: '10%' }} />
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-slate-400">
            <span className="text-violet-300">New ~{fmtMin(minutes * 0.9 * (1 - share))}</span>
            <span className="text-cyan-300">Recall ~{fmtMin(minutes * 0.9 * share)}</span>
            <span>Breaks</span>
          </div>
        </div>
      </div>

      <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button className="btn-ghost" onClick={close}>Later</button>
        <button className="btn-primary" onClick={submit} disabled={busy}>
          <Wand2 size={16} /> {busy ? 'Planning…' : 'Build my plan'}
        </button>
      </div>
    </Modal>
  );
}
