import { useEffect, useState } from 'react';
import { Wand2, Check, Lock, Undo2, Download } from 'lucide-react';
import { api, useApi, pct, niceDate } from '../lib.js';
import { Card, Button, NumberField, Toggle, Sheet, Pill, Section } from './ui.jsx';
import { EquityChart } from './Charts.jsx';

const PHASES = {
  analyse: 'Step 1 of 4 · Studying the history of every stock…',
  search: 'Step 2 of 4 · Testing combinations of your settings…',
  refine: 'Step 3 of 4 · Fine-tuning the best ones…',
  validate: 'Step 4 of 4 · Checking them on recent data they never saw…',
  done: 'Finishing…',
};

const fmtVal = (k, v) => {
  if (typeof v === 'boolean') return v ? 'On' : 'Off';
  if (k === 'trailMethod') return { ema21: 'Close < 21 EMA', sma50: 'Close < 50 DMA', pct10: '10% trail' }[v] || v;
  if (k === 'marketFilter') return { pause: 'Pause new buys', half: 'Half size', off: 'Ignore' }[v] || v;
  if (k === 'minVolPace') return `${v}×`;
  if (['positionPct', 'maxStopPct', 'partialAtPct', 'buyZonePct'].includes(k)) return `${v}%`;
  if (k === 'sizing') return v === 'risk' ? 'By risk' : 'Same % of capital';
  if (k === 'timeExitDays') return v ? `${v} days` : 'Off';
  if (k === 'minTurnoverCr') return v ? `₹${v} cr` : 'Off';
  if (k === 'minSectorRank') return v ? 'Leading sectors only' : 'Off';
  return String(v);
};

