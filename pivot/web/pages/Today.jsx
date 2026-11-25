import { useEffect, useState } from 'react';
import { Crown, Radar, Sparkles, ShieldCheck, Check, X, KeyRound, Pause, Play, FastForward, Gauge, TrendingUp, TrendingDown, Activity , Timer, Gavel, ChevronRight } from 'lucide-react';
import { api, useApi, go, inr, price, pct, signed, tone, istTime, compactInr } from '../lib.js';
import { Card, Section, Pill, GradeBadge, Button, Spinner, Empty, RiskBar, Segmented, Contractions, StageBadge, Delta , LivePrice, LiveDist, LiveStage, FlagBadges } from '../components/ui.jsx';
import { useQuote, useFlash, useSymbols, useAllQuotes } from '../live.js';
import AgentPulse from '../components/AgentPulse.jsx';


export default function Today() {
  const { data, error, reload } = useApi('/overview', { interval: 4000, events: ['approval', 'positions', 'scan', 'kite', 'event'] });
  if (error && !data) return <Empty title="Can't reach Pivot" text={error} />;
  if (!data) return <Spinner />;
  const d = data;
  const hour = Number(d.clock.time.slice(0, 2));
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const regimeTone = { uptrend: 'mint', pressure: 'butter', downtrend: 'coral' }[d.market?.regime] || 'gray';

  return (
    <div className="space-y-7">
      <header className="pt-2">
        <div className="text-ink2 text-[15px] font-semibold uppercase tracking-wide num">
          {new Date(d.clock.date + 'T12:00:00Z').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} · {d.clock.time} IST
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-[34px] sm:text-[40px] font-bold tracking-tight leading-tight">{greet}</h1>
          <div className="flex flex-wrap gap-2">
            <Pill tone={d.mode === 'live' ? 'coral' : 'lav'}>{d.mode === 'live' ? '● LIVE money' : 'Paper trading'}</Pill>
            <Pill tone={d.confirmTrades ? 'sky' : 'peach'}>{d.confirmTrades ? 'Asks before buying' : 'Fully automatic'}</Pill>
            {d.paused && <Pill tone="butter">New buys paused</Pill>}
          </div>
        </div>
      </header>

      {d.demo && <DemoBar state={d.demoState} />}
      {!d.kite.connected && <LoginCard configured={d.kite.configured} />}
      {d.update?.state === 'available' && (
        <Card className="p-4 sm:p-5 flex items-center gap-4 ring-1 ring-lav/30" onClick={() => go('/settings/app')}>
          <span className="h-11 w-11 shrink-0 rounded-2xl bg-lav-soft text-lav flex items-center justify-center text-[22px]">⬆︎</span>
          <div className="flex-1">
            <div className="font-bold text-[17px]">A new version of Pivot is ready</div>
            <div className="text-ink2 text-[15px]">Tap to update from Settings → App & data</div>
          </div>
        </Card>
      )}
      {!d.demo && !d.push?.devices && !d.telegram.paired && (
        <Card className="p-5 flex flex-col sm:flex-row sm:items-center gap-4" onClick={() => go('/settings/notifications')}>
          <span className="h-12 w-12 shrink-0 rounded-2xl bg-mint-soft text-mint flex items-center justify-center text-[24px]">🔔</span>
          <div className="flex-1">
            <div className="text-[18px] font-bold">Turn on notifications</div>
            <div className="text-ink2 text-[15px]">So you never miss a buy signal waiting for your approval. Settings → Notifications.</div>
          </div>
        </Card>
      )}

      {d.approvals.length > 0 && (
        <Section title="Needs your decision" subtitle="The agents found a breakout and are waiting for you">
          <div className="grid gap-4 lg:grid-cols-2">
            {d.approvals.map((a) => (
              <ApprovalCard key={a.id} a={a} now={d.clock.iso} onDone={reload} />
            ))}
          </div>
        </Section>
      )}

      {/* Portfolio hero */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <PortfolioHero d={d} />

        <Card className="p-6 rise">
          <div className="flex items-center justify-between">
            <div className="text-ink2 font-semibold text-[15px]">Market health</div>
            <Pill tone={regimeTone} icon={d.market?.regime === 'downtrend' ? TrendingDown : TrendingUp}>
              {d.market?.label || 'Unknown'}
            </Pill>
          </div>
          <div className="mt-3 space-y-1.5 text-[16px]">
            {(d.market?.notes || []).slice(0, 4).map((n) => (
              <div key={n} className="flex gap-2 text-ink2">
                <span className="text-ink3">•</span>
                {n}
              </div>
            ))}
          </div>
          {d.market?.regime === 'downtrend' && <div className="mt-3 text-[15px] bg-coral-soft text-coral rounded-2xl px-4 py-2.5 font-semibold">New buys are paused until the market recovers. Setups are still tracked.</div>}
        </Card>
      </div>

      {/* Agents — live */}
      <Section title="Your agents" action={<button onClick={() => go('/agents')} className="text-accent font-semibold text-[16px]">Activity</button>}>
        <AgentPulse />
      </Section>

      {/* Positions */}
      <Section
        title="Open positions"
        subtitle={d.positions.length ? `${d.positions.length} ${d.positions.length === 1 ? 'stock' : 'stocks'} · ${compactInr(d.capital.marketValue)} invested` : undefined}
        action={<button onClick={() => go('/trades')} className="text-accent font-semibold text-[16px]">All trades</button>}
      >
        {d.positions.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {d.positions.map((p) => (
              <PositionCard key={p.id} p={p} />
            ))}
          </div>
        ) : (
          <Card>
            <Empty icon={ShieldCheck} title="No open positions" text="When a top-rated VCP breaks out, the Executor sizes it (10% of capital) and asks you to approve." />
          </Card>
        )}
      </Section>

      {/* Top setups */}
      <Section title="Best setups to watch" subtitle={`Rated by the Analyst · data as of ${d.asOf || '—'}`} action={<button onClick={() => go('/scanner')} className="text-accent font-semibold text-[16px]">Scanner</button>}>
        {d.topSetups.length ? (
          <div className="flex gap-4 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 snap-x">
            {d.topSetups.map((s) => (
              <SetupCard key={s.symbol} s={s} />
            ))}
          </div>
        ) : (
          <Card>
            <Empty icon={Radar} title="No VCP setups right now" text="The Screener checks all Nifty 500 stocks every morning and minute. Patience is part of the strategy." />
          </Card>
        )}
      </Section>

      {/* Activity */}
      <Section title="Live activity">
        <Card className="divide-y hairline">
          {d.events.map((e) => (
            <EventRow key={e.id} e={e} />
          ))}
        </Card>
      </Section>
    </div>
  );
}

