import { useEffect, useState } from 'react';
import { FlaskConical, Play, Download } from 'lucide-react';
import { api, useApi, price, pct, signed, tone, niceDate } from '../lib.js';
import { Card, LargeTitle, Button, NumberField, Segmented, Row, List, Spinner, Empty, GradeBadge, Pill } from '../components/ui.jsx';
import { StatsBlock } from '../components/Charts.jsx';

export default function Backtest() {
  const settings = useApi('/settings');
  const last = useApi('/backtest/last');
  const [job, setJob] = useState(null);
  const [p, setP] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (settings.data && !p) {
      const r = settings.data.settings.rules;
      setP({ from: '', to: '', capital: settings.data.settings.paperCapital, minScore: r.minScore, positionPct: r.positionPct, maxStopPct: r.maxStopPct, trailMethod: r.trailMethod, marketFilter: settings.data.settings.marketFilter, reentry: r.reentry.enabled, precision: '15m' });
    }
  }, [settings.data]);

  useEffect(() => {
    if (!job || job.status !== 'running') return;
    const t = setInterval(async () => {
      try {
        const j = await api(`/backtest/${job.id}`);
        setJob(j);
        if (j.status !== 'running') last.reload();
      } catch {
        /* ignore */
      }
    }, 1000);
    return () => clearInterval(t);
  }, [job?.id, job?.status]);

  const run = async () => {
    setErr('');
    try {
      const r = await api('/backtest', {
        method: 'POST',
        body: {
          precision: p.precision,
          from: p.from || null,
          to: p.to || null,
          capital: p.capital,
          marketFilter: p.marketFilter,
          rules: { minScore: p.minScore, positionPct: p.positionPct, maxStopPct: p.maxStopPct, trailMethod: p.trailMethod, reentry: { ...settings.data.settings.rules.reentry, enabled: p.reentry } },
        },
      });
      setJob({ id: r.id, status: 'running', progress: 0 });
    } catch (e) {
      setErr(e.message);
    }
  };
  const history = async () => {
    try {
      await api('/agents/history', { method: 'POST', body: { years: 5 } });
      setErr('Downloading 5 years of daily data in the background (a few minutes). Watch the Agents page for progress.');
    } catch (e) {
      setErr(e.message);
    }
  };

  const result = job?.status === 'done' ? job.result : job?.status === 'running' ? null : last.data?.result;
  if (!p) return <Spinner />;
  const set = (k) => (v) => setP({ ...p, [k]: v });

  return (
    <div className="space-y-6">
      <LargeTitle title="Backtest" subtitle="Test the strategy on history" />
      <Card className="p-5 sm:p-6">
        <p className="text-ink2 text-[16px]">
          Replays the exact same Screener, Analyst and Executor rules day by day on past data — VCP detection, 10% sizing, 6% stops, ⅓ at +10%, breakeven, 21-EMA trail, market filter and re-entries — including Zerodha charges and slippage.
          {settings.data?.settings && <> History available from <b>{niceDate(settings.data.historyFrom)}</b>.</>}
        </p>
      </Card>
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div>
            <div className="text-[19px] font-bold">Precision</div>
            <div className="text-ink2 text-[15px]">
              {p.precision === '15m'
                ? 'Replays every 15-minute candle: breakouts trigger on a candle closing above the pivot with volume on pace; stops, the ⅓ profit and trails are checked candle by candle.'
                : 'Fast: one candle per day. Entry assumed at the pivot; if a day touches both stop and target, the stop is assumed first.'}
            </div>
          </div>
          <Segmented value={p.precision} onChange={set('precision')} options={[{ value: '15m', label: '15-minute candles' }, { value: 'daily', label: 'Daily (fast)' }]} />
        </div>
        {p.precision === '15m' && (
          <p className="text-ink3 text-[14px] mt-3">
            The first run downloads 15-minute candles from Zerodha for each breakout and the following ~90 trading days (a few minutes per year tested). They are saved, so later runs are fast. Needs today’s Kite login.
          </p>
        )}
      </Card>
      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <List>
          <Row title="From" subtitle="blank = earliest possible" right={<input type="date" value={p.from} onChange={(e) => set('from')(e.target.value)} className="bg-card2 rounded-xl px-3 py-2 text-[16px]" />} />
          <Row title="To" subtitle="blank = latest" right={<input type="date" value={p.to} onChange={(e) => set('to')(e.target.value)} className="bg-card2 rounded-xl px-3 py-2 text-[16px]" />} />
          <Row title="Starting capital" right={<NumberField value={p.capital} onChange={set('capital')} step={10000} width="w-36" suffix="₹" />} />
          <Row title="Position size" right={<NumberField value={p.positionPct} onChange={set('positionPct')} suffix="% each" width="w-20" />} />
          <Row title="Max stop" right={<NumberField value={p.maxStopPct} onChange={set('maxStopPct')} suffix="%" step={0.5} width="w-20" />} />
          <Row title="Minimum score" subtitle="65 = grade B" right={<NumberField value={p.minScore} onChange={set('minScore')} width="w-20" />} />
        </List>
        <List>
          <Row title="Trailing exit" subtitle="after ⅓ is sold at +10%">
            <Segmented
              size="sm"
              className="mt-2"
              value={p.trailMethod}
              onChange={set('trailMethod')}
              options={[
                { value: 'ema21', label: '21 EMA' },
                { value: 'pct10', label: '10% trail' },
                { value: 'sma50', label: '50 DMA' },
                { value: 'none', label: 'Breakeven' },
              ]}
            />
          </Row>
          <Row title="Market filter">
            <Segmented
              size="sm"
              className="mt-2"
              value={p.marketFilter}
              onChange={set('marketFilter')}
              options={[
                { value: 'pause', label: 'Pause in correction' },
                { value: 'half', label: 'Half size' },
                { value: 'off', label: 'Off' },
              ]}
            />
          </Row>
          <Row title="Re-entry after stop-out" right={<Segmented size="sm" value={p.reentry ? 'on' : 'off'} onChange={(v) => set('reentry')(v === 'on')} options={['on', 'off']} />} />
          <div className="p-4 flex flex-wrap gap-3">
            <Button icon={Play} onClick={run} loading={job?.status === 'running'} size="lg">
              Run backtest
            </Button>
            <Button icon={Download} tone="soft" onClick={history} size="lg">
              Get 5 years of data
            </Button>
          </div>
        </List>
      </div>
      {err && <Card className="p-4 text-[16px] font-semibold">{err}</Card>}
      {job?.status === 'running' && (
        <Card className="p-6">
          <div className="font-semibold mb-1">
            {{ scan: 'Step 1 of 3 · Finding breakout days…', download: 'Step 2 of 3 · Downloading 15-minute candles…', replay: 'Step 3 of 3 · Replaying candle by candle…', daily: 'Replaying history…' }[job.phase] || 'Working…'} {Math.round((job.progress || 0) * 100)}%
          </div>
          <div className="text-ink2 text-[14px] mb-3">
            {job.scan && <>{job.scan.candidateDays} breakout days found · </>}
            {job.download && <>{job.download.done}/{job.download.needed} downloads{job.download.cached ? ` · ${job.download.cached} already saved` : ''}{job.download.failed ? ` · ${job.download.failed} failed` : ''}</>}
          </div>
          <div className="h-3 rounded-full bg-card2 overflow-hidden">
            <div className="h-full bg-lav rounded-full transition-all" style={{ width: `${(job.progress || 0) * 100}%` }} />
          </div>
        </Card>
      )}
      {job?.status === 'error' && <Card className="p-5 text-coral font-semibold">{job.error}</Card>}
      {result ? <Results r={result} /> : job?.status !== 'running' && <Card><Empty icon={FlaskConical} title="No backtest yet" text="Run one to see how the rules would have performed." /></Card>}
    </div>
  );
}

