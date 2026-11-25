import { useEffect, useState } from 'react';
import { FlaskConical, Play, Download } from 'lucide-react';
import { api, useApi, price, pct, signed, tone, niceDate } from '../lib.js';
import { Card, LargeTitle, Button, NumberField, Segmented, Row, List, Spinner, Empty, GradeBadge, Pill } from '../components/ui.jsx';
import { StatsBlock } from '../components/Charts.jsx';
import Optimizer from '../components/Optimizer.jsx';

export default function Backtest() {
  const settings = useApi('/settings');
  const last = useApi('/backtest/last');
  const [job, setJob] = useState(null);
  const [p, setP] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (settings.data && !p) {
      const r = settings.data.settings.rules;
      setP({ from: '', to: '', capital: settings.data.settings.paperCapital, minScore: r.minScore, positionPct: r.positionPct, maxStopPct: r.maxStopPct, trailMethod: r.trailMethod, marketFilter: settings.data.settings.marketFilter, reentry: r.reentry.enabled, confirm: r.confirm.enabled, twoStage: r.twoStage.enabled, failedExit: r.failedExit.enabled, timeExit: !!r.timeExit?.enabled, timeExitDays: r.timeExit?.days || 7, precision: '15m', compounding: true, sizing: r.sizing?.method || 'percent' });
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

  // Run a 15-minute backtest with the optimiser's recommended settings (without saving them)
  const verify = async (patch) => {
    setErr('');
    try {
      const r = await api('/backtest', { method: 'POST', body: { precision: '15m', marketFilter: patch.marketFilter, rules: patch.rules } });
      setJob({ id: r.id, status: 'running', progress: 0 });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setErr(e.message);
    }
  };
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
          compounding: p.compounding,
          rules: { sizing: { ...settings.data.settings.rules.sizing, method: p.sizing }, minScore: p.minScore, positionPct: p.positionPct, maxStopPct: p.maxStopPct, trailMethod: p.trailMethod, reentry: { ...settings.data.settings.rules.reentry, enabled: p.reentry }, confirm: { ...settings.data.settings.rules.confirm, enabled: p.confirm }, twoStage: { ...settings.data.settings.rules.twoStage, enabled: p.twoStage }, failedExit: { ...settings.data.settings.rules.failedExit, enabled: p.failedExit }, timeExit: { enabled: p.timeExit, days: Math.max(1, Math.min(60, Math.round(p.timeExitDays || 7))) } },
        },
      });
      setJob({ id: r.id, status: 'running', progress: 0 });
    } catch (e) {
      setErr(e.message);
    }
  };
  const history = async () => {
    try {
      await api('/agents/history', { method: 'POST', body: { years: 11 } });
      setErr('Downloading 10 years (+1 for warm-up) of daily data in the background (a few minutes). Watch the Agents page for progress.');
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
          <Row title="Breakout confirmation" subtitle={p.precision === '15m' ? '15-min close above the pivot, VWAP, range position, gap rule' : 'Daily data: strong close above the pivot, bought at the close'} right={<Segmented size="sm" value={p.confirm ? 'on' : 'off'} onChange={(v) => set('confirm')(v === 'on')} options={['on', 'off']} />} />
          <Row title="Two-stage buy" subtitle={p.precision === '15m' ? 'Half at the breakout, rest at 15:15 if it holds' : 'Half at the breakout, rest at the close if it holds'} right={<Segmented size="sm" value={p.twoStage ? 'on' : 'off'} onChange={(v) => set('twoStage')(v === 'on')} options={['on', 'off']} />} />
          <Row title="Sell failed breakouts" subtitle="Close back below the pivot" right={<Segmented size="sm" value={p.failedExit ? 'on' : 'off'} onChange={(v) => set('failedExit')(v === 'on')} options={['on', 'off']} />} />
          <Row title="Time exit" subtitle={p.timeExit ? `No stop and no +10% after ${p.timeExitDays} trading days → sell at the close` : 'Off — trades are held until the stop or the +10% target'} right={<Segmented size="sm" value={p.timeExit ? 'on' : 'off'} onChange={(v) => set('timeExit')(v === 'on')} options={['on', 'off']} />} />
          <Row title="Compounding" subtitle={p.compounding ? 'Each trade is sized from the account value at the time — profits grow the next trades' : 'Each trade is sized from the starting capital — shows the rules without the effect of compounding'} right={<Segmented size="sm" value={p.compounding ? 'on' : 'off'} onChange={(v) => set('compounding')(v === 'on')} options={['on', 'off']} />} />
          <Row title="Position sizing" subtitle={p.sizing === 'risk' ? `By risk: ${settings.data.settings.rules.sizing?.riskPct}% of capital at risk per trade, up to ${settings.data.settings.rules.sizing?.maxPct}% in one stock` : `${p.positionPct}% of capital per trade`} right={<Segmented size="sm" value={p.sizing} onChange={set('sizing')} options={[{ value: 'percent', label: 'Same %' }, { value: 'risk', label: 'By risk' }]} />} />
          {p.timeExit && <Row title="Exit after" subtitle="Trading days without the stop or +10%" right={<NumberField value={p.timeExitDays} onChange={(v) => set('timeExitDays')(Math.max(1, Math.min(60, Math.round(v))))} suffix="days" min={1} max={60} width="w-20" />} />}
          <div className="p-4 flex flex-wrap gap-3">
            <Button icon={Play} onClick={run} loading={job?.status === 'running'} size="lg">
              Run backtest
            </Button>
            <Button icon={Download} tone="soft" onClick={history} size="lg">
              Get 10 years of data
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
      <Optimizer onVerify={verify} />
    </div>
  );
}