function CapitalBar({ cash, invested }) {
  const total = Math.max(1, cash + invested);
  const ip = (invested / total) * 100;
  return (
    <div className="mt-6">
      <div className="flex h-3 rounded-full overflow-hidden bg-card2 gap-[2px]">
        <div className="bg-lav rounded-full transition-all duration-700" style={{ width: `${ip}%` }} />
        <div className="bg-mint/50 rounded-full flex-1" />
      </div>
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 mt-2 text-[15px]">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-lav" />
          Invested <b className="num">{inr(invested)}</b>
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-mint/60" />
          Free cash <b className="num">{inr(cash)}</b>
        </span>
      </div>
    </div>
  );
}

function LoginCard({ configured }) {
  return (
    <Card className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 border-2 border-butter/40">
      <span className="h-14 w-14 shrink-0 rounded-2xl bg-butter-soft text-butter flex items-center justify-center">
        <KeyRound size={28} />
      </span>
      <div className="flex-1">
        <div className="text-[19px] font-bold">Log in to Zerodha for today</div>
        <div className="text-ink2 text-[16px]">{configured ? 'Zerodha requires one login every morning. After that the agents work on their own all day.' : 'First, add your Kite Connect API key in Settings → Zerodha.'}</div>
      </div>
      {configured ? (
        <Button onClick={() => (window.location.href = '/api/kite/login')} icon={KeyRound}>
          Log in to Kite
        </Button>
      ) : (
        <Button onClick={() => go('/settings/zerodha')} tone="soft">
          Open Settings
        </Button>
      )}
    </Card>
  );
}

