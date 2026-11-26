// REPORTS — the morning brief (08:30) and evening report (15:40) for every trading day.
import { useEffect, useState } from 'react';
import { Sun, Moon, RefreshCw, FileText, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { api, useApi, go, inr, price, pct, signed, tone } from '../lib.js';
import { Card, LargeTitle, Section, Pill, GradeBadge, Button, Spinner, Empty, Segmented } from '../components/ui.jsx';

const REGIME_TONE = { uptrend: 'mint', pressure: 'butter', downtrend: 'coral' };

const dayLabel = (d, today) => {
  if (d === today) return 'Today';
  const dt = new Date(d + 'T12:00:00Z');
  return dt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
};

export default function Reports({ query }) {
  const [mode, setMode] = useState(query.period === 'week' || query.period === 'month' ? query.period : 'day');
  return (
    <div className="space-y-6">
      <LargeTitle title="Reports" subtitle="Daily briefs, weekly and monthly summaries, tax statement" />
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'day', label: 'Daily' },
          { value: 'week', label: 'Weekly' },
          { value: 'month', label: 'Monthly' },
        ]}
      />
      {mode === 'day' ? <DailyReports query={query} /> : <PeriodReports key={mode} type={mode} />}
      <TaxCard />
    </div>
  );
}

function DailyReports({ query }) {
  const list = useApi('/reports', { events: ['report'] });
  const [date, setDate] = useState(query.date || null);
  const [type, setType] = useState(query.type || null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const today = list.data?.today;
  const sel = date || list.data?.days[0]?.date || today;
  const rep = useApi(sel ? `/reports/${sel}` : null, { enabled: !!sel, events: ['report'] });

  // Default tab: the newest report available for the chosen day
  const avail = rep.data ? { morning: !!rep.data.morning, evening: !!rep.data.evening } : {};
  const shown = type || (avail.evening ? 'evening' : 'morning');
  useEffect(() => {
    setType(query.type || null);
  }, [sel]);

  const generate = async (t) => {
    setBusy(true);
    setErr('');
    try {
      await api('/reports/generate', { method: 'POST', body: { type: t } });
      setDate(today);
      setType(t);
      await list.reload();
      await rep.reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!list.data) return <Spinner />;
  const days = list.data.days;
  const hasToday = days.some((d) => d.date === today);
  const r = rep.data?.[shown];

  return (
    <div className="space-y-6">
      {/* Day picker */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
        {[...(hasToday ? [] : [{ date: today }]), ...days].map((d) => {
          const on = d.date === sel;
          return (
            <button
              key={d.date}
              onClick={() => {
                setDate(d.date);
                setType(null);
              }}
              className={`shrink-0 rounded-2xl px-4 py-2.5 text-left transition-colors ${on ? 'bg-accent text-white' : 'bg-card shadow-soft'}`}
            >
              <div className="text-[15px] font-bold whitespace-nowrap">{dayLabel(d.date, today)}</div>
              <div className={`flex gap-1.5 mt-0.5 text-[12px] ${on ? 'text-white/80' : 'text-ink3'}`}>
                <span className={d.morning ? '' : 'opacity-30'}>☀︎</span>
                <span className={d.evening ? '' : 'opacity-30'}>☾</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={shown}
          onChange={setType}
          options={[
            { value: 'morning', label: 'Morning' },
            { value: 'evening', label: 'Evening' },
          ]}
        />
        {sel === today && (
          <Button size="sm" tone="soft" icon={RefreshCw} loading={busy} onClick={() => generate(shown)}>
            {r ? 'Refresh now' : 'Create now'}
          </Button>
        )}
      </div>
      {err && <div className="bg-coral-soft text-coral rounded-2xl px-4 py-3 font-semibold">{err}</div>}

      {!rep.data ? (
        <Spinner />
      ) : !r ? (
        <Card>
          <Empty
            icon={shown === 'morning' ? Sun : Moon}
            title={`No ${shown} report${sel === today ? ' yet' : ''}`}
            text={shown === 'morning' ? 'The morning brief is made at 08:30 after the Screener analyses the market.' : 'The evening report is made at 15:40 after the market closes.'}
            action={
              sel === today && (
                <Button tone="lav" loading={busy} onClick={() => generate(shown)}>
                  Create it now
                </Button>
              )
            }
          />
        </Card>
      ) : shown === 'morning' ? (
        <Morning r={r} />
      ) : (
        <Evening r={r} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ shared pieces
function Saved({ r }) {
  return (
    <div className="text-ink3 text-[13px] px-1">
      {r.kind === 'paper' ? 'Paper account' : 'Live account'} · made at{' '}
      {new Date(r.savedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })} IST
    </div>
  );
}

function Fig({ label, value, sub, className = '' }) {
  return (
    <div className="bg-card2 rounded-2xl p-3.5 min-w-0">
      <div className="text-ink2 text-[13px] font-semibold">{label}</div>
      <div className={`num font-bold text-[20px] truncate ${className}`}>{value}</div>
      {sub && <div className="text-ink2 text-[12px] truncate">{sub}</div>}
    </div>
  );
}

function MarketPill({ m }) {
  return <Pill tone={REGIME_TONE[m.regime] || 'gray'}>{m.label}</Pill>;
}

function Sym({ s }) {
  return (
    <button onClick={() => go(`/stock/${encodeURIComponent(s)}`)} className="font-bold text-[17px] text-left hover:text-accent truncate">
      {s}
    </button>
  );
}

function Positions({ rows, title }) {
  return (
    <Section title={title} subtitle={rows.length ? `${rows.length} ${rows.length === 1 ? 'stock' : 'stocks'}` : undefined}>
      {rows.length ? (
        <Card className="divide-y hairline">
          {rows.map((p) => (
            <div key={p.symbol} className="px-4 sm:px-5 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Sym s={p.symbol} />
                    {p.grade && <GradeBadge grade={p.grade} />}
                  </div>
                  <div className="text-ink2 text-[14px] num">
                    {p.qty} sh · {price(p.entry)} → {price(p.last)} · day {p.held}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`num font-bold text-[18px] ${tone(p.pnlPct)}`}>{pct(p.pnlPct)}</div>
                  <div className={`num text-[14px] ${tone(p.pnl)}`}>{signed(p.pnl)}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-[13px] text-ink2 num">
                <span>
                  Stop <b className="text-ink">{price(p.stop)}</b> ({pct(p.toStopPct)})
                </span>
                {p.target && (
                  <span>
                    +10% at <b className="text-ink">{price(p.target)}</b>
                  </span>
                )}
              </div>
              {p.watch?.length > 0 && <div className="text-[13px] text-ink3 mt-1">{p.watch.join(' · ')}</div>}
            </div>
          ))}
        </Card>
      ) : (
        <Card className="px-5 py-4 text-ink2">No open positions.</Card>
      )}
    </Section>
  );
}

function Setups({ rows, title, subtitle }) {
  return (
    <Section title={title} subtitle={subtitle}>
      {rows.length ? (
        <Card className="divide-y hairline">
          {rows.map((a, i) => (
            <div key={a.symbol} className="flex items-center gap-3 px-4 sm:px-5 py-3.5">
              <span className="w-6 text-ink3 font-bold num text-[15px] shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Sym s={a.symbol} />
                  <GradeBadge grade={a.grade} score={a.score} />
                </div>
                <div className="text-ink2 text-[13px] truncate">
                  {a.industry} · RS {a.rs} · stop {a.stopPct}%
                </div>
              </div>
              <div className="text-right shrink-0 num">
                <div className="text-[13px] text-ink2">Pivot</div>
                <div className="font-semibold text-[15px]">{price(a.pivot)}</div>
                <div className={`text-[13px] ${a.distPct > 0 ? 'text-mint' : 'text-ink2'}`}>{a.distPct != null ? `${a.distPct > 0 ? '+' : ''}${a.distPct}%` : ''}</div>
              </div>
            </div>
          ))}
        </Card>
      ) : (
        <Card className="px-5 py-4 text-ink2">No high-quality VCP setups. Patience is part of the strategy.</Card>
      )}
    </Section>
  );
}

// ------------------------------------------------------------------ morning
function Morning({ r }) {
  return (
    <div className="space-y-7">
      <Card className="p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="h-12 w-12 shrink-0 rounded-2xl bg-butter-soft text-butter flex items-center justify-center">
            <Sun size={24} />
          </span>
          <div className="min-w-0">
            <div className="text-[20px] font-bold">Morning brief</div>
            <div className="text-ink2 text-[15px]">
              Market: <MarketPill m={r.market} />
            </div>
          </div>
        </div>
        {r.market.notes?.length > 0 && (
          <ul className="mt-4 space-y-1 text-[15px] text-ink2">
            {r.market.notes.map((n) => (
              <li key={n}>• {n}</li>
            ))}
          </ul>
        )}
        {r.notes?.length > 0 && (
          <div className="mt-4 space-y-2">
            {r.notes.map((n) => (
              <div key={n} className="bg-butter-soft text-butter rounded-xl px-3 py-2 text-[15px] font-semibold">
                {n}
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <Fig label="Account value" value={inr(r.capital.equity)} sub={`Open P&L ${signed(r.capital.openPnl)}`} />
          <Fig label="Free cash" value={inr(r.capital.cash)} />
          <Fig label="In an uptrend" value={r.counts.trendPass} sub={`of ${r.counts.universe} stocks`} />
          <Fig label="VCP setups" value={r.counts.setups} sub={`${r.counts.near} near the pivot`} />
        </div>
      </Card>
      <Saved r={r} />
      <Setups rows={r.top} title="Best setups today" subtitle="Ranked by the Analyst — buys happen only on a confirmed breakout" />
      <Positions rows={r.positions} title="Your positions" />
    </div>
  );
}

// ------------------------------------------------------------------ evening
function Evening({ r }) {
  return (
    <div className="space-y-7">
      <Card className="p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="h-12 w-12 shrink-0 rounded-2xl bg-lav-soft text-lav flex items-center justify-center">
            <Moon size={24} />
          </span>
          <div className="min-w-0">
            <div className="text-[20px] font-bold">Evening report</div>
            <div className="text-ink2 text-[15px]">
              Market: <MarketPill m={r.market} />
            </div>
          </div>
        </div>
        <div className="mt-5">
          <div className="text-ink2 text-[15px] font-semibold">Account value</div>
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className="text-[38px] font-bold num tracking-tight">{inr(r.capital.equity)}</span>
            {r.change != null && (
              <span className={`num font-semibold text-[18px] ${tone(r.change)}`}>
                {signed(r.change)} ({pct(r.changePct, 2)}) today
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <Fig label="Booked today" value={signed(r.realizedToday)} className={tone(r.realizedToday)} />
          <Fig label="Open P&L" value={signed(r.capital.openPnl)} className={tone(r.capital.openPnl)} />
          <Fig label="Free cash" value={inr(r.capital.cash)} />
          <Fig label="Trades" value={`${r.buys.length} buy · ${r.sells.length} sell`} />
        </div>
      </Card>
      <Saved r={r} />

      <Section title="Today's trades">
        {r.buys.length || r.sells.length ? (
          <Card className="divide-y hairline">
            {r.buys.map((b, i) => (
              <div key={'b' + i} className="flex items-center gap-3 px-4 sm:px-5 py-3.5">
                <span className="h-9 w-9 shrink-0 rounded-xl bg-mint-soft text-mint flex items-center justify-center">
                  <ArrowUpRight size={18} />
                </span>
                <div className="flex-1 min-w-0">
                  <Sym s={b.symbol} />
                  <div className="text-ink2 text-[13px] num">
                    Bought {b.qty} @ {price(b.price)} · {b.time}
                  </div>
                </div>
                <div className="num font-semibold shrink-0">{inr(b.value)}</div>
              </div>
            ))}
            {r.sells.map((x, i) => (
              <div key={'s' + i} className="flex items-center gap-3 px-4 sm:px-5 py-3.5">
                <span className="h-9 w-9 shrink-0 rounded-xl bg-coral-soft text-coral flex items-center justify-center">
                  <ArrowDownRight size={18} />
                </span>
                <div className="flex-1 min-w-0">
                  <Sym s={x.symbol} />
                  <div className="text-ink2 text-[13px] num truncate">
                    Sold {x.qty} @ {price(x.price)} · {x.time} · {x.reason}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`num font-semibold ${tone(x.pnl)}`}>{signed(x.pnl)}</div>
                  <div className={`num text-[13px] ${tone(x.pct)}`}>{pct(x.pct)}</div>
                </div>
              </div>
            ))}
          </Card>
        ) : (
          <Card className="px-5 py-4 text-ink2">No buys or sells today.</Card>
        )}
      </Section>

      {r.closed.length > 0 && (
        <Section title="Trades closed today">
          <Card className="divide-y hairline">
            {r.closed.map((c, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5">
                <div className="min-w-0">
                  <Sym s={c.symbol} />
                  <div className="text-ink2 text-[13px]">
                    {c.reason} · held {c.days} {c.days === 1 ? 'day' : 'days'}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`num font-semibold ${tone(c.realized)}`}>{signed(c.realized)}</div>
                  <div className={`num text-[13px] ${tone(c.pct)}`}>{pct(c.pct)}</div>
                </div>
              </div>
            ))}
          </Card>
        </Section>
      )}

      <Section title="Breakout signals" subtitle={`${r.signals.total} today · ${r.signals.bought.length} bought · ${r.signals.skipped.length} skipped`}>
        {r.signals.total ? (
          <Card className="divide-y hairline">
            {r.signals.bought.map((x, i) => (
              <div key={'k' + i} className="flex items-center gap-3 px-4 sm:px-5 py-3">
                <Sym s={x.symbol} />
                <GradeBadge grade={x.grade} score={x.score} />
                <Pill tone="mint" className="ml-auto">
                  Bought
                </Pill>
              </div>
            ))}
            {r.signals.skipped.map((x, i) => (
              <div key={'x' + i} className="px-4 sm:px-5 py-3">
                <div className="flex items-center gap-3">
                  <Sym s={x.symbol} />
                  {x.grade && <GradeBadge grade={x.grade} score={x.score} />}
                  <Pill tone="gray" className="ml-auto">
                    Skipped
                  </Pill>
                </div>
                <div className="text-ink2 text-[13px] mt-0.5">{x.reason}</div>
              </div>
            ))}
          </Card>
        ) : (
          <Card className="px-5 py-4 text-ink2">No breakouts today.</Card>
        )}
      </Section>

      <Positions rows={r.positions} title="Holding into tomorrow" />
      <Setups rows={r.tomorrow} title="Setups for tomorrow" subtitle={`Watching ${r.watching} ${r.watching === 1 ? 'setup' : 'setups'} in total`} />
    </div>
  );
}

// ------------------------------------------------------------------ weekly / monthly
function PeriodReports({ type }) {
  const periods = useApi(`/period-reports?type=${type}`);
  const [date, setDate] = useState(null);
  const sel = date || periods.data?.[0]?.date;
  const { data: r } = useApi(sel ? `/period-report?type=${type}&date=${sel}` : null, { enabled: !!sel, events: ['positions', 'report'] });
  if (!periods.data) return <Spinner />;
  return (
    <div className="space-y-6">
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
        {periods.data.map((p, i) => {
          const on = p.date === sel;
          return (
            <button key={p.date} onClick={() => setDate(p.date)} className={`shrink-0 rounded-2xl px-4 py-2.5 text-[15px] font-bold whitespace-nowrap ${on ? 'bg-accent text-white' : 'bg-card shadow-soft'}`}>
              {i === 0 ? (type === 'week' ? 'This week' : 'This month') : p.label}
            </button>
          );
        })}
      </div>
      {!r ? (
        <Spinner />
      ) : (
        <div className="space-y-7">
          <Card className="p-5 sm:p-6">
            <div className="text-ink2 text-[15px] font-semibold">
              {type === 'week' ? 'Week' : 'Month'} · {r.label} · {r.kind === 'paper' ? 'paper account' : 'live account'}
            </div>
            <div className="flex flex-wrap items-baseline gap-x-3 mt-1">
              <span className="text-[36px] font-bold num tracking-tight">{r.endEquity != null ? inr(r.endEquity) : '—'}</span>
              {r.change != null && (
                <span className={`num font-semibold text-[18px] ${tone(r.change)}`}>
                  {signed(r.change)} ({pct(r.changePct, 2)})
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              <Fig label="Trades closed" value={r.stats.trades} sub={r.stats.trades ? `${r.stats.winRate}% wins · ${r.stats.avgR ?? '—'}R avg` : undefined} />
              <Fig label="Booked" value={signed(r.stats.booked)} className={tone(r.stats.booked)} />
              <Fig label="Charges" value={inr(r.stats.charges)} />
              <Fig label="Breakouts" value={r.signals.total} sub={`${r.signals.bought} bought`} />
            </div>
          </Card>

          <Section title="Trades closed">
            {r.closed.length ? (
              <Card className="divide-y hairline">
                {r.closed.map((c, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5">
                    <div className="min-w-0">
                      <Sym s={c.symbol} />
                      <div className="text-ink2 text-[13px]">
                        {c.reason} · {c.days} {c.days === 1 ? 'day' : 'days'}
                        {c.r != null ? ` · ${c.r}R` : ''}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`num font-semibold ${tone(c.realized)}`}>{signed(c.realized)}</div>
                      <div className={`num text-[13px] ${tone(c.pct)}`}>{pct(c.pct)}</div>
                    </div>
                  </div>
                ))}
              </Card>
            ) : (
              <Card className="px-5 py-4 text-ink2">No trades closed in this {type}.</Card>
            )}
          </Section>

          {Object.keys(r.signals.skipped).length > 0 && (
            <Section title="Breakouts skipped" subtitle="Why the agents passed">
              <Card className="divide-y hairline">
                {Object.entries(r.signals.skipped)
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, n]) => (
                    <div key={k} className="flex justify-between px-4 sm:px-5 py-3">
                      <span className="capitalize">{k.replace(/^skipped_/, '').replace(/_/g, ' ')}</span>
                      <b className="num">{n}</b>
                    </div>
                  ))}
              </Card>
            </Section>
          )}

          <Section title="Journal" subtitle={`Your notes from this ${type}`}>
            {r.journal.length ? (
              <Card className="divide-y hairline">
                {r.journal.map((j, i) => (
                  <div key={i} className="px-4 sm:px-5 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Sym s={j.symbol} />
                      <span className="text-ink3 text-[13px]">{j.date}</span>
                      {j.tags.map((t) => (
                        <span key={t} className="text-[12px] font-semibold rounded-full px-2 py-0.5 bg-lav-soft text-lav">
                          {t}
                        </span>
                      ))}
                    </div>
                    {j.text && <p className="text-[15px] mt-1 whitespace-pre-wrap">{j.text}</p>}
                  </div>
                ))}
              </Card>
            ) : (
              <Card className="px-5 py-4 text-ink2">No journal notes. Add them from Trades → Journal.</Card>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ tax statement
function TaxCard() {
  const now = new Date();
  const curFy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const [fy, setFy] = useState(String(curFy));
  const [kind, setKind] = useState('live');
  const { data } = useApi(`/tax?fy=${fy}&kind=${kind}`);
  const fys = [curFy, curFy - 1, curFy - 2].map(String);
  return (
    <Section title="Tax statement" subtitle="Capital gains for your ITR, with all charges">
      <Card className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap gap-2">
          <Segmented size="sm" value={fy} onChange={setFy} options={fys.map((y) => ({ value: y, label: `FY ${y}-${String(Number(y) + 1).slice(2)}` }))} />
          <Segmented
            size="sm"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'live', label: 'Live' },
              { value: 'paper', label: 'Paper' },
            ]}
          />
        </div>
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Fig label="Sales" value={data.sales} />
            <Fig label="Short-term (STCG)" value={signed(data.stcg)} className={tone(data.stcg)} />
            <Fig label="Long-term (LTCG)" value={signed(data.ltcg)} className={tone(data.ltcg)} />
            <Fig label="Charges" value={inr(data.charges)} />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button icon={FileText} tone="lav" onClick={() => (window.location.href = `/api/tax.csv?fy=${fy}&kind=${kind}`)}>
            Download CSV
          </Button>
          <span className="text-ink3 text-[13px] flex-1 min-w-[200px]">One row per sale: dates, quantity, buy and sell value, charges, gain, short- or long-term. Opens in Excel or Google Sheets. Check it against Zerodha Console's tax P&L before filing.</span>
        </div>
      </Card>
    </Section>
  );
}
