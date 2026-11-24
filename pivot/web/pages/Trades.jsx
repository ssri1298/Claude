import { useState } from 'react';
import { Briefcase, Ghost, History } from 'lucide-react';
import { api, useApi, go, price, pct, signed, tone, inr, niceDate, istDateTime } from '../lib.js';
import { Card, LargeTitle, Segmented, Spinner, Empty, Button, Sheet, Pill, GradeBadge, NumberField } from '../components/ui.jsx';
import { PositionCard } from './Today.jsx';

export default function Trades({ query }) {
  const [tab, setTab] = useState(query.tab || 'open');
  const ov = useApi('/overview', { events: ['positions'] });
  const mode = ov.data?.mode || 'paper';
  const kind = tab === 'shadow' ? 'shadow' : mode;
  const status = tab === 'closed' ? 'closed' : tab === 'shadow' ? 'all' : 'open';
  const open = useApi(`/positions?kind=${kind}&status=open`, { interval: 5000, events: ['positions'] });
  const closed = useApi(`/positions?kind=${kind}&status=closed`, { events: ['positions'], enabled: tab !== 'open' });

  return (
    <div>
      <LargeTitle title="Trades" subtitle={mode === 'live' ? 'Live account' : 'Paper account'} />
      <Segmented
        value={tab}
        onChange={setTab}
        className="mb-5"
        options={[
          { value: 'open', label: 'Open' },
          { value: 'closed', label: 'Closed' },
          { value: 'shadow', label: 'Shadow' },
        ]}
      />
      {tab === 'open' && <OpenList rows={open.data} reload={open.reload} />}
      {tab === 'closed' && <ClosedList rows={closed.data} />}
      {status === 'all' && (
        <>
          <p className="text-ink2 text-[16px] mb-4 px-1">
            Shadow trades are signals Pivot could not or did not take — no free capital, market filter, low score, or you said no. They are tracked with the same rules so you can learn what you missed.
          </p>
          <h3 className="text-[19px] font-bold mb-3 px-1">Following now</h3>
          {open.data?.length ? <ShadowList rows={open.data} /> : <Card><Empty icon={Ghost} title="No shadow trades open" /></Card>}
          <h3 className="text-[19px] font-bold mt-7 mb-3 px-1">Finished</h3>
          {closed.data?.length ? <ShadowList rows={closed.data} /> : <Card><Empty icon={History} title="None yet" /></Card>}
        </>
      )}
    </div>
  );
}

function OpenList({ rows, reload }) {
  const [stopFor, setStopFor] = useState(null);
  const [confirm, setConfirm] = useState(null);
  if (!rows) return <Spinner />;
  if (!rows.length) return <Card><Empty icon={Briefcase} title="No open positions" text="Approved breakouts appear here with their stop, profit target and trailing status." /></Card>;
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        {rows.map((p) => (
          <PositionCard
            key={p.id}
            p={p}
            actions={
              <div className="mt-4">
                <div className="grid grid-cols-3 gap-2 text-[14px] text-ink2 mb-4">
                  <span>
                    Value <b className="text-ink num block text-[16px]">{inr(p.value)}</b>
                  </span>
                  <span>
                    Stop distance <b className="text-ink num block text-[16px]">{pct(p.stopDistPct)}</b>
                  </span>
                  <span>
                    Trailing <b className="text-ink block text-[16px]">{p.partialDone ? '21-EMA' : 'After +10%'}</b>
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" tone="soft" onClick={() => go(`/stock/${p.symbol}`)}>
                    Chart
                  </Button>
                  <Button size="sm" tone="lav" onClick={() => setStopFor(p)}>
                    Move stop
                  </Button>
                  <Button size="sm" tone="mintSoft" onClick={() => setConfirm({ p, fraction: 1 / 3 })}>
                    Sell ⅓
                  </Button>
                  <Button size="sm" tone="coralSoft" onClick={() => setConfirm({ p, fraction: 1 })}>
                    Sell all
                  </Button>
                  {p.gtt && <Pill tone="mint">Backup GTT ✓</Pill>}
                </div>
              </div>
            }
          />
        ))}
      </div>
      <StopSheet p={stopFor} onClose={() => setStopFor(null)} onDone={reload} />
      <ConfirmSell c={confirm} onClose={() => setConfirm(null)} onDone={reload} />
    </>
  );
}

function StopSheet({ p, onClose, onDone }) {
  const [v, setV] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (!p) return null;
  const val = v ?? p.stop;
  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      await api(`/positions/${p.id}/stop`, { method: 'POST', body: { stop: val } });
      onDone();
      onClose();
      setV(null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open title={`Move stop · ${p.symbol}`} onClose={onClose}>
      <p className="text-ink2">Current price {price(p.ltp)} · bought at {price(p.entryPrice)}</p>
      <div className="flex items-center justify-between mt-5">
        <span className="font-semibold text-[18px]">New stop</span>
        <NumberField value={val} onChange={setV} step={0.05} width="w-36" />
      </div>
      <div className="flex gap-2 mt-4 flex-wrap">
        <Button size="sm" tone="soft" onClick={() => setV(p.entryPrice)}>
          Breakeven
        </Button>
        <Button size="sm" tone="soft" onClick={() => setV(Number((p.ltp * 0.95).toFixed(2)))}>
          5% below now
        </Button>
      </div>
      {err && <div className="text-coral font-semibold mt-4">{err}</div>}
      <Button className="w-full mt-6" size="lg" loading={busy} onClick={save}>
        Save stop
      </Button>
    </Sheet>
  );
}