function DemoBar({ state }) {
  const set = (body) => api('/demo/control', { method: 'POST', body }).then(() => window.dispatchEvent(new Event('pivot:scan')));
  if (!state) return null;
  return (
    <Card className="p-4 sm:p-5 ring-1 ring-butter/30">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex items-center gap-3 flex-1">
          <span className="h-11 w-11 rounded-2xl bg-butter-soft text-butter flex items-center justify-center shrink-0">
            <Gauge size={22} />
          </span>
          <div>
            <div className="font-bold text-[17px]">Demo mode — simulated market</div>
            <div className="text-ink2 text-[14px] hidden sm:block">
              Fictional stocks, fake money. {state.waitingApproval ? <b className="text-butter">Paused: waiting for your decision.</b> : 'Watch the agents work at any speed.'}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            size="sm"
            value={state.speed}
            onChange={(speed) => set({ speed })}
            options={[
              { value: 'slow', label: '1×' },
              { value: 'normal', label: '4×' },
              { value: 'fast', label: '25×' },
              { value: 'turbo', label: 'Max' },
            ]}
          />
          <Button size="sm" tone="soft" icon={state.paused ? Play : Pause} onClick={() => set({ paused: !state.paused })}>
            {state.paused ? 'Play' : 'Pause'}
          </Button>
          <Button size="sm" tone="soft" icon={FastForward} onClick={() => set({ skip: true })}>
            Skip to close
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ApprovalCard({ a, now, onDone }) {
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState('');
  const left = Math.max(0, Math.round((new Date(a.expires) - new Date(now)) / 60000));
  const decide = async (d) => {
    setBusy(d);
    try {
      const r = await api(`/approvals/${a.id}/${d}`, { method: 'POST' });
      setMsg(r.message);
      setTimeout(onDone, 600);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card className="p-5 sm:p-6 ring-2 ring-mint/40 rise min-w-0">
      <div className="flex items-center gap-3 min-w-0">
        <GradeBadge grade={a.grade} score={a.score} size="lg" />
        <button onClick={() => go(`/stock/${a.symbol}`)} className="flex-1 min-w-0 text-[24px] font-bold tracking-tight truncate text-left">
          {a.symbol}
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
        <div className="text-ink2 text-[15px]">
          {a.type === 'reentry' ? '🔁 Re-entry' : '🚀 Breakout'} above {price(a.pivot)} · {a.volPace}× volume
        </div>
        <Pill tone="butter" icon={Timer}>
          {left} min left
        </Pill>
      </div>
      <div className="grid grid-cols-1 min-[440px]:grid-cols-3 gap-2 sm:gap-3 mt-5">
        <Mini label={a.plannedAdd ? 'Buy now' : 'Buy'} value={`${a.qty} × ${price(a.ltp)}`} sub={a.plannedAdd ? `+${a.plannedAdd} more at ${a.addTime} if it holds` : `${inr(a.qty * a.ltp)} · ${a.pctOfCapital}%`} />
        <Mini label="Stop-loss" value={price(a.stop)} sub={`−${a.stopPct}% · risk ${inr(a.riskAmount)}`} tone="text-coral" />
        <Mini label="Sell ⅓ at" value={price(a.target)} sub="+10%, then breakeven" tone="text-mint" />
      </div>
      {a.checks && (
        <div className="flex flex-wrap gap-1.5 mt-4">
          {Object.entries(a.checks)
            .filter(([, v]) => v === true)
            .map(([k]) => (
              <Pill key={k} tone="mint">
                ✓ {CHECK_SHORT[k] || k}
              </Pill>
            ))}
        </div>
      )}
      <ul className="mt-4 space-y-1.5 text-[15px]">
        {(a.good || []).slice(0, 3).map((g) => (
          <li key={g} className="flex gap-2">
            <Check size={18} className="text-mint shrink-0 mt-0.5" />
            {g}
          </li>
        ))}
        {(a.bad || []).slice(0, 2).map((b) => (
          <li key={b} className="flex gap-2 text-ink2">
            <span className="text-butter shrink-0">⚠︎</span>
            {b}
          </li>
        ))}
      </ul>
      {msg ? (
        <div className="mt-5 text-center font-semibold text-[17px]">{msg}</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 mt-5">
          <Button tone="coralSoft" size="lg" icon={X} loading={busy === 'reject'} onClick={() => decide('reject')}>
            Reject
          </Button>
          <Button tone="mint" size="lg" icon={Check} loading={busy === 'approve'} onClick={() => decide('approve')}>
            Approve
          </Button>
          <Button tone="soft" loading={busy === 'half'} onClick={() => decide('half')}>
            ½ Buy half
          </Button>
          <Button tone="soft" loading={busy === 'snooze'} onClick={() => decide('snooze')}>
            ⏰ Remind me in 15 min
          </Button>
        </div>
      )}
      {a.remindAt && !msg && <div className="text-ink3 text-[13px] mt-2 text-center">{a.reminded ? 'Reminded you again' : `I'll remind you at ${new Date(a.remindAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })}`}</div>}
    </Card>
  );
}

const CHECK_SHORT = { buffer: 'Cleared pivot', holdCandle: '15-min close above', vwap: 'Above VWAP', rangePos: 'Strong in range', gap: 'Beat 30-min high', volume: 'Volume' };

function Mini({ label, value, sub, tone = '' }) {
  return (
    <div className="bg-card2 rounded-2xl p-3 min-w-0 flex min-[440px]:block items-baseline justify-between gap-3">
      <div className="text-ink2 text-[13px] font-semibold">{label}</div>
      <div className={`num font-bold text-[17px] mt-0.5 ${tone}`}>{value}</div>
      <div className="text-ink2 text-[12px] mt-0.5 leading-tight">{sub}</div>
    </div>
  );
}

/** Account value, today's change and open P&L — re-priced with every live tick. */
function PortfolioHero({ d }) {
  const q = useAllQuotes();
  // Move each open position from the server's price to the latest live price
  const delta = d.positions.reduce((sum, p) => {
    const live = q?.[p.symbol]?.[0];
    return live && p.ltp ? sum + p.qtyOpen * (live - p.ltp) : sum;
  }, 0);
  const equity = d.capital.equity + delta;
  const today = d.today.dayChange + d.today.realized + delta;
  const openPnl = d.capital.openPnl + delta;
  const dir = useFlash(Math.round(equity));
  return (
    <Card className="p-6 rise">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-ink2 font-semibold text-[15px]">{d.mode === 'live' ? 'Account value' : 'Paper account value'}</div>
          <div className={`text-[44px] sm:text-[52px] font-bold tracking-tight num leading-none mt-2 rounded-lg -mx-1 px-1 inline-block ${dir === 'up' ? 'flash-up' : dir === 'down' ? 'flash-down' : ''}`}>{inr(equity)}</div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-[17px]">
            <span>
              Today <b className={`num ${tone(today)}`}>{signed(today)}</b>
            </span>
            <span>
              Open P&L <b className={`num ${tone(openPnl)}`}>{signed(openPnl)}</b>
            </span>
          </div>
        </div>
        <div className="hidden sm:flex h-14 w-14 rounded-2xl bg-mint-soft text-mint items-center justify-center">
          <TrendingUp size={28} />
        </div>
      </div>
      <CapitalBar cash={d.capital.cash} invested={d.capital.marketValue + delta} />
    </Card>
  );
}

export function PositionCard({ p: base, actions }) {
  // Re-price the position every few seconds from the live Kite stream
  const q = useQuote(base.symbol);
  const p = q && base.status !== 'closed' ? { ...base, ltp: q.ltp, pnlPct: (q.ltp / base.entryPrice - 1) * 100, totalPnl: base.realized + base.qtyOpen * (q.ltp - base.entryPrice) } : base;
  const dir = useFlash(p.ltp);
  return (
    <Card className="p-5 min-w-0" onClick={actions ? undefined : () => go(`/stock/${p.symbol}`)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[21px] font-bold tracking-tight truncate max-w-full">{p.symbol}</span>
            {p.grade && <GradeBadge grade={p.grade} />}
            {p.isReentry && <Pill tone="sky">Re-entry</Pill>}
            {p.stage === 1 && <Pill tone="butter">+{p.plannedAdd} at {p.addTime || '15:15'} if it holds</Pill>}
          </div>
          <div className="text-ink2 text-[15px] num mt-0.5">
            {p.qtyOpen} sh · bought {price(p.entryPrice)} · {p.holdDays}d
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-[22px] font-bold num rounded-md px-1 -mr-1 ${tone(p.pnlPct)} ${dir === 'up' ? 'flash-up' : dir === 'down' ? 'flash-down' : ''}`}>{pct(p.pnlPct)}</div>
          <div className="text-[13px] text-ink2 num">now {price(p.ltp)}</div>
          <div className={`text-[15px] num font-semibold ${tone(p.totalPnl)}`}>{signed(p.totalPnl)}</div>
        </div>
      </div>
      <RiskBar stop={p.stop} entry={p.entryPrice} target={p.target} ltp={p.ltp} partialDone={p.partialDone} />
      {actions}
    </Card>
  );
}

function SetupCard({ s }) {
  return (
    <Card className="p-5 min-w-[260px] max-w-[280px] snap-start shrink-0" onClick={() => go(`/stock/${s.symbol}`)}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="text-[20px] font-bold tracking-tight truncate">{s.symbol}</div>
          <div className="text-ink2 text-[14px] truncate">{s.industry}</div>
        </div>
        <GradeBadge grade={s.grade} />
      </div>
      <div className="flex items-end justify-between mt-4">
        <div>
          <div className="text-[13px] text-ink2 font-semibold">Pivot {price(s.pivot)}</div>
          <LivePrice symbol={s.symbol} fallback={s.ltp} className="font-bold text-[19px]" />
        </div>
        <Contractions list={s.contractions} />
      </div>
      <div className="flex items-center justify-between mt-3">
        <LiveStage symbol={s.symbol} stage={s.stage} pivot={s.pivot} fallback={s.distPivotPct} />
        <span className="text-[15px] num text-ink2">
          <LiveDist symbol={s.symbol} pivot={s.pivot} fallback={s.distPivotPct} />
        </span>
      </div>
      <FlagBadges badges={s.badges} className="mt-2" />
      <div className="mt-3 text-[14px] text-ink2 flex justify-between">
        <span>RS {s.rs}</span>
        <span>Score {s.score}</span>
        <span>Stop {s.stopPct}%</span>
      </div>
    </Card>
  );
}

const LEVEL_TONE = { success: 'text-mint', warn: 'text-butter', error: 'text-coral', info: 'text-ink3' };
const AGENT_BG = { You: 'bg-coral-soft text-coral', Parent: 'bg-lav-soft text-lav', Screener: 'bg-sky-soft text-sky', Analyst: 'bg-peach-soft text-peach', Executor: 'bg-mint-soft text-mint' };

const SYMBOL_RE = /([A-Z][A-Z0-9&-]{1,19})/g;

/** Message text with every known stock symbol turned into a link to its page. */
export function LinkedText({ text, symbols }) {
  if (!symbols || !text) return text;
  return text.split(SYMBOL_RE).map((part, i) =>
    i % 2 === 1 && symbols.has(part) ? (
      <button
        key={i}
        onClick={(ev) => {
          ev.stopPropagation();
          go(`/stock/${encodeURIComponent(part)}`);
        }}
        className="font-semibold text-accent underline decoration-accent/30 underline-offset-[3px] hover:decoration-accent"
      >
        {part}
      </button>
    ) : (
      part
    ),
  );
}

export function EventRow({ e }) {
  const Icon = { You: Gavel, Parent: Crown, Screener: Radar, Analyst: Sparkles, Executor: ShieldCheck }[e.agent] || Activity;
  const symbols = useSymbols();
  const first = symbols && (e.message || '').match(SYMBOL_RE)?.find((m) => symbols.has(m));
  const open = first ? () => go(`/stock/${encodeURIComponent(first)}`) : undefined;
  return (
    <div onClick={open} className={`flex gap-3 px-4 sm:px-5 py-3.5 rise ${open ? 'cursor-pointer hover:bg-card2/60 active:bg-card2' : ''}`}>
      <span className={`h-9 w-9 shrink-0 rounded-xl flex items-center justify-center ${AGENT_BG[e.agent] || 'bg-card2'}`}>
        <Icon size={18} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[14px] font-semibold text-ink2">{e.agent}</span>
          <span className="text-[13px] text-ink3 num shrink-0">{istTime(e.ts)}</span>
        </div>
        <div className={`text-[16px] leading-snug break-words [overflow-wrap:anywhere] ${e.level === 'error' ? 'text-coral' : ''}`}>
          {e.level !== 'info' && <span className={`${LEVEL_TONE[e.level]} mr-1`}>●</span>}
          <LinkedText text={e.message} symbols={symbols} />
        </div>
      </div>
      {open && <ChevronRight size={18} className="text-ink3 shrink-0 self-center" />}
    </div>
  );
}

