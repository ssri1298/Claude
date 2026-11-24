import { useState } from 'react';
import { useApi, go, signed, tone, pct, niceDate } from '../lib.js';
import { Card, LargeTitle, Segmented, Spinner, Section, GradeBadge } from '../components/ui.jsx';
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