export default function Optimizer({ onVerify }) {
  const last = useApi('/optimize/last');
  const [job, setJob] = useState(null);
  const [maxDD, setMaxDD] = useState(15);
  const [lockSize, setLockSize] = useState(true);
  const [lockStop, setLockStop] = useState(false);
  const [lockChecks, setLockChecks] = useState(false);
  const [years, setYears] = useState(10);
  const [autoApply, setAutoApply] = useState(true);
  const [hist, setHist] = useState('');
  const [err, setErr] = useState('');
  const [ask, setAsk] = useState(false);
  const [applied, setApplied] = useState(false);

  // pick up a run that is still going (e.g. after leaving the page)
  useEffect(() => {
    if (!job && last.data?.status === 'running') setJob(last.data);
  }, [last.data]);

  useEffect(() => {
    if (!job || job.status !== 'running') return;
    const t = setInterval(async () => {
      try {
        const j = await api(`/optimize/${job.id}`);
        setJob(j);
        if (j.status !== 'running') last.reload();
      } catch {
        /* ignore */
      }
    }, 1500);
    return () => clearInterval(t);
  }, [job?.id, job?.status]);

  const run = async () => {
    setErr('');
    setApplied(false);
    const locked = [...(lockSize ? ['positionPct'] : []), ...(lockStop ? ['maxStopPct'] : []), ...(lockChecks ? ['confirm', 'twoStage', 'failedExit'] : [])];
    try {
      const r = await api('/optimize', { method: 'POST', body: { maxDrawdownPct: maxDD, locked, years, autoApply } });
      setJob({ id: r.id, status: 'running', progress: 0, phase: 'analyse' });
    } catch (e) {
      setErr(e.message);
    }
  };
  const getHistory = async () => {
    try {
      await api('/agents/history', { method: 'POST', body: { years: years + 1 } });
      setHist(`Downloading ${years + 1} years of daily candles for the Nifty 500 in the background (1 extra year is needed to warm up the 200-day average). This takes about 10–20 minutes — watch the Agents page, then run the optimiser.`);
    } catch (e) {
      setHist(e.message);
    }
  };
  const undo = async () => {
    await api('/optimize/undo', { method: 'POST' });
    last.reload();
  };
  const apply = async () => {
    await api('/optimize/apply', { method: 'POST' });
    setAsk(false);
    setApplied(true);
    last.reload();
  };

  const res = job?.status === 'done' ? job.result : job?.status === 'running' ? null : last.data?.result;
  const appliedAt = last.data?.appliedAt;

  return (
    <Section title="Optimiser" subtitle="Finds the settings with the best profit for the smallest drawdown — using only your existing rules">
      <Card className="p-5 sm:p-6">
        <p className="text-ink2 text-[15px]">
          Tests a few hundred combinations of your settings (score, sizing, stop, profit level, trailing, buy zone, volume, market filter, breakout checks, time exit, turnover, sector
          filter, big-winner rules) on up to 10 years of real Nifty 500 history. To avoid fitting old noise, it tunes on the older 70% of the data and then checks the winners on the
          most recent 30% it has never seen. Settings that change less are preferred, and nothing is recommended unless it made money in both periods within your drawdown limit.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button tone="soft" icon={Download} onClick={getHistory}>
            Get {years} years of data
          </Button>
          <span className="text-ink3 text-[13px] flex-1 min-w-[200px]">Do this once before the first run. Needs your daily Zerodha login.</span>
        </div>
        {hist && <div className="mt-2 text-[14px] font-semibold">{hist}</div>}
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3 mt-5">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold">Years of history</span>
            <NumberField value={years} onChange={(v) => setYears(Math.max(2, Math.min(15, Math.round(v))))} suffix="years" width="w-20" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold">Apply the result automatically</span>
            <Toggle checked={autoApply} onChange={setAutoApply} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold">Largest drawdown I accept</span>
            <NumberField value={maxDD} onChange={setMaxDD} suffix="%" width="w-20" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold flex items-center gap-1.5">
              <Lock size={15} className="text-ink3" /> Keep my position size
            </span>
            <Toggle checked={lockSize} onChange={setLockSize} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold flex items-center gap-1.5">
              <Lock size={15} className="text-ink3" /> Keep my stop limit
            </span>
            <Toggle checked={lockStop} onChange={setLockStop} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold flex items-center gap-1.5">
              <Lock size={15} className="text-ink3" /> Keep breakout checks as they are
            </span>
            <Toggle checked={lockChecks} onChange={setLockChecks} />
          </div>
        </div>
        <Button className="mt-5" size="lg" icon={Wand2} onClick={run} loading={job?.status === 'running'}>
          Find the best settings
        </Button>
        {err && <div className="mt-3 text-coral font-semibold">{err}</div>}
        {job?.status === 'running' && (
          <div className="mt-5">
            <div className="font-semibold mb-2">
              {PHASES[job.phase] || 'Working…'} {Math.round((job.progress || 0) * 100)}%
            </div>
            <div className="h-3 rounded-full bg-card2 overflow-hidden">
              <div className="h-full bg-lav rounded-full transition-all" style={{ width: `${(job.progress || 0) * 100}%` }} />
            </div>
            <div className="text-ink3 text-[14px] mt-2">10 years of Nifty 500 data takes roughly 15–45 minutes on a small server. You can leave this page or close the app — the result is saved{autoApply ? ', applied automatically if it is better,' : ''} and you'll get a notification.</div>
          </div>
        )}
        {job?.status === 'error' && <div className="mt-4 text-coral font-semibold">{job.error}</div>}
      </Card>

      {res && <Results r={res} appliedAt={applied ? new Date().toISOString() : appliedAt} appliedHow={last.data?.appliedHow} canUndo={!!last.data?.before} onUndo={undo} onApply={() => setAsk(true)} onVerify={onVerify} />}

      <Sheet open={ask} onClose={() => setAsk(false)} title="Apply the recommended settings?">
        {res && (
          <>
            <ul className="space-y-2 text-[17px]">
              {res.changes.map((c) => (
                <li key={c.key}>
                  • {c.label}: <b>{fmtVal(c.key, c.from)}</b> → <b>{fmtVal(c.key, c.to)}</b>
                </li>
              ))}
            </ul>
            <p className="text-ink2 mt-4">These settings will be used from the next trade. You can change any of them again in Settings. A good habit: paper-trade them for a few weeks first.</p>
            <div className="grid grid-cols-2 gap-3 mt-6">
              <Button tone="soft" size="lg" onClick={() => setAsk(false)}>
                Not now
              </Button>
              <Button tone="mint" size="lg" icon={Check} onClick={apply}>
                Apply
              </Button>
            </div>
          </>
        )}
      </Sheet>
    </Section>
  );
}

