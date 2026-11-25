import { useState } from 'react';
import { useApi, go, signed, tone, pct, niceDate } from '../lib.js';
import { Card, LargeTitle, Segmented, Spinner, Section, GradeBadge, Toggle } from '../components/ui.jsx';
import { Lightbulb } from 'lucide-react';
import { StatsBlock } from '../components/Charts.jsx';

export default function Stats() {
  const ov = useApi('/overview');
  const [kind, setKind] = useState(null);
  const k = kind || ov.data?.mode || 'paper';
  const { data } = useApi(`/stats?kind=${k}`, { interval: 30000, events: ['positions'] });
  return (
    <div>
      <LargeTitle title="Dashboard" subtitle="Performance" />
      <Segmented
        value={k}
        onChange={setKind}
        className="mb-2"
        options={[
          { value: 'paper', label: 'Paper' },
          { value: 'live', label: 'Live' },
          { value: 'shadow', label: 'Shadow' },
        ]}
      />
      <p className="text-ink2 text-[15px] mb-5 px-1">
        {k === 'shadow' ? 'Signals that were not taken (no capital, market filter, rejected, low score) — tracked with the same exit rules.' : k === 'live' ? 'Real trades in your Zerodha account placed by Pivot.' : 'Practice trades on live prices with pretend money.'}
      </p>
      {!data ? (
        <Spinner />
      ) : (
        <>
          <StatsBlock s={data.stats} equity={k === 'shadow' ? [] : data.equity} startValue={data.stats.startEquity} />
          <ReportCard kind={k} />
          <BreakoutChecks />
          {data.recent.length > 0 && (
            <Section title="Recent closed trades" className="mt-7">
              <Card className="divide-y hairline overflow-hidden">
                {data.recent.map((t) => (
                  <button key={t.id} onClick={() => go(`/stock/${t.symbol}`)} className="w-full text-left flex items-center gap-3 px-4 sm:px-5 py-3.5 hover:bg-card2/50">
                    {t.grade && <GradeBadge grade={t.grade} />}
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-[18px]">{t.symbol}</div>
                      <div className="text-ink2 text-[14px]">
                        {niceDate(t.exitDate)} · {t.exitReason} · {t.holdDays}d · {t.rMultiple}R
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-bold num ${tone(t.realized)}`}>{signed(t.realized)}</div>
                      <div className={`num text-[14px] ${tone(t.pnlPct)}`}>{pct(t.pnlPct)}</div>
                    </div>
                  </button>
                ))}
              </Card>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Res({ r, strong }) {
  if (!r?.n) return <span className="text-ink3">—</span>;
  return (
    <span className="num">
      <b className={strong ? 'text-[17px]' : ''}>{r.winRate}%</b> <span className="text-ink2 text-[13px]">win · </span>
      <span className={r.avgPct >= 0 ? 'text-mint' : 'text-coral'}>{pct(r.avgPct)}</span>
      <span className="text-ink3 text-[13px]"> · {r.n}</span>
    </span>
  );
}

/** How well each confirmation check separated real breakouts from false ones. */
function BreakoutChecks() {
  const { data } = useApi('/checks-stats', { events: ['positions'] });
  if (!data) return null;
  return (
    <Section title="Breakout checks" subtitle="Every breakout is tracked from its first tick above the pivot — do the checks pick the winners?" className="mt-7">
      {data.all.n === 0 ? (
        <Card className="p-5 text-ink2 text-[16px]">
          Collecting data{data.open ? ` — ${data.open} breakouts being tracked now` : ''}. Results appear here as these tracked breakouts finish (stop, trail or failed exit).
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="p-4">
              <div className="text-ink2 text-[14px] font-semibold">Buying every first tick</div>
              <div className="mt-1"><Res r={data.all} strong /></div>
            </Card>
            <Card className="p-4">
              <div className="text-ink2 text-[14px] font-semibold">Breakouts that confirmed</div>
              <div className="mt-1"><Res r={data.confirmed} strong /></div>
            </Card>
            <Card className="p-4">
              <div className="text-ink2 text-[14px] font-semibold">Breakouts that never confirmed</div>
              <div className="mt-1"><Res r={data.notConfirmed} strong /></div>
            </Card>
          </div>
          <Card className="overflow-hidden">
            <div className="grid grid-cols-[1.3fr_1fr_1fr] gap-2 px-4 sm:px-5 py-3 text-[13px] font-semibold text-ink2 border-b hairline">
              <span>Check</span>
              <span>When passed</span>
              <span>When failed</span>
            </div>
            <div className="divide-y hairline">
              {data.byCheck.map((c) => (
                <div key={c.key} className="grid grid-cols-[1.3fr_1fr_1fr] gap-2 px-4 sm:px-5 py-3 text-[15px] items-center">
                  <span className="font-semibold leading-snug">{c.label}</span>
                  <Res r={c.passed} />
                  <Res r={c.failed} />
                </div>
              ))}
            </div>
          </Card>
          <p className="text-ink3 text-[14px] px-1">A useful check shows a clearly higher win rate and average result when passed than when failed. Give it 30+ breakouts before drawing conclusions.</p>
        </div>
      )}
    </Section>
  );
}

/** Your own trades grouped by the conditions when you bought them — which rules really work for you. */
function ReportCard({ kind }) {
  const [dim, setDim] = useState('score');
  const [withShadow, setWithShadow] = useState(false);
  const { data } = useApi(`/report-card?kind=${kind}${withShadow ? '&shadow=1' : ''}`, { events: ['positions'] });
  if (!data) return null;
  const d = data.dimensions.find((x) => x.key === dim) || data.dimensions[0];
  const maxAbs = Math.max(0.01, ...d.buckets.map((b) => Math.abs(b.avgR || 0)));
  return (
    <Section title="Rule report card" subtitle="Your closed trades, grouped by the conditions when you bought" className="mt-7">
      {data.tips.length > 0 && (
        <Card className="p-4 sm:p-5 mb-4 ring-1 ring-butter/40">
          <div className="flex items-center gap-2 font-bold text-[17px]">
            <Lightbulb size={20} className="text-butter" /> Suggestions from your trades
          </div>
          <ul className="mt-2 space-y-2 text-[15px]">
            {data.tips.map((t, i) => (
              <li key={i}>
                • {t.text} <button onClick={() => go(t.area === 'Selling rules' ? '/settings/selling' : '/settings/buying')} className="text-accent font-semibold">Settings → {t.area}</button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="overflow-x-auto no-scrollbar -mx-1 px-1 max-w-full">
            <Segmented size="sm" value={dim} onChange={setDim} options={data.dimensions.map((x) => ({ value: x.key, label: x.label }))} />
          </div>
          {kind !== 'shadow' && (
            <label className="flex items-center gap-2 text-[14px] text-ink2">
              Include shadow trades <Toggle checked={withShadow} onChange={setWithShadow} label="Include shadow trades" />
            </label>
          )}
        </div>
        {data.overall.trades === 0 ? (
          <p className="text-ink2 mt-4">No closed trades yet. The report card fills in as trades close.</p>
        ) : d.buckets.length === 0 ? (
          <p className="text-ink2 mt-4">No trades with this information yet — it is recorded for trades bought after this update.</p>
        ) : (
          <div className="mt-4 divide-y hairline">
            {d.buckets.map((b) => (
              <div key={b.label} className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold text-[16px]">{b.label}</span>
                  <span className={`num font-bold text-[17px] ${tone(b.avgR)}`}>
                    {b.avgR > 0 ? '+' : ''}
                    {b.avgR}R
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <div className="flex-1 h-2 rounded-full bg-card2 overflow-hidden relative">
                    <div className={`absolute inset-y-0 rounded-full ${b.avgR >= 0 ? 'bg-mint left-1/2' : 'bg-coral right-1/2'}`} style={{ width: `${(Math.abs(b.avgR) / maxAbs) * 50}%` }} />
                    <div className="absolute inset-y-0 left-1/2 w-px bg-ink3/40" />
                  </div>
                </div>
                <div className="text-ink2 text-[13px] num mt-1">
                  {b.trades} {b.trades === 1 ? 'trade' : 'trades'} · {b.winRate}% wins · average {pct(b.avgPct)} · {signed(b.pnl)}
                  {b.trades < data.minTrades && <span className="text-ink3"> · too few to judge</span>}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-ink3 text-[13px] mt-3">
          R = profit or loss in units of the risk taken (1R = what the stop would have lost). Overall: {data.overall.trades} trades, {data.overall.winRate ?? '—'}% wins, average {data.overall.avgR ?? '—'}R. Suggestions appear once a group has at least {data.minTrades} trades.
        </p>
      </Card>
    </Section>
  );
}