function ConfirmSell({ c, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!c) return null;
  const qty = c.fraction >= 1 ? c.p.qtyOpen : Math.max(1, Math.floor(c.p.qtyOpen * c.fraction));
  const go2 = async () => {
    setBusy(true);
    try {
      await api(`/positions/${c.p.id}/exit`, { method: 'POST', body: { fraction: c.fraction } });
      onDone();
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open title={`Sell ${c.p.symbol}?`} onClose={onClose}>
      <p className="text-[18px]">
        Sell <b>{qty}</b> of {c.p.qtyOpen} shares at about <b>{price(c.p.ltp)}</b> ({pct(c.p.pnlPct)}).
      </p>
      {c.p.kind === 'live' && <p className="text-coral font-semibold mt-2">This places a real order with Zerodha.</p>}
      {err && <div className="text-coral font-semibold mt-3">{err}</div>}
      <div className="grid grid-cols-2 gap-3 mt-6">
        <Button tone="soft" size="lg" onClick={onClose}>
          Cancel
        </Button>
        <Button tone="coral" size="lg" loading={busy} onClick={go2}>
          Sell
        </Button>
      </div>
    </Sheet>
  );
}

const REASON = { stop: 'Stop-loss', trail: 'Trailing exit', manual: 'You sold', outside: 'Outside Pivot', partial: 'Partial' };

function ClosedList({ rows }) {
  const [open, setOpen] = useState(null);
  if (!rows) return <Spinner />;
  if (!rows.length) return <Card><Empty icon={History} title="No closed trades yet" /></Card>;
  return (
    <>
      <Card className="divide-y hairline overflow-hidden">
        {rows.map((p) => {
          const realPct = (p.realized / (p.entryPrice * p.qtyInitial)) * 100;
          return (
            <button key={p.id} onClick={() => setOpen(p)} className="w-full text-left flex items-center gap-3 px-4 sm:px-5 py-3.5 hover:bg-card2/50">
              {p.grade && <GradeBadge grade={p.grade} />}
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[18px]">{p.symbol}</div>
                <div className="text-ink2 text-[14px]">
                  {niceDate(p.entryDate)} → {niceDate(p.exitDate)} · {p.holdDays}d · {p.exitReason === 'stop' && p.partialDone ? 'Breakeven stop' : REASON[p.exitReason] || p.exitReason}
                </div>
              </div>
              <div className="text-right">
                <div className={`font-bold num text-[18px] ${tone(p.realized)}`}>{signed(p.realized)}</div>
                <div className={`num text-[14px] ${tone(realPct)}`}>{pct(realPct)}</div>
              </div>
            </button>
          );
        })}
      </Card>
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.symbol}>
        {open && (
          <div className="space-y-2">
            {open.fills.map((f, i) => (
              <div key={i} className="flex justify-between bg-card rounded-2xl px-4 py-3">
                <div>
                  <div className="font-semibold">
                    {f.side === 'BUY' ? 'Bought' : 'Sold'} {f.qty} @ {price(f.price)}
                  </div>
                  <div className="text-ink2 text-[14px]">{f.reason}</div>
                </div>
                <div className="text-ink2 text-[14px] text-right">
                  {istDateTime(f.ts)}
                  <div>charges {inr(f.charges, 2)}</div>
                </div>
              </div>
            ))}
            <div className="flex justify-between px-1 pt-3 text-[18px]">
              <span className="font-semibold">Net result</span>
              <b className={`num ${tone(open.realized)}`}>{signed(open.realized)}</b>
            </div>
          </div>
        )}
      </Sheet>
    </>
  );
}

function ShadowList({ rows }) {
  return (
    <Card className="divide-y hairline overflow-hidden">
      {rows.map((p) => {
        const res = p.status === 'open' ? p.pnlPct : (p.realized / (p.entryPrice * p.qtyInitial)) * 100;
        return (
          <button key={p.id} onClick={() => go(`/stock/${p.symbol}`)} className="w-full text-left flex items-center gap-3 px-4 sm:px-5 py-3.5 hover:bg-card2/50">
            {p.grade && <GradeBadge grade={p.grade} />}
            <div className="flex-1 min-w-0">
              <div className="font-bold text-[18px]">{p.symbol}</div>
              <div className="text-ink2 text-[14px] truncate">
                {niceDate(p.entryDate)} @ {price(p.entryPrice)} · {p.shadowReason || 'Not taken'}
              </div>
            </div>
            <div className={`font-bold num text-[18px] ${tone(res)}`}>{pct(res)}</div>
          </button>
        );
      })}
    </Card>
  );
}
