import { useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ReferenceArea } from 'recharts';
import { useApi, useIsDark, cssVar, niceDate } from '../lib.js';
import { Card, Section, Segmented, Pill, gradeTone } from './ui.jsx';

const PARTS = [
  ['trend', 'Trend template', 12],
  ['rs', 'Relative strength', 18],
  ['contractions', 'Contractions (VCP)', 20],
  ['volume', 'Volume behaviour', 15],
  ['base', 'Base structure', 10],
  ['proximity', 'Near 52-week high', 5],
  ['breakout', 'Breakout', 10],
  ['sector', 'Industry strength', 5],
  ['risk', 'Tight risk', 5],
];
const STAGE = { breakout: 'In buy zone', near: 'Near pivot', forming: 'Forming', extended: 'Extended', none: 'No setup' };

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="bg-card rounded-2xl shadow-lift px-4 py-3 text-[14px] border hairline">
      <div className="text-ink2 font-semibold">{niceDate(r.date)}</div>
      <div className="font-bold text-[17px] num">
        {r.score} <span className="text-ink2 font-semibold">({r.grade})</span>
      </div>
      <div className="text-ink2">
        {STAGE[r.stage] || r.stage} · RS {r.rs}
      </div>
    </div>
  );
}

export default function ScoreHistory({ symbol }) {
  const [range, setRange] = useState(63);
  const { data } = useApi(`/stock/${symbol}/scores?days=${range}`);
  const dark = useIsDark();
  if (!data) return null;
  const rows = data.rows;
  if (rows.length < 2)
    return (
      <Section title="Score history">
        <Card className="p-5 text-ink2">The daily score history is being built — it appears here after the next analysis.</Card>
      </Section>
    );

  const line = cssVar('--chart-1') || '#2a78d6';
  const grid = cssVar('--chart-grid');
  const axis = cssVar('--chart-axis');
  const first = rows[0];
  const last = rows[rows.length - 1];
  const change = last.score - first.score;
  const peak = rows.reduce((a, b) => (b.score > a.score ? b : a));
  const becameSetup = rows.find((r, i) => i > 0 && r.score >= data.minScore && rows[i - 1].score < data.minScore);
  const span = range <= 21 ? 'month' : range <= 63 ? '3 months' : '6 months';
  const band = (y1, y2, tone) => <ReferenceArea y1={y1} y2={y2} fill={tone} fillOpacity={dark ? 0.1 : 0.08} stroke="none" ifOverflow="hidden" />;

  return (
    <Section title="Score history" subtitle="How the Analyst's rating of this setup has changed day by day" action={<Segmented size="sm" value={range} onChange={setRange} options={[{ value: 21, label: '1M' }, { value: 63, label: '3M' }, { value: 126, label: '6M' }]} />}>
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Pill tone={gradeTone(last.grade)}>
            Now {last.score} · {last.grade}
          </Pill>
          <Pill tone={change > 0 ? 'mint' : change < 0 ? 'coral' : 'gray'}>
            {change > 0 ? '▲' : change < 0 ? '▼' : '•'} {Math.abs(change)} points in {span}
          </Pill>
          <Pill tone="gray">
            Best {peak.score} on {niceDate(peak.date)}
          </Pill>
          {becameSetup && <Pill tone="lav">Crossed your minimum on {niceDate(becameSetup.date)}</Pill>}
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={rows} margin={{ top: 14, right: 8, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="scorefill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={line} stopOpacity={0.25} />
                <stop offset="100%" stopColor={line} stopOpacity={0} />
              </linearGradient>
            </defs>
            {band(85, 100, '#1baf7a')}
            {band(75, 85, '#2a78d6')}
            {band(65, 75, '#6250d6')}
            <CartesianGrid vertical={false} stroke={grid} />
            <XAxis dataKey="date" tickFormatter={niceDate} tick={{ fill: axis, fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={40} />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 65, 75, 85, 100]} tick={{ fill: axis, fontSize: 12 }} axisLine={false} tickLine={false} width={40} />
            <ReferenceLine y={data.minScore} stroke={axis} strokeDasharray="4 4" label={{ value: `your minimum ${data.minScore}`, position: 'insideTopLeft', fill: axis, fontSize: 11 }} />
            <Tooltip content={<Tip />} cursor={{ stroke: axis, strokeWidth: 1 }} />
            <Area type="monotone" dataKey="score" stroke={line} strokeWidth={2} fill="url(#scorefill)" dot={false} activeDot={{ r: 5 }} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink2 mt-2">
          <span>Shaded: A+ (85+) · A (75–85) · B (65–75)</span>
          <span>Dashed: your minimum score to buy</span>
        </div>
        <p className="text-ink3 text-[13px] mt-2">Until a stock forms a valid VCP base and passes the trend template its score is capped at 49 (grade D), so a jump usually means a proper setup has just formed.</p>
      </Card>

      <h3 className="text-[17px] font-bold mt-6 mb-3 px-1">What moved the score</h3>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {PARTS.map(([key, label, max]) => {
          const series = rows.map((r) => ({ date: r.date, v: r.parts?.[key] ?? null }));
          const a = series.find((x) => x.v != null)?.v ?? 0;
          const b = series[series.length - 1]?.v ?? 0;
          const d = Math.round((b - a) * 10) / 10;
          return (
            <Card key={key} className="p-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-semibold text-ink2 truncate">{label}</span>
                <span className={`text-[12px] font-semibold num ${d > 0 ? 'text-mint' : d < 0 ? 'text-coral' : 'text-ink3'}`}>{d > 0 ? `+${d}` : d < 0 ? d : '±0'}</span>
              </div>
              <div className="num font-bold text-[18px]">
                {b}
                <span className="text-ink3 text-[13px] font-semibold">/{max}</span>
              </div>
              <ResponsiveContainer width="100%" height={44}>
                <LineChart data={series} margin={{ top: 4, right: 2, left: 2, bottom: 2 }}>
                  <YAxis hide domain={[0, max]} />
                  <Line type="monotone" dataKey="v" stroke={line} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          );
        })}
      </div>
    </Section>
  );
}