function Results({ r }) {
  const s = r.signals;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 px-1">
        <h2 className="text-[22px] font-bold mr-2">
          Results {niceDate(r.params.from)} → {niceDate(r.params.to)}
        </h2>
        <Pill tone={r.params.resolution === '15minute' ? 'sky' : 'gray'}>{r.params.resolution === '15minute' ? '15-minute candles' : 'Daily candles'}</Pill>
        <Pill tone="lav">{s.total} breakouts</Pill>
        <Pill tone="mint">{s.taken} taken</Pill>
        <Pill tone="gray">{s.skippedScore} low score</Pill>
        <Pill tone="gray">{s.skippedStop} stop too wide</Pill>
        <Pill tone="gray">{s.skippedRegime} market filter</Pill>
        <Pill tone="gray">{s.skippedCapital} no capital</Pill>
      </div>
      <StatsBlock s={r.stats} equity={r.equity} startValue={r.params.capital} />
      <Card className="overflow-hidden">
        <div className="px-5 pt-5 pb-2 text-[19px] font-bold">Trades</div>
        <div className="divide-y hairline max-h-[560px] overflow-y-auto">
          {r.trades.map((t, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3">
              {t.grade && <GradeBadge grade={t.grade} />}
              <div className="flex-1 min-w-0">
                <div className="font-bold">
                  {t.symbol} {t.reentry && <span className="text-sky text-[13px]">re-entry</span>}
                </div>
                <div className="text-ink2 text-[14px] num">
                  {niceDate(t.entryDate)} {t.entryTime || ''} {price(t.entryPrice)} → {niceDate(t.exitDate)} {t.exitTime || ''} · {t.days}d · {{ stop: 'stop-loss', trail: 'trailing exit', partial: 'partial' }[t.reason] || t.reason} · {t.r}R
                </div>
              </div>
              <div className="text-right">
                <div className={`font-bold num ${tone(t.realized)}`}>{signed(t.realized)}</div>
                <div className={`num text-[14px] ${tone(t.pct)}`}>{pct(t.pct)}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <p className="text-ink3 text-[14px] px-1">
        {r.params.resolution === '15minute' ? (
          <>
            Replayed on 15-minute candles: buys fill at the close of the candle that closed above the pivot; inside a single candle that touches both the stop and the +10% target the stop is assumed first.
            {r.coverage && <> 15-minute data covered {r.coverage.entryPct ?? '—'}% of breakout days and {r.coverage.positionPct ?? '—'}% of holding days; the rest used daily candles.</>}
          </>
        ) : (
          <>Daily candles: entries assume a fill at the pivot (or the open on a gap), and when a day touches both the stop and the target the stop is assumed first.</>
        )}{' '}
        Past results do not guarantee future returns.
      </p>
    </div>
  );
}
