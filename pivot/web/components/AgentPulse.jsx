// "Agents at work" — a live panel showing what each agent is doing right now.
// Updates with every price push (every 2–3 seconds); the "ago" labels and countdowns tick every second.
import { Crown, Radar, Sparkles, ShieldCheck } from 'lucide-react';
import { go } from '../lib.js';
import { useAgents, useBeat, useNow, toLocal, ago } from '../live.js';
import { Card } from './ui.jsx';

export const AGENTS = [
  { key: 'parent', name: 'Parent', role: 'Runs the day', Icon: Crown, tile: 'bg-lav-soft text-lav', bar: 'text-lav bg-lav' },
  { key: 'screener', name: 'Screener', role: 'Scans the Nifty 500', Icon: Radar, tile: 'bg-sky-soft text-sky', bar: 'text-sky bg-sky' },
  { key: 'analyst', name: 'Analyst', role: 'Rates breakouts', Icon: Sparkles, tile: 'bg-peach-soft text-peach', bar: 'text-peach bg-peach' },
  { key: 'executor', name: 'Executor', role: 'Buys & guards trades', Icon: ShieldCheck, tile: 'bg-mint-soft text-mint', bar: 'text-mint bg-mint' },
];

const STATE = {
  busy: ['Working', 'bg-mint-soft text-mint'],
  watching: ['On watch', 'bg-sky-soft text-sky'],
  waiting: ['Needs you', 'bg-butter-soft text-butter'],
  idle: ['Resting', 'bg-card2 text-ink3'],
};

/** Animated icon tile: a rotating sweep around it while the agent works, a soft pulse while on watch. */
export function AgentIcon({ agent, s, size = 44 }) {
  const { Icon, tile } = agent;
  const busy = s === 'busy';
  return (
    <span className={`relative shrink-0 rounded-2xl overflow-hidden p-[2.5px] ${busy ? `agent-sweep ${tile.split(' ')[1]}` : ''}`} style={{ width: size, height: size }}>
      <span className={`relative z-[1] h-full w-full rounded-[14px] flex items-center justify-center ${tile}`}>
        <Icon size={size * 0.46} className={s === 'watching' ? 'breathe' : busy && agent.key === 'screener' ? 'radar-spin' : ''} />
      </span>
    </span>
  );
}

function Dots() {
  return (
    <span className="typing-dots" aria-hidden>
      <span />
      <span />
      <span />
    </span>
  );
}

/** Thin bar under an agent: download progress, countdown to the next scan, or a shimmer while working. */
function ActivityBar({ p, agent, now }) {
  if (p.progress != null) {
    return (
      <div className="mt-2 h-1.5 rounded-full bg-card2 overflow-hidden">
        <div className={`h-full rounded-full ${agent.bar.split(' ')[1]} transition-[width] duration-700`} style={{ width: `${Math.round(p.progress * 100)}%` }} />
      </div>
    );
  }
  if (p.nextAt) {
    const left = Math.max(0, Math.round((toLocal(p.nextAt) - now) / 1000));
    const frac = 1 - Math.min(60, left) / 60;
    return (
      <div className="mt-2 flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-card2 overflow-hidden">
          <div className={`h-full rounded-full ${agent.bar.split(' ')[1]} transition-[width] duration-1000 ease-linear`} style={{ width: `${frac * 100}%` }} />
        </div>
        <span className="text-[12px] text-ink3 num shrink-0 w-[92px] text-right">{left ? `next scan ${left}s` : 'scanning…'}</span>
      </div>
    );
  }
  if (p.s === 'busy') return <div className={`mt-2 h-1.5 rounded-full bg-card2 overflow-hidden relative shimmer ${agent.bar.split(' ')[0]}`} />;
  return null;
}

