import { useEffect, useState } from 'react';
import { Crown, Radar, Sparkles, ShieldCheck, Pause, Play, RefreshCw } from 'lucide-react';
import { api, useApi } from '../lib.js';
import { Card, LargeTitle, Segmented, Spinner, Button, Section } from '../components/ui.jsx';
import { EventRow } from './Today.jsx';

const SCHEDULE = [
  ['08:00', 'Parent', 'Checks the Zerodha login — sends you a one-tap login link on Telegram if needed', Crown],
  ['08:30', 'Screener', 'Downloads Nifty 500 daily data, ranks relative strength, checks the trend template, finds VCP bases and pivots', Radar],
  ['08:35', 'Parent', 'Morning brief to Telegram: market health and the best setups', Crown],
  ['09:15 – 15:30', 'Screener', 'Every minute: all 500 live prices vs. pivots; breakout = above pivot, within 5%, volume pace ≥ 1.5×', Radar],
  ['on breakout', 'Analyst', 'Rates the setup 0–100, applies the market filter and minimum score, ranks the best first', Sparkles],
  ['on breakout', 'Executor', 'Sizes the trade (10% of capital), sets the stop (max 6%), asks for your approval, buys, places a backup GTT', ShieldCheck],
  ['every second', 'Executor', 'Stop-loss · sell ⅓ at +10% · stop to breakeven · re-entry watch', ShieldCheck],
  ['15:20', 'Executor', 'Trailing check: exits the rest if the stock closes below its 21-day EMA', ShieldCheck],
  ['15:40', 'Parent', 'Fresh analysis for tomorrow, equity snapshot, evening report', Crown],
];
const TONE = { Parent: 'bg-lav-soft text-lav', Screener: 'bg-sky-soft text-sky', Analyst: 'bg-peach-soft text-peach', Executor: 'bg-mint-soft text-mint' };

export default function Agents() {
  const [agent, setAgent] = useState('all');
  const ov = useApi('/overview', { interval: 5000 });
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
      {ov.data && (
        <div className="grid sm:grid-cols-2 gap-4">
          {ov.data.agents.map((a) => (
            <Card key={a.key} className="p-5">
              <div className="flex items-center gap-3">
                <span className={`h-12 w-12 rounded-2xl flex items-center justify-center ${TONE[a.name]}`}>{{ parent: <Crown />, screener: <Radar />, analyst: <Sparkles />, executor: <ShieldCheck /> }[a.key]}</span>
                <div>
                  <div className="text-[20px] font-bold">{a.name}</div>
                  <div className="text-ink2 text-[14px]">{a.role}</div>
                </div>
              </div>
              <div className="mt-3 text-[16px]">{a.detail}</div>
              {a.last && <div className="mt-2 text-ink2 text-[14px] line-clamp-2">Last: {a.last.message}</div>}
            </Card>
          ))}
        </div>
      )}

      <Section title="Daily routine" subtitle="Runs automatically on every trading day (IST)">
        <Card className="p-2 sm:p-3">
          {SCHEDULE.map(([t, who, what, Icon], i) => (
            <div key={i} className="flex gap-4 px-3 py-3">
              <div className="w-[104px] shrink-0 text-[15px] font-semibold num text-ink2 pt-1">{t}</div>
              <span className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${TONE[who]}`}>
                <Icon size={18} />
              </span>
              <div>
                <div className="font-semibold">{who}</div>
                <div className="text-ink2 text-[15px] leading-snug">{what}</div>
              </div>
            </div>
          ))}
        </Card>
      </Section>

      <Section
        title="Activity log"
        action={
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
            ]}
          />
        }
      >
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
