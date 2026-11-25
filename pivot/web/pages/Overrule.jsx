// OVERRULE — you have the final say over every agent decision.
//   • Buy a signal the agents passed on (score, market filter, limits, stop too wide, rejected/expired)
//   • Buy any analysed stock right now
//   • Keep a position longer: switch off its failed-breakout / time / trailing exit or the +10% partial sale
//   • Allow buys today despite a market correction · pause all new buys
//   • Block stocks the agents must never buy
// Stops are never switched off — you can only move them.
import { useState } from 'react';
import { Gavel, ShieldCheck, Ban, ShoppingCart, Hand, History, Lock } from 'lucide-react';
import { api, useApi, go, inr, price, pct, signed, tone } from '../lib.js';
import { Card, LargeTitle, Section, Pill, GradeBadge, Button, Spinner, Empty, Sheet, Toggle } from '../components/ui.jsx';
import { EventRow } from './Today.jsx';
import { StopSheet, ConfirmSell } from './Trades.jsx';
import { useQuote } from '../live.js';

const WHY = {
  skipped_score: ['Score too low', 'peach'],
  skipped_regime: ['Market correction', 'butter'],
  skipped_capital: ['Limits / cash', 'butter'],
  skipped_paused: ['Buys paused', 'gray'],
  skipped_stop: ['Stop too wide', 'coral'],
  skipped_held: ['Already held', 'gray'],
  skipped_blocked: ['Blocked by you', 'coral'],
  rejected: ['You rejected', 'gray'],
  expired: ['Expired', 'gray'],
  ranked: ['Not bought', 'gray'],
};

export default function Overrule() {
  const { data, error, reload } = useApi('/overrule', { interval: 8000, events: ['positions', 'scan', 'approval'] });
  const [buy, setBuy] = useState(null);
  const [stopFor, setStopFor] = useState(null);
  const [sell, setSell] = useState(null);
  if (error && !data) return <Empty title="Can't load" text={error} />;
  if (!data) return <Spinner />;
  const open = data.phase === 'market';

  return (
    <div className="space-y-7">
      <LargeTitle title="Overrule" subtitle="You have the final say over the agents" />

      <Card className="p-4 sm:p-5 flex gap-3.5 items-start">
        <span className="h-11 w-11 shrink-0 rounded-2xl bg-lav-soft text-lav flex items-center justify-center">
          <Gavel size={22} />
        </span>
        <div className="text-[15px] text-ink2 leading-snug">
          Every change here is logged below and the agents follow it straight away.{' '}
          <b className="text-ink">Stop-losses can never be switched off</b> — you can move them, but every position always has one.
          {data.mode === 'live' && <span className="text-coral font-semibold"> You are in live mode: buys and sells are real orders.</span>}
        </div>
      </Card>

      {/* ---------------- Buy decisions */}
      <Section title="Buy what the agents passed on" subtitle={open ? "Today's breakouts the agents did not buy" : 'Available while the market is open (09:15–15:30)'}>
        {data.signals.length ? (
          <Card className="divide-y hairline">
            {data.signals.map((s) => (
              <SignalRow key={s.id} s={s} open={open} onBuy={() => setBuy({ signal: s })} />
            ))}
          </Card>
        ) : (
          <Card>
            <Empty icon={ShoppingCart} title="Nothing passed on today" text="When the agents skip a breakout — low score, market correction, no capital, stop too wide — it shows up here so you can buy it anyway." />
          </Card>
        )}
        <BuyAny candidates={data.candidates} open={open} onBuy={(symbol) => setBuy({ symbol })} />
      </Section>

      {/* ---------------- Exit decisions */}
      <Section title="Keep a position longer" subtitle="Switch off an automatic exit for one stock. The stop-loss always stays on.">
        {data.positions.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {data.positions.map((p) => (
              <HoldCard key={p.id} p={p} rules={data.rules} onChanged={reload} onStop={() => setStopFor(p)} onSell={(fraction) => setSell({ p, fraction })} />
            ))}
          </div>
        ) : (
          <Card>
            <Empty icon={ShieldCheck} title="No open positions" text="Once you hold stocks, you can keep them past the agents' automatic exits here." />
          </Card>
        )}
      </Section>

      {/* ---------------- Market & pause */}
      <Section title="Market filter">
        <MarketCard m={data.market} paused={data.paused} onChanged={reload} />
      </Section>

      {/* ---------------- Block list */}
      <Section title="Stocks the agents must never buy" subtitle="Results, news, or you just don't like the chart">
        <BlockList blocked={data.blocked} candidates={data.candidates} onChanged={reload} />
      </Section>

      {/* ---------------- History */}
      <Section title="Your overrules">
        {data.history.length ? (
          <Card className="divide-y hairline">
            {data.history.map((e) => (
              <EventRow key={e.id} e={e} />
            ))}
          </Card>
        ) : (
          <Card>
            <Empty icon={History} title="No overrules yet" text="Everything you change on this page is recorded here." />
          </Card>
        )}
      </Section>

      <ConfirmBuy b={buy} onClose={() => setBuy(null)} onDone={reload} />
      <StopSheet p={stopFor} onClose={() => setStopFor(null)} onDone={reload} />
      <ConfirmSell c={sell} onClose={() => setSell(null)} onDone={reload} />
    </div>
  );
}

