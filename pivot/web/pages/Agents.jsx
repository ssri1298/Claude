import { useEffect, useState } from 'react';
import { Crown, Radar, Sparkles, ShieldCheck, Pause, Play, RefreshCw } from 'lucide-react';
import { api, useApi } from '../lib.js';
import { Card, LargeTitle, Segmented, Spinner, Button, Section } from '../components/ui.jsx';
import { EventRow } from './Today.jsx';
import AgentPulse from '../components/AgentPulse.jsx';

const SCHEDULE = [
  ['08:00', 'Parent', 'Checks the Zerodha login — sends you a one-tap login link on Telegram if needed', Crown],
  ['08:30', 'Screener', 'Downloads daily data for the watched stocks (Nifty 500, Total Market or all NSE), ranks relative strength, checks the trend template, finds VCP bases and pivots', Radar],
  ['08:35', 'Parent', 'Morning brief to Telegram: market health and the best setups', Crown],
  ['09:15 – 15:30', 'Screener', 'Every minute: all 500 live prices vs. pivots. A cross only arms a stock; the breakout is confirmed by a 15-min close above the pivot, VWAP, strong range position and volume', Radar],
  ['on breakout', 'Analyst', 'Rates the setup 0–100, applies the market filter and minimum score, ranks the best first', Sparkles],
  ['on breakout', 'Executor', 'Sizes the trade (10% of capital), sets the stop (max 6%), asks for your approval, buys, places a backup GTT', ShieldCheck],
  ['every second', 'Executor', 'Stop-loss · sell ⅓ at +10% · stop to breakeven · re-entry watch', ShieldCheck],
  ['15:15', 'Executor', 'Two-stage buy: adds the second half of today’s new positions if the breakout held', ShieldCheck],
  ['15:20', 'Executor', 'Close check: failed breakouts (back below the pivot) are sold; time exit after 7 trading days without the stop or +10%; trailing exit below the 21-day EMA', ShieldCheck],
  ['15:40', 'Parent', 'Fresh analysis for tomorrow, equity snapshot, evening report', Crown],
];
const TONE = { Parent: 'bg-lav-soft text-lav', Screener: 'bg-sky-soft text-sky', Analyst: 'bg-peach-soft text-peach', Executor: 'bg-mint-soft text-mint' };

export default function Agents() {
  const [agent, setAgent] = useState('all');
  const ov = useApi('/overview', { interval: 5000, events: ['event'] });
  const [events, setEvents] = useState(null);
  const [busy, setBusy] = useState('');
  const load = () => api(`/events${agent === 'all' ? '' : `?agent=${agent}`}`).then(setEvents);
  useEffect(() => {
    load();
    const h = () => load();
    window.addEventListener('pivot:event', h);
    return () => window.removeEventListener('pivot:event', h);
  }, [agent]);
  const [more, setMore] = useState(false);
  const loadMore = async () => {
    setMore(true);
    const last = events[events.length - 1]?.id;
    const older = await api(`/events?before=${last}${agent === 'all' ? '' : `&agent=${agent}`}`);
    setEvents([...events, ...older]);
    setMore(false);
  };
  const act = async (path) => {
    setBusy(path);
    try {
      await api(path, { method: 'POST' });
      ov.reload();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy('');
    }
  };
  const paused = ov.data?.paused;

  return (
    <div className="space-y-7">
      <LargeTitle
        title="Agents"
        subtitle="Your autonomous team"
        right={
          <div className="flex gap-2">
            <Button size="sm" tone="soft" icon={RefreshCw} loading={busy === '/agents/prepare'} onClick={() => act('/agents/prepare')}>
              Re-scan
            </Button>
            <Button size="sm" tone={paused ? 'mint' : 'soft'} icon={paused ? Play : Pause} onClick={() => act(paused ? '/agents/resume' : '/agents/pause')}>
              {paused ? 'Resume' : 'Pause buys'}
            </Button>
          </div>
        }
      />
      <AgentPulse last={Object.fromEntries((ov.data?.agents || []).map((a) => [a.key, a.last?.message]))} />

      <Section title="Daily routine" subtitle="Runs automatically on every trading day (IST)">
        <Card className="p-2 sm:p-3">
          {SCHEDULE.map(([t, who, what, Icon], i) => (
            <div key={i} className="flex gap-3 sm:gap-4 px-2 sm:px-3 py-3">
              <div className="w-[72px] sm:w-[104px] shrink-0 text-[14px] sm:text-[15px] font-semibold num text-ink2 pt-1 leading-tight">{t}</div>
              <span className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${TONE[who]}`}>
                <Icon size={18} />
              </span>
              <div className="min-w-0">
                <div className="font-semibold">{who}</div>
                <div className="text-ink2 text-[15px] leading-snug">{what}</div>
              </div>
            </div>
          ))}
        </Card>
      </Section>

      <Section title="Activity log">
        <div className="overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 mb-3">
          <Segmented
            size="sm"
            value={agent}
            onChange={setAgent}
            options={[
              { value: 'all', label: 'All' },
              { value: 'Screener', label: 'Screener' },
              { value: 'Analyst', label: 'Analyst' },
              { value: 'Executor', label: 'Executor' },
              { value: 'Parent', label: 'Parent' },
              { value: 'You', label: 'You' },
            ]}
          />
        </div>
        {!events ? (
          <Spinner />
        ) : (
          <Card className="divide-y hairline">
            {events.map((e) => (
              <EventRow key={e.id} e={e} />
            ))}
            {events.length >= 100 && (
              <div className="p-4 text-center">
                <Button tone="ghost" onClick={loadMore} loading={more}>
                  Load older
                </Button>
              </div>
            )}
          </Card>
        )}
      </Section>
    </div>
  );
}
