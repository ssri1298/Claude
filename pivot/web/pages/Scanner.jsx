import { useState } from 'react';
import { Search, Radar, Eye } from 'lucide-react';
import { useApi, go, price, niceDate } from '../lib.js';
import { Card, LargeTitle, Segmented, GradeBadge, Spinner, Empty, Contractions, StageBadge, Delta, Pill, LivePrice, LiveDist, LiveStage, FlagBadges } from '../components/ui.jsx';
import { ScanStatus } from '../components/AgentPulse.jsx';

export default function Scanner({ query }) {
  const [filter, setFilter] = useState(query.filter || 'setups');
  const [q, setQ] = useState('');
  const isWatch = filter === 'watchlist';
  const isSect = filter === 'sectors';
  const { data } = useApi(isWatch || isSect ? null : `/scanner?filter=${filter}&q=${encodeURIComponent(q)}`, { interval: 15000, events: ['scan'], enabled: !isWatch && !isSect });
  const sect = useApi(isSect ? '/sectors' : null, { enabled: isSect });
  const watch = useApi(isWatch ? '/watchlist' : null, { enabled: isWatch, events: ['scan'] });

  return (
    <div>
      <LargeTitle title="Scanner" subtitle={data ? `${data.universe || 'Nifty 500'} · ${data.total} stocks · data ${data.asOf || '—'}` : 'Nifty 500'} />
      <ScanStatus />
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center mb-5">
        <div className="overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'setups', label: 'VCP setups' },
              { value: 'breakouts', label: 'Buy zone' },
              { value: 'trend', label: 'Uptrend' },
              { value: 'watchlist', label: 'Watchlist' },
              { value: 'sectors', label: 'Sectors' },
              { value: 'all', label: 'All' },
            ]}
          />
        </div>
        {!isWatch && !isSect && (
          <label className="flex items-center gap-2 bg-card rounded-2xl shadow-soft px-4 h-12 sm:ml-auto sm:w-72">
            <Search size={19} className="text-ink3" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search symbol" className="bg-transparent outline-none w-full text-[17px]" />
          </label>
        )}
      </div>

      {isSect ? <Sectors data={sect.data} /> : isWatch ? <Watchlist rows={watch.data} /> : !data ? <Spinner /> : data.rows.length === 0 ? <Card><Empty icon={Radar} title="Nothing here right now" text={filter === 'breakouts' ? 'No setup is trading in its buy zone at the moment.' : 'Try another filter.'} /></Card> : <ScanList rows={data.rows} />}
    </div>
  );
}