function SignalRow({ s, open, onBuy }) {
  const q = useQuote(s.symbol);
  const ltp = q?.ltp ?? s.ltp ?? s.price;
  const dist = s.pivot ? (ltp / s.pivot - 1) * 100 : null;
  const [label, t] = WHY[s.status] || [s.status.replace(/_/g, ' '), 'gray'];
  return (
    <div className="flex items-center gap-3 px-4 sm:px-5 py-4">
      <button onClick={() => go(`/stock/${s.symbol}`)} className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[18px] font-bold">{s.symbol}</span>
          {s.grade && <GradeBadge grade={s.grade} score={s.score} />}
          <Pill tone={t}>{label}</Pill>
        </div>
        <div className="text-ink2 text-[14px] leading-snug mt-0.5">{s.reason || '—'}</div>
        <div className="text-[14px] mt-0.5 num">
          {price(ltp)} {dist != null && <span className={tone(dist)}>· {pct(dist)} vs pivot {price(s.pivot)}</span>}
        </div>
      </button>
      <Button size="sm" tone="lav" disabled={!open || s.held} onClick={onBuy}>
        {s.held ? 'Held' : 'Buy anyway'}
      </Button>
    </div>
  );
}

function BuyAny({ candidates, open, onBuy }) {
  const [sym, setSym] = useState('');
  return (
    <Card className="p-4 sm:p-5 mt-4">
      <div className="font-bold text-[17px]">Buy a stock the agents haven't picked</div>
      <div className="text-ink2 text-[14px] mt-0.5">Sized and stopped by the usual rules (10% of capital, chart stop up to the maximum).</div>
      <div className="flex gap-2 mt-3">
        <input
          list="overrule-cands"
          value={sym}
          onChange={(e) => setSym(e.target.value.toUpperCase())}
          placeholder="Symbol, e.g. TATAMOTORS"
          className="flex-1 min-w-0 bg-card2 rounded-xl px-4 py-3 text-[17px] outline-none focus:ring-2 ring-accent/40 uppercase"
          autoComplete="off"
          spellCheck={false}
        />
        <datalist id="overrule-cands">
          {candidates.map((c) => (
            <option key={c.symbol} value={c.symbol}>{`${c.grade || ''} ${c.score ?? ''}${c.setup ? ' · VCP' : ''}`}</option>
          ))}
        </datalist>
        <Button tone="lav" disabled={!open || !sym.trim()} onClick={() => onBuy(sym.trim())}>
          Buy
        </Button>
      </div>
    </Card>
  );
}

