import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Cell, ReferenceLine } from 'recharts';
import { useIsDark, cssVar, inr, compactInr, niceDate, pct } from '../lib.js';
import { Card, Stat } from './ui.jsx';

function useChartColors() {
  const dark = useIsDark();
  return {
    dark,
    line: cssVar('--chart-1') || '#2a78d6',
    gain: cssVar('--chart-gain') || '#1baf7a',
    loss: cssVar('--chart-loss') || '#e34948',
    grid: cssVar('--chart-grid') || 'rgba(0,0,0,.08)',
    axis: cssVar('--chart-axis') || '#8e8e93',
    surface: `rgb(${cssVar('--card')})`,
  };
}

function Tip({ active, payload, label, fmt, labelFmt }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card rounded-2xl shadow-lift px-4 py-3 text-[14px] border hairline">
      <div className="text-ink2 font-semibold">{labelFmt ? labelFmt(label) : label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="num font-bold text-[16px] text-ink">
          {fmt ? fmt(p.value, p.payload) : p.value}
        </div>
      ))}
    </div>
  );
}

export function EquityChart({ data, height = 260, startValue }) {
  const c = useChartColors();
  if (!data?.length) return <div className="h-40 flex items-center justify-center text-ink3">No equity history yet</div>;
  const vals = data.map((d) => d.equity);
  const min = Math.min(...vals),
    max = Math.max(...vals);
  const pad = (max - min) * 0.1 || max * 0.02;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="eqfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.line} stopOpacity={0.22} />
            <stop offset="100%" stopColor={c.line} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={c.grid} />
        <XAxis dataKey="date" tickFormatter={niceDate} tick={{ fill: c.axis, fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={50} />
        <YAxis domain={[min - pad, max + pad]} tickFormatter={compactInr} tick={{ fill: c.axis, fontSize: 12 }} axisLine={false} tickLine={false} width={78} />
        {startValue && <ReferenceLine y={startValue} stroke={c.axis} strokeDasharray="4 4" />}
        <Tooltip content={<Tip fmt={(v) => inr(v)} labelFmt={niceDate} />} cursor={{ stroke: c.axis, strokeWidth: 1 }} />
        <Area type="monotone" dataKey="equity" stroke={c.line} strokeWidth={2} fill="url(#eqfill)" activeDot={{ r: 5, stroke: c.surface, strokeWidth: 2 }} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function MonthlyBars({ data, height = 220 }) {
  const c = useChartColors();
  if (!data?.length) return null;
  const rows = data.map((m) => ({ ...m, label: new Date(m.month + '-15').toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={c.grid} />
        <XAxis dataKey="label" tick={{ fill: c.axis, fontSize: 12 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tickFormatter={(v) => v + '%'} tick={{ fill: c.axis, fontSize: 12 }} axisLine={false} tickLine={false} width={44} />
        <ReferenceLine y={0} stroke={c.axis} />
        <Tooltip content={<Tip fmt={(v) => pct(v, 2)} />} cursor={{ fill: c.grid }} />
        <Bar dataKey="returnPct" radius={[4, 4, 4, 4]} maxBarSize={28} isAnimationActive={false}>
          {rows.map((r) => (
            <Cell key={r.month} fill={r.returnPct >= 0 ? c.gain : c.loss} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RBars({ data, height = 200 }) {
  const c = useChartColors();
  if (!data?.length) return null;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={c.grid} />
        <XAxis dataKey="label" tick={{ fill: c.axis, fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fill: c.axis, fontSize: 12 }} axisLine={false} tickLine={false} width={32} />
        <Tooltip content={<Tip fmt={(v) => `${v} trades`} />} cursor={{ fill: c.grid }} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false}>
          {data.map((r, i) => (
            <Cell key={r.label} fill={i < 2 ? c.loss : c.gain} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** The KPI grid + charts used by both the Dashboard and the Backtester. */
export function StatsBlock({ s, equity, startValue }) {
  const tone = (x) => (x > 0 ? 'text-mint' : x < 0 ? 'text-coral' : '');
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Stat label="Net profit" value={inr(s.netPnl)} sub={`after ${inr(s.charges)} charges`} tone={tone(s.netPnl)} big />
        <Stat label="Return" value={pct(s.totalReturnPct, 2)} sub={s.cagrPct != null ? `${pct(s.cagrPct)} a year` : `${inr(s.startEquity)} → ${inr(s.endEquity)}`} tone={tone(s.totalReturnPct)} big />
        <Stat label="Win rate" value={`${s.winRate}%`} sub={`${s.wins} wins · ${s.losses} losses`} big />
        <Stat label="Profit factor" value={s.profitFactor ?? '—'} sub="gross profit ÷ gross loss" big />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Stat label="Average win" value={pct(s.avgWinPct)} sub={`held ${s.avgHoldWin} days`} tone="text-mint" />
        <Stat label="Average loss" value={pct(s.avgLossPct)} sub={`held ${s.avgHoldLoss} days`} tone="text-coral" />
        <Stat label="Expectancy" value={pct(s.expectancyPct, 2)} sub={`${s.avgR}R per trade`} tone={tone(s.expectancyPct)} />
        <Stat label="Max drawdown" value={pct(s.maxDrawdownPct)} sub={s.payoff ? `win/loss ratio ${s.payoff}` : 'peak to trough'} tone={s.maxDrawdownPct < 0 ? 'text-coral' : ''} />
      </div>
      <Card className="p-5 sm:p-6">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-[19px] font-bold">Equity curve</h3>
          <span className="text-ink2 text-[14px]">dashed line = starting capital</span>
        </div>
        <EquityChart data={equity} startValue={startValue} />
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <h3 className="text-[19px] font-bold mb-3">Monthly returns</h3>
          {s.monthly?.length ? <MonthlyBars data={s.monthly} /> : <div className="text-ink3">No data yet</div>}
        </Card>
        <Card className="p-5 sm:p-6">
          <h3 className="text-[19px] font-bold">Trade outcomes in R</h3>
          <p className="text-ink2 text-[14px] mb-3">1R = the amount risked to the initial stop</p>
          <RBars data={s.rDistribution} />
        </Card>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <GroupTable title="By setup grade" subtitle="Are higher-rated setups really better?" rows={s.byGrade} />
        <GroupTable title="By exit type" rows={s.byExit} />
      </div>
      {(s.best || s.worst) && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {s.best && <Stat label="Best trade" value={pct(s.best.pct)} sub={`${s.best.symbol} · ${inr(s.best.net)}`} tone="text-mint" />}
          {s.worst && <Stat label="Worst trade" value={pct(s.worst.pct)} sub={`${s.worst.symbol} · ${inr(s.worst.net)}`} tone="text-coral" />}
        </div>
      )}
    </div>
  );
}

export function GroupTable({ title, subtitle, rows }) {
  return (
    <Card className="p-5 sm:p-6">
      <h3 className="text-[19px] font-bold">{title}</h3>
      {subtitle && <p className="text-ink2 text-[14px]">{subtitle}</p>}
      <table className="w-full mt-3 text-[16px]">
        <thead>
          <tr className="text-ink2 text-[13px] text-left">
            <th className="font-semibold py-1.5"></th>
            <th className="font-semibold text-right">Trades</th>
            <th className="font-semibold text-right">Win %</th>
            <th className="font-semibold text-right">Avg</th>
            <th className="font-semibold text-right">Net</th>
          </tr>
        </thead>
        <tbody className="num">
          {(rows || []).map((r) => (
            <tr key={r.key} className="border-t hairline">
              <td className="py-2.5 font-semibold">{r.key}</td>
              <td className="text-right">{r.trades}</td>
              <td className="text-right">{r.winRate}%</td>
              <td className={`text-right ${r.avgPct >= 0 ? 'text-mint' : 'text-coral'}`}>{pct(r.avgPct)}</td>
              <td className={`text-right font-semibold ${r.net >= 0 ? 'text-mint' : 'text-coral'}`}>{compactInr(r.net)}</td>
            </tr>
          ))}
          {!rows?.length && (
            <tr>
              <td colSpan={5} className="text-ink3 py-3">
                No closed trades yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}