/** Industry groups ranked by strength, with their leading stocks. */
function Sectors({ data }) {
  if (!data) return <Spinner />;
  const m = data.market;
  return (
    <div className="space-y-4">
      {m?.notes?.length > 0 && (
        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-2 font-bold text-[17px]">
            Market <Pill tone={{ uptrend: 'mint', pressure: 'butter', downtrend: 'coral' }[m.regime] || 'gray'}>{m.label}</Pill>
          </div>
          <ul className="mt-2 text-ink2 text-[15px] space-y-0.5">
            {m.notes.map((n) => (
              <li key={n}>• {n}</li>
            ))}
          </ul>
        </Card>
      )}
      <Card className="divide-y hairline">
        {data.sectors.map((x, i) => (
          <div key={x.industry} className="px-4 sm:px-5 py-3.5">
            <div className="flex items-center gap-3">
              <span className="w-7 text-ink3 font-bold num shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[17px] truncate">{x.industry}</div>
                <div className="text-ink2 text-[13px]">
                  {x.count} stocks · {x.uptrendPct}% in uptrend · {x.above50Pct}% above 50-DMA{x.setups ? ` · ${x.setups} VCP setup${x.setups === 1 ? '' : 's'}` : ''}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className={`num font-bold text-[18px] ${x.rank >= 70 ? 'text-mint' : x.rank < 35 ? 'text-coral' : ''}`}>{x.rank ?? '—'}</div>
                <div className="text-ink3 text-[11px]">strength</div>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-card2 mt-2 ml-10 overflow-hidden">
              <div className={`h-full rounded-full ${x.rank >= 70 ? 'bg-mint' : x.rank < 35 ? 'bg-coral' : 'bg-lav'}`} style={{ width: `${x.rank || 0}%` }} />
            </div>
            <div className="ml-10 mt-1.5 flex flex-wrap gap-x-3 text-[13px]">
              <span className="text-ink3">Leaders:</span>
              {x.leaders.map((l) => (
                <button key={l.symbol} onClick={() => go(`/stock/${encodeURIComponent(l.symbol)}`)} className="text-accent font-semibold">
                  {l.symbol} <span className="text-ink3 font-normal">RS {l.rs}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function ScanList({ rows }) {
  return (
    <Card className="overflow-hidden">
      <div className="hidden md:grid grid-cols-[1.6fr_0.6fr_1fr_1fr_0.7fr_0.9fr_1fr] gap-3 px-5 py-3 text-[13px] font-semibold text-ink2 border-b hairline">
        <span>Stock</span>
        <span>Grade</span>
        <span className="text-right">Price</span>
        <span className="text-right">Pivot</span>
        <span className="text-right">RS</span>
        <span>Contractions</span>
        <span>Status</span>
      </div>
      <div className="divide-y hairline">
        {rows.map((r) => (
          <button key={r.symbol} onClick={() => go(`/stock/${r.symbol}`)} className="w-full text-left hover:bg-card2/50 active:bg-card2 transition-colors">
            {/* desktop */}
            <div className="hidden md:grid grid-cols-[1.6fr_0.6fr_1fr_1fr_0.7fr_0.9fr_1fr] gap-3 items-center px-5 py-3.5">
              <div className="min-w-0">
                <div className="font-bold text-[18px]">{r.symbol}</div>
                <div className="text-ink2 text-[14px] truncate">{r.industry}</div>
                <FlagBadges badges={r.badges} className="mt-1" />
              </div>
              <div>
                <GradeBadge grade={r.grade} />
                <span className="ml-2 text-ink2 text-[14px] num">{r.score}</span>
              </div>
              <div className="text-right num">
                <LivePrice symbol={r.symbol} fallback={{ ltp: r.ltp, changePct: r.changePct }} showChange className="font-semibold" />
              </div>
              <div className="text-right num">
                <div className="font-semibold">{r.pivot ? price(r.pivot) : '—'}</div>
                <div className="text-[14px] text-ink2">{r.pivot ? <LiveDist symbol={r.symbol} pivot={r.pivot} fallback={r.distPivotPct} /> : ''}</div>
              </div>
              <div className="text-right num font-semibold">
                {r.rs}
                {r.rsLineHigh && <span className="ml-1 text-mint" title="RS line at new high">▲</span>}
              </div>
              <Contractions list={r.contractions} />
              <div>
                <LiveStage symbol={r.symbol} stage={r.stage} pivot={r.pivot} fallback={r.distPivotPct} />
              </div>
            </div>
            {/* mobile */}
            <div className="md:hidden flex items-center gap-3 px-4 py-3.5">
              <GradeBadge grade={r.grade} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-[18px] truncate">{r.symbol}</span>
                  <LivePrice symbol={r.symbol} fallback={r.ltp} className="font-semibold" />
                </div>
                <div className="flex items-center justify-between gap-2 text-[14px] text-ink2">
                  <span className="truncate">
                    {r.pivot ? <>Pivot {price(r.pivot)} · <LiveDist symbol={r.symbol} pivot={r.pivot} fallback={r.distPivotPct} /></> : r.industry}
                  </span>
                  <span className="num">RS {r.rs}</span>
                </div>
                <FlagBadges badges={r.badges} className="mt-1" />
              </div>
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}

const WSTATUS = {
  watching: { tone: 'sky', label: 'Watching' },
  triggered: { tone: 'mint', label: 'Bought' },
  dropped: { tone: 'gray', label: 'Dropped' },
  failed: { tone: 'coral', label: 'Failed' },
  extended: { tone: 'peach', label: 'Ran away' },
};

function Watchlist({ rows }) {
  if (!rows) return <Spinner />;
  if (!rows.length) return <Card><Empty icon={Eye} title="Watchlist is empty" text="Every VCP setup the Screener finds is saved here and followed day after day — even when there is no capital to buy it." /></Card>;
  return (
    <>
      <p className="text-ink2 text-[16px] mb-4 px-1">Every setup found is remembered and followed for future days — even when there is no free capital.</p>
      <Card className="divide-y hairline overflow-hidden">
        {rows.map((r) => {
          const s = WSTATUS[r.status] || WSTATUS.dropped;
          return (
            <button key={r.symbol} onClick={() => go(`/stock/${r.symbol}`)} className="w-full text-left flex items-center gap-3 px-4 sm:px-5 py-3.5 hover:bg-card2/50">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[18px]">{r.symbol}</span>
                  <Pill tone={s.tone}>{s.label}</Pill>
                </div>
                <div className="text-ink2 text-[14px] truncate">{r.note}</div>
              </div>
              <div className="text-right text-[14px] num shrink-0">
                <div className="font-semibold text-[16px]">{price(r.pivot)}</div>
                <div className="text-ink2">
                  since {niceDate(r.first_seen)} · {r.days_watched}d
                </div>
              </div>
            </button>
          );
        })}
      </Card>
    </>
  );
}