function ConfirmBuy({ b, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  if (!b) return null;
  const sym = b.signal?.symbol || b.symbol;
  const close = () => {
    setErr('');
    setDone(null);
    onClose();
  };
  const go2 = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await api('/overrule/buy', { method: 'POST', body: b.signal ? { signalId: b.signal.id } : { symbol: sym } });
      setDone(r);
      onDone();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open title={`Buy ${sym} anyway?`} onClose={close}>
      {done ? (
        <>
          <p className="text-[18px]">
            ✅ Order sent: <b>{done.qty}</b> shares of {sym} at about <b>{price(done.price)}</b>, stop <b>{price(done.stop)}</b>.
          </p>
          <p className="text-ink2 mt-2">The Executor now manages it like any other position.</p>
          <Button className="w-full mt-6" size="lg" onClick={close}>
            Done
          </Button>
        </>
      ) : (
        <>
          {b.signal && (
            <p className="text-[17px]">
              The agents skipped it because: <b>{b.signal.reason || WHY[b.signal.status]?.[0]}</b>
            </p>
          )}
          <ul className="mt-3 space-y-1.5 text-[16px] text-ink2">
            <li>• Buys at the current price (10% of capital; half now and the rest at 15:15 if two-stage buying is on)</li>
            <li>• Stop at the chart stop — or your maximum % if that is too wide</li>
            <li>• Then managed normally: stop, ⅓ at +10%, trailing</li>
          </ul>
          {err && <div className="text-coral font-semibold mt-4">{err}</div>}
          <div className="grid grid-cols-2 gap-3 mt-6">
            <Button tone="soft" size="lg" onClick={close}>
              Cancel
            </Button>
            <Button tone="accent" size="lg" loading={busy} onClick={go2}>
              Buy now
            </Button>
          </div>
        </>
      )}
    </Sheet>
  );
}

function HoldCard({ p: base, rules, onChanged, onStop, onSell }) {
  const q = useQuote(base.symbol);
  const ltp = q?.ltp ?? base.ltp;
  const pnlPct = (ltp / base.entryPrice - 1) * 100;
  const [busy, setBusy] = useState('');
  const set = async (flag, keepRuleOn) => {
    setBusy(flag);
    try {
      await api('/overrule/hold', { method: 'POST', body: { positionId: base.id, flag, on: !keepRuleOn } });
      onChanged();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy('');
    }
  };
  const h = base.holds || {};
  const trailName = { ema21: 'a close below the 21-day EMA', sma50: 'a close below the 50-day average', pct10: 'a 10% fall from the high' }[rules.trailMethod];
  const items = [
    !base.partialDone && rules.failedExit && ['noFailedExit', 'Failed-breakout exit', `Sells if it closes back below the pivot in the first ${rules.failedExit} days`],
    !base.partialDone && rules.timeExit && ['noTimeExit', 'Time exit', `Sells after ${rules.timeExit} trading days without the stop or +${rules.partialAtPct}%`],
    !base.partialDone && ['noPartial', `Sell ⅓ at +${rules.partialAtPct}%`, 'Books one third and moves the stop to breakeven'],
    rules.trailMethod !== 'none' && trailName && ['noTrail', 'Trailing exit', `After the partial sale, sells the rest on ${trailName}`],
  ].filter(Boolean);
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <button onClick={() => go(`/stock/${base.symbol}`)} className="text-left min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[20px] font-bold truncate">{base.symbol}</span>
            {base.grade && <GradeBadge grade={base.grade} />}
          </div>
          <div className="text-ink2 text-[14px] num">
            {base.qtyOpen} shares · bought {price(base.entryPrice)}
          </div>
        </button>
        <div className="text-right shrink-0">
          <div className="num font-bold text-[19px]">{price(ltp)}</div>
          <div className={`num font-semibold text-[15px] ${tone(pnlPct)}`}>{pct(pnlPct)}</div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-card2 px-4 py-3 flex items-center gap-3">
        <Lock size={18} className="text-mint shrink-0" />
        <div className="flex-1 text-[15px]">
          Stop-loss <b className="num">{price(base.stop)}</b> <span className="text-ink2">· always on</span>
        </div>
        <Button size="sm" tone="soft" onClick={onStop}>
          Move
        </Button>
      </div>

      <div className="mt-3 divide-y hairline">
        {items.map(([flag, title, sub]) => (
          <div key={flag} className="flex items-center gap-3 py-3">
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[16px]">
                {title} {h[flag] && <Pill tone="butter">Off by you</Pill>}
              </div>
              <div className="text-ink2 text-[13px] leading-snug">{sub}</div>
            </div>
            <Toggle checked={!h[flag]} disabled={busy === flag} label={title} onChange={(v) => set(flag, v)} />
          </div>
        ))}
        {!items.length && <div className="py-3 text-ink2 text-[14px]">No automatic exits left except the stop.</div>}
      </div>

      <div className="flex gap-2 mt-3">
        <Button size="sm" tone="mintSoft" onClick={() => onSell(1 / 3)}>
          Sell ⅓ now
        </Button>
        <Button size="sm" tone="coralSoft" onClick={() => onSell(1)}>
          Sell all now
        </Button>
      </div>
    </Card>
  );
}

