import { useState } from 'react';
import { ChevronLeft, Check, X, AlertTriangle, Bell, Trash2, RotateCcw, HelpCircle, Clock } from 'lucide-react';
import IntradayChart from '../components/IntradayChart.jsx';
import { api, useApi, price, pct, istDateTime, niceDate } from '../lib.js';
import { Card, Section, Pill, GradeBadge, Spinner, Empty, ScoreRing, StageBadge, Delta, LivePrice, LiveDist, FlagBadges, Segmented, Button, NumberField, TextField } from '../components/ui.jsx';
import PriceChart from '../components/PriceChart.jsx';
import { PositionCard } from './Today.jsx';
import ScoreHistory from '../components/ScoreHistory.jsx';

export default function Stock({ symbol }) {
  const { data, error } = useApi(`/stock/${symbol}`, { interval: 20000, events: ['positions'] });
  const [chart, setChart] = useState('daily');
  if (error) return <Empty title="Stock not found" text={error} />;
  if (!data) return <Spinner />;
  const a = data.analysis;
  const v = a?.vcp || {};
  const live = data.live;
  const ltp = live?.ltp ?? a?.close;
  const open = data.positions.filter((p) => p.status === 'open');

  return (
    <div className="space-y-6">
      <button onClick={() => history.back()} className="flex items-center gap-1 text-accent font-semibold text-[17px] pt-2 -ml-1">
        <ChevronLeft size={24} /> Back
      </button>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-[34px] sm:text-[40px] font-bold tracking-tight">{symbol}</h1>
            {a && <GradeBadge grade={a.grade} score={a.score} size="lg" />}
          </div>
          <div className="text-ink2 text-[16px]">
            {data.info?.name} · {data.info?.industry}
            {a?.turnoverCr != null && <span className="num"> · ₹{a.turnoverCr} cr/day</span>}
          </div>
          <FlagBadges badges={data.badges} className="mt-1.5" />
        </div>
        <div className="text-right">
          <LivePrice symbol={symbol} fallback={{ ltp, changePct: live?.changePct ?? a?.changePct }} showChange className="text-[34px] font-bold tracking-tight" changeClass="text-[18px]" />
        </div>
      </header>

      <Card className="p-4 sm:p-5">
        <Segmented
          size="sm"
          className="mb-3"
          value={chart}
          onChange={setChart}
          options={[
            { value: 'daily', label: 'Daily' },
            { value: 'intraday', label: '15-minute' },
          ]}
        />
        {chart === 'daily' ? <PriceChart candles={data.candles} vcp={v.valid ? v : v.pivot ? v : null} positions={data.positions} buyZonePct={data.buyZonePct} /> : <IntradayChart symbol={symbol} />}
      </Card>

      <WhyNot symbol={symbol} />

      {data.filter && (
        <Card className="p-4 sm:p-5 flex gap-3 items-start ring-1 ring-butter/40">
          <AlertTriangle size={22} className="text-butter shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-[17px]">The agents won't buy this stock right now</div>
            <div className="text-ink2 text-[15px]">{data.filter.reason}. You can change this in Settings → Buying rules → Stock filters, or buy it anyway from the Overrule page.</div>
          </div>
        </Card>
      )}

      {open.map((p) => (
        <PositionCard key={p.id} p={p} />
      ))}

      {a && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="p-5 sm:p-6">
            <div className="flex items-center gap-4">
              <ScoreRing score={a.score} size={72} stroke={7} />
              <div>
                <div className="text-[20px] font-bold">Setup rating</div>
                <div className="text-ink2 text-[15px]">How the Analyst scored this setup (as of {a.asOf})</div>
              </div>
            </div>
            <div className="mt-5 space-y-3.5">
              {a.scoreParts.map((p) => (
                <div key={p.key}>
                  <div className="flex justify-between text-[15px]">
                    <span className="font-semibold">{p.label}</span>
                    <span className="num text-ink2">
                      {p.points}/{p.max}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-card2 mt-1.5 overflow-hidden">
                    <div className="h-full rounded-full bg-lav" style={{ width: `${(p.points / p.max) * 100}%` }} />
                  </div>
                  <div className="text-ink2 text-[13px] mt-1">{p.note}</div>
                </div>
              ))}
            </div>
          </Card>

          <div className="space-y-5">
            <Card className="p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <div className="text-[20px] font-bold">Volatility contraction</div>
                <StageBadge stage={a.stage} dist={live?.distPivotPct} />
              </div>
              {v.contractions?.length ? (
                <>
                  <div className="flex items-end gap-3 mt-5 h-28">
                    {v.contractions.map((k, i) => {
                      const max = Math.max(...v.contractions.map((x) => x.depthPct));
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                          <span className="text-[14px] font-bold num mb-1">−{k.depthPct.toFixed(1)}%</span>
                          <div className="w-full max-w-[56px] rounded-t-[8px] bg-lav/70" style={{ height: `${Math.max(8, (k.depthPct / max) * 80)}%` }} />
                          <span className="text-[12px] text-ink2 mt-1">C{i + 1}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5">
                    <Fact label="Pivot (buy point)" value={price(v.pivot)} />
                    <Fact label="Chart stop" value={`${price(v.stop)}`} sub={`−${v.stopPct}%`} />
                    <Fact label="From pivot" value={<LiveDist symbol={symbol} pivot={v.pivot} fallback={live?.distPivotPct ?? v.distToPivotPct} />} />
                    <Fact label="Base" value={`${Math.round((v.baseBars || 0) / 5)} weeks`} sub={`${v.depthPct}% deep`} />
                    <Fact label="Volume dry-up" value={`${Math.round((v.lastVolRatio || 0) * 100)}%`} sub="of 50-day avg" />
                    <Fact label="Prior advance" value={pct(v.priorAdvancePct, 0)} />
                  </div>
                </>
              ) : (
                <div className="text-ink2 mt-3">{v.reasons?.[0] || 'No base detected.'}</div>
              )}
            </Card>

            <Card className="p-5 sm:p-6">
              <div className="text-[20px] font-bold">Why / why not</div>
              <ul className="mt-3 space-y-2 text-[16px]">
                {a.explain.good.map((g) => (
                  <li key={g} className="flex gap-2">
                    <Check size={20} className="text-mint shrink-0 mt-0.5" />
                    {g}
                  </li>
                ))}
                {a.explain.bad.map((b) => (
                  <li key={b} className="flex gap-2 text-ink2">
                    <AlertTriangle size={19} className="text-butter shrink-0 mt-0.5" />
                    {b}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}

      {a && (
        <Section title="Minervini trend template" subtitle={`${a.trend.passCount} of 8 criteria · RS rating ${a.rsRating}`}>
          <Card className="grid sm:grid-cols-2 divide-y sm:divide-y-0 hairline">
            {a.trend.criteria.map((c) => (
              <div key={c.key} className="flex items-center gap-3 px-5 py-3.5">
                <span className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${c.pass ? 'bg-mint-soft text-mint' : 'bg-coral-soft text-coral'}`}>{c.pass ? <Check size={18} /> : <X size={18} />}</span>
                <span className="text-[16px]">{c.label}</span>
              </div>
            ))}
          </Card>
        </Section>
      )}

      {data.signals.length > 0 && (
        <Section title="Signal history">
          <Card className="divide-y hairline">
            {data.signals.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div>
                  <div className="font-semibold">
                    {s.type === 'reentry' ? 'Re-entry' : 'Breakout'} at {price(s.price)} · {s.grade} ({s.score})
                  </div>
                  <div className="text-ink2 text-[14px]">{s.reason || s.status.replace(/_/g, ' ')}</div>
                </div>
                <span className="text-ink3 text-[14px] shrink-0">{istDateTime(s.ts)}</span>
              </div>
            ))}
          </Card>
        </Section>
      )}

      <Alerts symbol={symbol} ltp={ltp} pivot={v.pivot} />

      <ScoreHistory symbol={symbol} />

      {data.watch && (
        <p className="text-ink2 text-[15px] px-1">
          On the watchlist since {niceDate(data.watch.first_seen)} ({data.watch.days_watched} days) · best score {data.watch.best_score} · <Pill tone="gray">{data.watch.status}</Pill>
        </p>
      )}
    </div>
  );
}

function Fact({ label, value, sub }) {
  return (
    <div className="bg-card2 rounded-2xl p-3">
      <div className="text-ink2 text-[13px] font-semibold">{label}</div>
      <div className="num font-bold text-[18px]">{value}</div>
      {sub && <div className="text-ink2 text-[12px]">{sub}</div>}
    </div>
  );
}

/** "Why didn't Pivot buy this?" — every rule for this stock, in the order the agents apply them. */
function WhyNot({ symbol }) {
  const [open, setOpen] = useState(false);
  const { data } = useApi(open ? `/stock/${symbol}/why` : null, { enabled: open, interval: open ? 30000 : 0 });
  const icon = { ok: <Check size={18} className="text-mint" />, stop: <X size={18} className="text-coral" />, wait: <Clock size={17} className="text-butter" />, info: <HelpCircle size={17} className="text-sky" /> };
  return (
    <Card className="p-4 sm:p-5">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between gap-3 text-left">
        <span className="flex items-center gap-2 font-bold text-[17px]">
          <HelpCircle size={20} className="text-lav" /> Why didn't Pivot buy this?
        </span>
        <span className="text-accent font-semibold text-[15px]">{open ? 'Hide' : 'Check'}</span>
      </button>
      {open &&
        (!data ? (
          <Spinner />
        ) : (
          <>
            <p className="mt-3 text-[16px] font-semibold">{data.verdict}</p>
            <ul className="mt-3 divide-y hairline">
              {data.items.map((i, k) => (
                <li key={k} className="flex gap-3 py-2.5">
                  <span className="h-7 w-7 shrink-0 rounded-full bg-card2 flex items-center justify-center">{icon[i.level]}</span>
                  <div className="min-w-0">
                    <div className="font-semibold text-[15px]">{i.label}</div>
                    <div className="text-ink2 text-[14px] leading-snug">{i.detail}</div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ))}
    </Card>
  );
}

/** Price alerts for this stock. */
function Alerts({ symbol, ltp, pivot }) {
  const { data, reload } = useApi(`/alerts?symbol=${symbol}`, { events: ['alerts'] });
  const [val, setVal] = useState(null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const target = val ?? (pivot ? Number(pivot) : ltp ? Math.round(ltp * 1.05 * 20) / 20 : null);
  const add = async () => {
    setBusy(true);
    setErr('');
    try {
      await api('/alerts', { method: 'POST', body: { symbol, price: target, note } });
      setVal(null);
      setNote('');
      reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="Price alerts" subtitle="Get a notification when the price gets there — any stock, any level">
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[16px] font-semibold">Alert me at</span>
          <NumberField value={target} onChange={setVal} step={0.05} width="w-32" suffix="₹" />
          {ltp && target ? <span className="text-ink2 text-[14px]">({target >= ltp ? 'goes above' : 'falls below'} · now {price(ltp)})</span> : null}
        </div>
        <div className="flex gap-2 mt-3">
          <TextField value={note} onChange={setNote} placeholder="Note (optional), e.g. 'pivot breakout'" />
          <Button icon={Bell} loading={busy} disabled={!target} onClick={add}>
            Add
          </Button>
        </div>
        {err && <div className="text-coral font-semibold mt-2">{err}</div>}
        {data?.length > 0 && (
          <div className="mt-4 divide-y hairline">
            {data.map((a) => (
              <div key={a.id} className="flex items-center gap-3 py-2.5">
                <Bell size={18} className={a.active ? 'text-accent' : 'text-ink3'} />
                <div className="flex-1 min-w-0">
                  <div className={`font-semibold ${a.active ? '' : 'text-ink3'}`}>
                    {a.op === 'below' ? 'Falls below' : 'Goes above'} {price(a.price)}
                  </div>
                  <div className="text-ink2 text-[13px] truncate">{a.active ? a.note || 'Waiting' : `Triggered ${istDateTime(a.triggered)} at ${price(a.triggeredPrice)}`}</div>
                </div>
                {!a.active && (
                  <button onClick={() => api(`/alerts/${a.id}/rearm`, { method: 'POST' }).then(reload)} className="text-accent" aria-label="Turn on again">
                    <RotateCcw size={18} />
                  </button>
                )}
                <button onClick={() => api(`/alerts/${a.id}`, { method: 'DELETE' }).then(reload)} className="text-ink3 hover:text-coral" aria-label="Delete alert">
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </Section>
  );
}
