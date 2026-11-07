import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtMin } from './ui.jsx';

const VIOLET = '#8b5cf6';
const CYAN = '#22d3ee';

const shortDate = (iso) => {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

function TipBox({ active, payload, label, fmt = (v) => v, labelFmt = (l) => l }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-strong px-3.5 py-2.5 text-xs">
      <div className="mb-1.5 font-medium text-white">{labelFmt(label)}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-slate-300">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.payload?.fill }} />
          {p.name}: <span className="font-display text-white">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function StudyTimeChart({ series }) {
  const data = series.map((d) => ({ ...d, label: d.date }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="gNew" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={VIOLET} stopOpacity={0.55} />
            <stop offset="100%" stopColor={VIOLET} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CYAN} stopOpacity={0.5} />
            <stop offset="100%" stopColor={CYAN} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickFormatter={shortDate} tickLine={false} axisLine={false} minTickGap={18} />
        <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => (v >= 60 ? `${Math.round(v / 6) / 10}h` : `${v}m`)} />
        <Tooltip content={<TipBox fmt={fmtMin} labelFmt={shortDate} />} />
        <Area type="monotone" dataKey="new" name="New topics" stackId="1" stroke={VIOLET} strokeWidth={2} fill="url(#gNew)" />
        <Area type="monotone" dataKey="revision" name="Active recall" stackId="1" stroke={CYAN} strokeWidth={2} fill="url(#gRev)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function TopicsWeeklyChart({ weeks }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={weeks} margin={{ top: 10, right: 4, left: -24, bottom: 0 }} barGap={3}>
        <defs>
          <linearGradient id="bNew" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#6d28d9" />
          </linearGradient>
          <linearGradient id="bRev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#67e8f9" />
            <stop offset="100%" stopColor="#0891b2" />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="week" tickFormatter={shortDate} tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
        <Tooltip content={<TipBox labelFmt={(l) => `Week of ${shortDate(l)}`} />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
        <Bar dataKey="topics" name="Topics finished" fill="url(#bNew)" radius={[6, 6, 2, 2]} maxBarSize={22} />
        <Bar dataKey="recalls" name="Recalls done" fill="url(#bRev)" radius={[6, 6, 2, 2]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const STATUS = [
  { key: 'done', name: 'Completed', color: '#34d399' },
  { key: 'planned', name: 'In today’s plan', color: VIOLET },
  { key: 'pending', name: 'Pending', color: '#334155' },
  { key: 'skipped', name: 'Skipped', color: '#f59e0b' },
];

export function StatusDonut({ status }) {
  const data = STATUS.map((s) => ({ ...s, value: status[s.key] || 0 })).filter((d) => d.value > 0);
  const total = data.reduce((a, b) => a + b.value, 0);
  return (
    <div className="flex items-center gap-5">
      <div className="relative h-[160px] w-[160px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data.length ? data : [{ name: 'None', value: 1, color: '#1a1d29' }]} dataKey="value" innerRadius={56} outerRadius={76} paddingAngle={data.length > 1 ? 3 : 0} stroke="none" startAngle={90} endAngle={-270}>
              {(data.length ? data : [{ color: '#1a1d29' }]).map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="font-display text-3xl font-semibold text-white">{total}</div>
            <div className="text-[10px] uppercase tracking-widest text-slate-500">topics</div>
          </div>
        </div>
      </div>
      <div className="space-y-2.5 text-sm">
        {STATUS.map((s) => (
          <div key={s.key} className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            <span className="text-slate-400">{s.name}</span>
            <span className="ml-auto pl-4 font-display text-white">{status[s.key] || 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SubjectBars({ bySubject }) {
  if (!bySubject.length) return null;
  return (
    <div className="space-y-3">
      {bySubject.slice(0, 7).map((s) => {
        const pct = s.total ? (s.done / s.total) * 100 : 0;
        return (
          <div key={s.subject}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-slate-300">{s.subject}</span>
              <span className="text-slate-500">
                <span className="text-white">{s.done}</span>/{s.total}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
              <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-all duration-700" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