function Results({ r, appliedAt, appliedHow, canUndo, onUndo, onApply, onVerify }) {
  const rows = [
    ['Return per year', (m) => pct(m.annualPct)],
    ['Largest drawdown', (m) => pct(m.maxDrawdownPct)],
    ['Return ÷ drawdown', (m) => m.score.toFixed(2)],
    ['Trades', (m) => m.trades],
    ['Win rate', (m) => `${m.winRate}%`],
  ];
  const Col = ({ title, sub, cur, rec }) => (
    <Card className="p-4 sm:p-5">
      <div className="font-bold text-[17px]">{title}</div>
      <div className="text-ink2 text-[13px] mb-3">{sub}</div>
      <table className="w-full text-[15px] num">
        <thead>
          <tr className="text-ink2 text-[13px] text-left">
            <th className="font-semibold py-1"></th>
            <th className="font-semibold text-right">Current</th>
            <th className="font-semibold text-right">Recommended</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, f]) => (
            <tr key={label} className="border-t hairline">
              <td className="py-2">{label}</td>
              <td className="text-right">{f(cur)}</td>
              <td className="text-right font-semibold">{f(rec)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
  return (
    <div className="space-y-4 mt-4">
      <Card className={`p-5 sm:p-6 ring-2 ${r.keepCurrent ? 'ring-sky/40' : 'ring-mint/40'}`}>
        <div className="text-[20px] font-bold">{r.keepCurrent ? 'Keep your current settings' : `Recommended: ${r.changes.length} change${r.changes.length === 1 ? '' : 's'}`}</div>
        {r.keepCurrent && r.reason && <div className="text-[16px] mt-1">{r.reason}</div>}
        <div className="text-ink2 text-[15px] mt-1">
          {r.years ? `${r.years} years · ${r.stocks} stocks · ` : ''}Tested {r.tested} combinations · tuned on {niceDate(r.periods.train.from)} – {niceDate(r.periods.train.to)} · checked on {niceDate(r.periods.test.from)} – {niceDate(r.periods.test.to)}
          {r.locked?.length ? ` · kept: ${r.locked.length} locked setting${r.locked.length > 1 ? 's' : ''}` : ''}
        </div>
        {!r.keepCurrent && (
          <div className="mt-4 space-y-2">
            {r.changes.map((c) => (
              <div key={c.key} className="flex flex-wrap items-center justify-between gap-2 bg-card2 rounded-2xl px-4 py-2.5">
                <span className="font-semibold">{c.label}</span>
                <span className="num">
                  <span className="text-ink2">{fmtVal(c.key, c.from)}</span> → <b className="text-mint">{fmtVal(c.key, c.to)}</b>
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-3 mt-5">
          {!r.keepCurrent &&
            (appliedAt ? (
              <>
                <Pill tone="mint" icon={Check}>
                  {appliedHow === 'auto' ? 'Applied automatically' : 'Applied'} {new Date(appliedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </Pill>
                {canUndo && (
                  <Button tone="soft" icon={Undo2} onClick={onUndo}>
                    Undo — restore my old settings
                  </Button>
                )}
              </>
            ) : (
              <Button tone="mint" icon={Check} onClick={onApply}>
                Apply these settings
              </Button>
            ))}
          {!r.keepCurrent && onVerify && (
            <Button tone="soft" onClick={() => onVerify(r.recommended.patch)}>
              Double-check on 15-minute candles
            </Button>
          )}
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Col title="Tuning period" sub="the older 70% of history" cur={r.current.train} rec={r.recommended.train} />
        <Col title="Unseen test period" sub="the most recent 30% — the honest check" cur={r.current.test} rec={r.recommended.test} />
      </div>
      <Card className="p-5 sm:p-6">
        <h3 className="text-[19px] font-bold">Recommended settings over the whole period</h3>
        <p className="text-ink2 text-[14px] mb-3">
          {pct(r.recommended.full.stats.totalReturnPct)} total · largest drawdown {pct(r.recommended.full.stats.maxDrawdownPct)} · {r.recommended.full.stats.trades} trades (your current settings:{' '}
          {pct(r.current.full.stats.totalReturnPct)}, drawdown {pct(r.current.full.stats.maxDrawdownPct)})
        </p>
        <EquityChart data={r.recommended.full.equity} startValue={r.recommended.full.equity[0]?.equity} />
        {r.recommended.full.stats.cagrPct != null && (
          <p className="text-[15px] mt-3">
            <b>{r.recommended.full.stats.cagrPct}% a year</b> on average
            {r.recommended.full.monteCarlo?.runs ? (
              <>
                {' '}
                · luck check: a bad stretch could mean a drawdown of about <b className="text-coral">−{r.recommended.full.monteCarlo.maxDrawdownPct.p95}%</b>, and a {r.recommended.full.monteCarlo.lossChancePct}% chance the same trades in a different order lose money
              </>
            ) : null}
            {r.recommended.full.periods?.verdict ? <span className="block text-ink2 text-[14px] mt-1">{r.recommended.full.periods.verdict}</span> : null}
          </p>
        )}
      </Card>
      <p className="text-ink3 text-[14px] px-1">
        If the recommended settings do much better in the tuning period but not in the unseen test period, they are probably fitted to the past — trust the test period more. Past results
        do not guarantee future returns.
      </p>
    </div>
  );
}