/** Monte Carlo ranges and results by period: how much of the result is luck? */
function Robustness({ mc, per }) {
  if (!mc && !per) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {mc && (
        <Card className="p-5">
          <div className="text-[19px] font-bold">Luck check (Monte Carlo)</div>
          {mc.runs ? (
            <>
              <p className="text-ink2 text-[14px] mt-1 leading-snug">The same {mc.trades} trades replayed in {mc.runs.toLocaleString('en-IN')} random orders. The real order was only one of many that could have happened.</p>
              <div className="grid grid-cols-3 gap-2 mt-4">
                <MC label="Bad luck (5%)" v={`${mc.returnPct.p5 > 0 ? '+' : ''}${mc.returnPct.p5}%`} tone={tone(mc.returnPct.p5)} />
                <MC label="Typical" v={`${mc.returnPct.p50 > 0 ? '+' : ''}${mc.returnPct.p50}%`} tone={tone(mc.returnPct.p50)} />
                <MC label="Good luck (95%)" v={`${mc.returnPct.p95 > 0 ? '+' : ''}${mc.returnPct.p95}%`} tone={tone(mc.returnPct.p95)} />
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <MC label="Typical drawdown" v={`−${mc.maxDrawdownPct.p50}%`} />
                <MC label="Bad drawdown (95%)" v={`−${mc.maxDrawdownPct.p95}%`} tone="text-coral" />
                <MC label="Chance of a loss" v={`${mc.lossChancePct}%`} tone={mc.lossChancePct > 20 ? 'text-coral' : ''} />
              </div>
              <p className="text-ink3 text-[13px] mt-3">Plan for the “bad drawdown” figure, not the backtest's own — it is the more honest estimate of a rough patch.</p>
            </>
          ) : (
            <p className="text-ink2 mt-2">{mc.note}</p>
          )}
        </Card>
      )}
      {per && per.periods?.length > 0 && (
        <Card className="p-5">
          <div className="text-[19px] font-bold">Results by period</div>
          <p className="text-[15px] mt-1 font-semibold">{per.verdict}</p>
          <div className="mt-3 divide-y hairline">
            {per.periods.map((x) => (
              <div key={x.period} className="flex items-center gap-3 py-2 text-[15px]">
                <span className="w-20 font-semibold num shrink-0">{x.period}</span>
                <span className={`num font-bold w-20 shrink-0 ${tone(x.returnPct)}`}>{pct(x.returnPct)}</span>
                <span className="text-ink2 num text-[13px] flex-1 min-w-0 truncate">
                  {x.trades} trades{x.winRate != null ? ` · ${x.winRate}% wins` : ''}{x.avgR != null ? ` · ${x.avgR}R` : ''} · DD −{x.maxDrawdownPct}%
                </span>
              </div>
            ))}
          </div>
          {per.halves && (
            <div className="grid grid-cols-2 gap-2 mt-3">
              <MC label="First half" v={`${per.halves.first.avgR}R`} sub={`${per.halves.first.trades} trades · ${per.halves.first.winRate}% wins`} tone={tone(per.halves.first.avgR)} />
              <MC label="Second half" v={`${per.halves.second.avgR}R`} sub={`${per.halves.second.trades} trades · ${per.halves.second.winRate}% wins`} tone={tone(per.halves.second.avgR)} />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function MC({ label, v, sub, tone: t = '' }) {
  return (
    <div className="bg-card2 rounded-2xl p-3 min-w-0">
      <div className="text-ink2 text-[12px] font-semibold leading-tight">{label}</div>
      <div className={`num font-bold text-[18px] ${t}`}>{v}</div>
      {sub && <div className="text-ink2 text-[12px]">{sub}</div>}
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
        {r.params.rules?.timeExit?.enabled && <Pill tone="peach">Time exit after {r.params.rules.timeExit.days} days</Pill>}
        {r.params.compounding === false && <Pill tone="butter">No compounding</Pill>}
        {r.params.rules?.sizing?.method === 'risk' && <Pill tone="butter">Sized by risk</Pill>}
        {s.skippedLiquidity > 0 && <Pill tone="gray">{s.skippedLiquidity} low turnover</Pill>}
        <Pill tone="mint">{s.taken} taken</Pill>
        {s.skippedConfirm > 0 && <Pill tone="gray">{s.skippedConfirm} not confirmed</Pill>}
        {s.notConfirmed > 0 && r.params.rules?.confirm?.enabled && <Pill tone="gray">{s.notConfirmed} crossed but never confirmed</Pill>}
        <Pill tone="gray">{s.skippedScore} low score</Pill>
        <Pill tone="gray">{s.skippedStop} stop too wide</Pill>
        <Pill tone="gray">{s.skippedRegime} market filter</Pill>
        <Pill tone="gray">{s.skippedCapital} no capital</Pill>
      </div>
      <StatsBlock s={r.stats} equity={r.equity} startValue={r.params.capital} />
      <Robustness mc={r.monteCarlo} per={r.periods} />
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
                  {niceDate(t.entryDate)} {t.entryTime || ''} {price(t.entryPrice)} → {niceDate(t.exitDate)} {t.exitTime || ''} · {t.days}d · {{ stop: 'stop-loss', trail: 'trailing exit', partial: 'partial', failed: 'failed breakout', time: 'time exit', climax: 'climax sale' }[t.reason] || t.reason} · {t.r}R
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