function AgentRow({ agent, p, now, last }) {
  const [label, cls] = STATE[p.s] || STATE.idle;
  const when = ago(toLocal(p.at), now);
  return (
    <div className="flex gap-3.5 px-4 sm:px-5 py-4">
      <AgentIcon agent={agent} s={p.s} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[17px] font-bold">{agent.name}</span>
          <span className={`text-[12px] font-bold rounded-full px-2 py-0.5 ${cls}`}>{label}</span>
          {when && p.s !== 'idle' && <span className="ml-auto text-[12px] text-ink3 num">{when}</span>}
        </div>
        <div key={p.task} className="fade-in text-[15px] text-ink2 leading-snug mt-0.5 break-words [overflow-wrap:anywhere]">
          {p.task}
          {p.s === 'busy' && <Dots />}
        </div>
        {p.next && (
          <div className="text-[13px] text-ink3 mt-0.5">
            Next: <span className="num font-semibold text-ink2">{p.next.at}</span> {p.next.label}
          </div>
        )}
        {last && <div className="text-[13px] text-ink3 mt-1 line-clamp-1">Last: {last}</div>}
        <ActivityBar p={p} agent={agent} now={now} />
      </div>
    </div>
  );
}

/** Live status line for the Kite price feed + heartbeat dot that blinks on every update. */
export function FeedStatus({ className = '' }) {
  const a = useAgents();
  const beat = useBeat();
  const now = useNow(1000);
  if (!a) return null;
  const live = a.feed?.live;
  const tick = toLocal(a.feed?.lastTick);
  return (
    <span className={`flex items-center gap-1.5 text-[13px] font-semibold text-ink2 ${className}`}>
      <span key={beat} className={`h-2 w-2 rounded-full ${live ? 'bg-mint beat' : 'bg-ink3/60'}`} />
      {live ? `Live prices · ${ago(tick, now) || 'just now'}` : 'Prices paused'}
    </span>
  );
}

/** The full panel. `last` maps agent key → latest log message (optional). */
export default function AgentPulse({ last = {}, title = true, onClick }) {
  const a = useAgents();
  const now = useNow(1000);
  if (!a) return null;
  return (
    <Card className="overflow-hidden" onClick={onClick}>
      {title && (
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 pt-4 pb-1">
          <div className="text-[13px] font-bold uppercase tracking-wide text-ink3">Agents at work</div>
          <FeedStatus />
        </div>
      )}
      <div className="divide-y hairline">
        {AGENTS.map((ag) => (
          <AgentRow key={ag.key} agent={ag} p={a[ag.key] || { s: 'idle', task: '' }} now={now} last={last[ag.key]} />
        ))}
      </div>
    </Card>
  );
}

/** Four tiny dots in the top bar — one per agent — that pulse while that agent works. Tap → Agents page. */
export function AgentDots() {
  const a = useAgents();
  if (!a) return null;
  const active = AGENTS.filter((ag) => ['busy', 'watching'].includes(a[ag.key]?.s)).length;
  return (
    <button onClick={() => go('/agents')} className="flex items-center gap-1 sm:gap-1.5 rounded-full bg-card2 px-2 sm:px-2.5 h-7" aria-label={`${active} agents active`}>
      {AGENTS.map((ag, i) => {
        const s = a[ag.key]?.s;
        const color = ag.bar.split(' ')[1];
        return <span key={ag.key} className={`h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full ${s === 'idle' ? 'bg-ink3/40' : color} ${s === 'busy' ? 'dot-wave' : ''}`} style={{ animationDelay: `${i * 0.18}s` }} />;
      })}
      <span className="text-[12px] font-bold text-ink2 hidden sm:inline">{active ? `${active} working` : 'resting'}</span>
    </button>
  );
}

/** One-line scanner status for the Scanner page header. */
export function ScanStatus() {
  const a = useAgents();
  const now = useNow(1000);
  const p = a?.screener;
  if (!p) return null;
  return (
    <Card className="px-4 py-3 mb-5">
      <div className="flex items-center gap-3">
        <AgentIcon agent={AGENTS[1]} s={p.s} size={36} />
        <div className="flex-1 min-w-0">
          <div key={p.task} className="fade-in text-[15px] leading-snug">
            {p.task}
            {p.s === 'busy' && <Dots />}
          </div>
          <ActivityBar p={p} agent={AGENTS[1]} now={now} />
        </div>
      </div>
    </Card>
  );
}
