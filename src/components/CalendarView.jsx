import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Coffee, CalendarDays } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Card, SectionHeader, fmtMin } from './ui.jsx';

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const KIND = {
  new: 'border-violet-400/30 bg-violet-500/10',
  revision: 'border-cyan-400/30 bg-cyan-500/10',
  break: 'border-white/5 bg-white/[0.02]',
  pomodoro: 'border-amber-400/30 bg-amber-500/10',
};

export default function CalendarView() {
  const { version, today } = useApp();
  const now = new Date();
  const [cursor, setCursor] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [month, setMonth] = useState(null);
  const [selected, setSelected] = useState(iso(now));
  const [day, setDay] = useState(null);
  const monthKey = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}`;

  useEffect(() => {
    api.month(monthKey).then(setMonth);
  }, [monthKey, version]);
  useEffect(() => {
    api.day(selected).then(setDay);
  }, [selected, version]);

  const cells = useMemo(() => {
    const first = new Date(cursor);
    const offset = (first.getDay() + 6) % 7;
    const daysIn = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const out = [];
    for (let i = 0; i < offset; i++) out.push(null);
    for (let d = 1; d <= daysIn; d++) out.push(iso(new Date(cursor.getFullYear(), cursor.getMonth(), d)));
    while (out.length % 7) out.push(null);
    return out;
  }, [cursor]);

  const maxMin = Math.max(60, ...Object.values(month?.days || {}).map((d) => d.total || 0));
  const todayIso = today?.date || iso(now);
  const monthTotal = Object.values(month?.days || {}).reduce((a, b) => a + (b.total || 0), 0);

  return (
    <div>
      <SectionHeader
        eyebrow="Calendar subagent"
        title="Study calendar"
        subtitle="Each finalized day is time-blocked here, and Pomodoro sessions are logged automatically. Cell colour shows how much you studied."
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-5 sm:p-6 lg:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <div className="font-display text-xl font-semibold text-white">{cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>
              <div className="text-xs text-slate-500">{fmtMin(monthTotal)} studied this month</div>
            </div>
            <div className="flex gap-1">
              <button className="btn-icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Previous month"><ChevronLeft size={18} /></button>
              <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => { setCursor(new Date(now.getFullYear(), now.getMonth(), 1)); setSelected(todayIso); }}>Today</button>
              <button className="btn-icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Next month"><ChevronRight size={18} /></button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-semibold uppercase tracking-widest text-slate-600 sm:gap-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="pb-1">{d.slice(0, window.innerWidth < 640 ? 1 : 3)}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const info = month?.days?.[d];
              const intensity = info?.total ? 0.15 + 0.75 * Math.min(1, info.total / maxMin) : 0;
              const sel = d === selected;
              return (
                <button
                  key={d}
                  onClick={() => setSelected(d)}
                  className={`relative aspect-square rounded-xl border p-1.5 text-left transition sm:p-2 ${sel ? 'border-violet-400/60 shadow-glow' : 'border-white/[0.05] hover:border-white/[0.15]'}`}
                  style={{ background: intensity ? `linear-gradient(135deg, rgba(139,92,246,${intensity}), rgba(34,211,238,${intensity * 0.6}))` : 'rgba(255,255,255,0.015)' }}
                >
                  <span className={`font-display text-xs sm:text-sm ${d === todayIso ? 'rounded-md bg-white px-1.5 text-ink-950' : 'text-slate-300'}`}>{Number(d.slice(8))}</span>
                  {info?.total > 0 && <span className="absolute bottom-1.5 right-2 hidden font-display text-[10px] text-white/90 sm:block">{fmtMin(info.total)}</span>}
                  {info?.missed > 0 && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-rose-400" title="Missed blocks" />}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex items-center justify-end gap-2 text-[10px] text-slate-500">
            Less
            {[0.15, 0.35, 0.6, 0.9].map((a) => <span key={a} className="h-3 w-3 rounded" style={{ background: `rgba(139,92,246,${a})` }} />)}
            More
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="label">{new Date(selected + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}</div>
          <div className="mt-1 font-display text-xl font-semibold text-white">{fmtMin(month?.days?.[selected]?.total || 0)} studied</div>
          <div className="mt-5 space-y-2">
            {!day?.events?.length && (
              <div className="flex flex-col items-center py-10 text-center text-sm text-slate-500">
                <CalendarDays className="mb-2 text-slate-600" /> No blocks on this day.
              </div>
            )}
            {day?.events?.map((e) => (
              <div key={e.id} className={`rounded-xl border px-3.5 py-2.5 ${KIND[e.kind]} ${e.status === 'missed' ? 'opacity-50' : ''}`}>
                <div className="flex items-center justify-between font-display text-[11px] text-slate-400">
                  <span>{e.start} – {e.end}</span>
                  <span className="uppercase tracking-wider">{e.status === 'scheduled' ? '' : e.status}</span>
                </div>
                <div className={`mt-0.5 truncate text-sm ${e.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-100'}`}>
                  {e.kind === 'break' && <Coffee size={12} className="mr-1 inline" />}
                  {e.title}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