function MarketCard({ m, paused, onChanged }) {
  const [busy, setBusy] = useState('');
  const call = async (key, path, body) => {
    setBusy(key);
    try {
      await api(path, { method: 'POST', body });
      onChanged();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy('');
    }
  };
  const regime = { uptrend: ['Confirmed uptrend', 'mint'], pressure: ['Uptrend under pressure', 'butter'], downtrend: ['Correction', 'coral'] }[m.regime] || ['Unknown', 'gray'];
  const filterText = { pause: 'pauses new buys in a correction', half: 'halves position size in a correction', off: 'is switched off' }[m.filter] || '';
  return (
    <Card className="divide-y hairline">
      <div className="flex items-center gap-3 px-4 sm:px-5 py-4">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[17px]">Buy today even in a correction</div>
          <div className="text-ink2 text-[14px] leading-snug">
            Market now: <Pill tone={regime[1]}>{regime[0]}</Pill> · your filter {filterText}. Resets tomorrow.
          </div>
        </div>
        <Toggle checked={m.correctionToday} disabled={busy === 'c'} label="Buy today even in a correction" onChange={(v) => call('c', '/overrule/correction', { allow: v })} />
      </div>
      <div className="flex items-center gap-3 px-4 sm:px-5 py-4">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[17px]">Pause all new buys</div>
          <div className="text-ink2 text-[14px] leading-snug">The agents keep scanning and protecting open positions, but buy nothing.</div>
        </div>
        <Toggle checked={paused} disabled={busy === 'p'} label="Pause all new buys" onChange={(v) => call('p', v ? '/agents/pause' : '/agents/resume')} />
      </div>
    </Card>
  );
}

function BlockList({ blocked, candidates, onChanged }) {
  const [sym, setSym] = useState('');
  const [busy, setBusy] = useState('');
  const call = async (symbol, on) => {
    setBusy(symbol);
    try {
      await api('/overrule/block', { method: 'POST', body: { symbol, blocked: on } });
      if (on) setSym('');
      onChanged();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy('');
    }
  };
  return (
    <Card className="divide-y hairline">
      <div className="flex gap-2 p-4 sm:p-5">
        <input
          list="overrule-block"
          value={sym}
          onChange={(e) => setSym(e.target.value.toUpperCase())}
          placeholder="Symbol to block"
          className="flex-1 min-w-0 bg-card2 rounded-xl px-4 py-3 text-[17px] outline-none focus:ring-2 ring-accent/40 uppercase"
          autoComplete="off"
          spellCheck={false}
        />
        <datalist id="overrule-block">
          {candidates.map((c) => (
            <option key={c.symbol} value={c.symbol} />
          ))}
        </datalist>
        <Button tone="coralSoft" icon={Ban} disabled={!sym.trim()} loading={busy === sym.trim()} onClick={() => call(sym.trim(), true)}>
          Block
        </Button>
      </div>
      {blocked.map((b) => (
        <div key={b.symbol} className="flex items-center gap-3 px-4 sm:px-5 py-3.5">
          <span className="h-9 w-9 shrink-0 rounded-xl bg-coral-soft text-coral flex items-center justify-center">
            <Hand size={18} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-[17px]">{b.symbol}</div>
            <div className="text-ink2 text-[13px] truncate">
              {b.name ? b.name + ' · ' : ''}blocked {new Date(b.ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </div>
          </div>
          <Button size="sm" tone="soft" loading={busy === b.symbol} onClick={() => call(b.symbol, false)}>
            Unblock
          </Button>
        </div>
      ))}
      {!blocked.length && <div className="px-5 py-4 text-ink2 text-[15px]">No blocked stocks.</div>}
    </Card>
  );
}
