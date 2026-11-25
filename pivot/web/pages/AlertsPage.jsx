// All price alerts in one place.
import { Bell, Trash2, RotateCcw } from 'lucide-react';
import { api, useApi, go, price, istDateTime } from '../lib.js';
import { Card, LargeTitle, Spinner, Empty, Section } from '../components/ui.jsx';
import { useQuote } from '../live.js';

export default function AlertsPage() {
  const { data, reload } = useApi('/alerts', { events: ['alerts'] });
  if (!data) return <Spinner />;
  const active = data.filter((a) => a.active);
  const done = data.filter((a) => !a.active);
  return (
    <div className="space-y-7">
      <LargeTitle title="Price alerts" subtitle="Set them on any stock's page" />
      {!data.length ? (
        <Card>
          <Empty icon={Bell} title="No alerts yet" text="Open any stock (Scanner → tap a stock) and use “Price alerts” to get a notification when it reaches your price." />
        </Card>
      ) : (
        <>
          <Section title="Waiting" subtitle={`${active.length} active`}>
            <Card className="divide-y hairline">{active.length ? active.map((a) => <Row key={a.id} a={a} reload={reload} />) : <div className="px-5 py-4 text-ink2">None active.</div>}</Card>
          </Section>
          {done.length > 0 && (
            <Section title="Triggered">
              <Card className="divide-y hairline">
                {done.map((a) => (
                  <Row key={a.id} a={a} reload={reload} />
                ))}
              </Card>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Row({ a, reload }) {
  const q = useQuote(a.symbol);
  const ltp = q?.ltp ?? a.ltp;
  const away = ltp ? ((a.price / ltp - 1) * 100).toFixed(1) : null;
  return (
    <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5">
      <Bell size={20} className={a.active ? 'text-accent shrink-0' : 'text-ink3 shrink-0'} />
      <button onClick={() => go(`/stock/${encodeURIComponent(a.symbol)}`)} className="flex-1 min-w-0 text-left">
        <div className="font-bold text-[17px]">
          {a.symbol} <span className="font-semibold text-ink2 text-[15px]">{a.op === 'below' ? 'below' : 'above'} {price(a.price)}</span>
        </div>
        <div className="text-ink2 text-[13px] truncate">
          {a.active ? `Now ${price(ltp)}${away != null ? ` · ${Math.abs(away)}% away` : ''}${a.note ? ' · ' + a.note : ''}` : `Triggered ${istDateTime(a.triggered)} at ${price(a.triggeredPrice)}`}
        </div>
      </button>
      {!a.active && (
        <button onClick={() => api(`/alerts/${a.id}/rearm`, { method: 'POST' }).then(reload)} className="text-accent" aria-label="Turn on again">
          <RotateCcw size={19} />
        </button>
      )}
      <button onClick={() => api(`/alerts/${a.id}`, { method: 'DELETE' }).then(reload)} className="text-ink3 hover:text-coral" aria-label="Delete">
        <Trash2 size={19} />
      </button>
    </div>
  );
}
