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
