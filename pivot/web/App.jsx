import { useEffect, useState } from 'react';
import { Sun, Radar, Briefcase, BarChart3, FlaskConical, Bot, Settings as SettingsIcon, MoreHorizontal, Diamond, Gavel } from 'lucide-react';
import { api, useRoute, go, connectStream, disconnectStream, price } from './lib.js';
import { startLive, useIndex, usePhase, useFlash } from './live.js';
import { Spinner } from './components/ui.jsx';
import { AgentDots } from './components/AgentPulse.jsx';
import Login from './pages/Login.jsx';
import Today from './pages/Today.jsx';
import Scanner from './pages/Scanner.jsx';
import Stock from './pages/Stock.jsx';
import Trades from './pages/Trades.jsx';
import Stats from './pages/Stats.jsx';
import Backtest from './pages/Backtest.jsx';
import Agents from './pages/Agents.jsx';
import Settings from './pages/Settings.jsx';
import More from './pages/More.jsx';
import Overrule from './pages/Overrule.jsx';

const NAV = [
  { path: '/', label: 'Today', icon: Sun },
  { path: '/scanner', label: 'Scanner', icon: Radar },
  { path: '/trades', label: 'Trades', icon: Briefcase },
  { path: '/stats', label: 'Dashboard', icon: BarChart3 },
  { path: '/backtest', label: 'Backtest', icon: FlaskConical },
  { path: '/agents', label: 'Agents', icon: Bot },
  { path: '/overrule', label: 'Overrule', icon: Gavel },
  { path: '/settings', label: 'Settings', icon: SettingsIcon },
];
const TABS = [NAV[0], NAV[1], NAV[2], NAV[3], { path: '/more', label: 'More', icon: MoreHorizontal }];

export default function App() {
  const [auth, setAuth] = useState(null);
  const route = useRoute();

  const check = () =>
    api('/auth/status')
      .then(setAuth)
      .catch(() => setAuth({ setup: true, loggedIn: false }));
  useEffect(() => {
    check();
    const h = () => setAuth((a) => ({ ...(a || {}), loggedIn: false }));
    window.addEventListener('pivot:logout', h);
    return () => window.removeEventListener('pivot:logout', h);
  }, []);
  useEffect(() => {
    if (auth?.loggedIn) {
      connectStream();
      startLive();
    }
    else disconnectStream();
  }, [auth?.loggedIn]);

  if (!auth) return <Spinner className="pt-40" />;
  if (!auth.loggedIn) return <Login setup={auth.setup} demo={auth.demo} onDone={check} />;

  const top = '/' + (route.parts[0] || '');
  let page;
  switch (top) {
    case '/scanner':
      page = <Scanner query={route.query} />;
      break;
    case '/stock':
      page = <Stock symbol={route.parts[1]} />;
      break;
    case '/trades':
      page = <Trades query={route.query} />;
      break;
    case '/stats':
      page = <Stats />;
      break;
    case '/backtest':
      page = <Backtest />;
      break;
    case '/agents':
      page = <Agents />;
      break;
    case '/overrule':
      page = <Overrule />;
      break;
    case '/settings':
      page = <Settings query={route.query} />;
      break;
    case '/more':
      page = <More nav={NAV.slice(4)} />;
      break;
    default:
      page = <Today />;
  }
  const isActive = (p) => (p === '/' ? top === '/' : top === p || (p === '/scanner' && top === '/stock') || (p === '/more' && ['/backtest', '/agents', '/overrule', '/settings'].includes(top)));

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-[264px] shrink-0 h-screen sticky top-0 px-4 py-6 border-r hairline">
        <button onClick={() => go('/')} className="flex items-center gap-3 px-3 mb-8">
          <Logo />
          <div className="text-left">
            <div className="text-[22px] font-bold tracking-tight leading-none">Pivot</div>
            <div className="text-ink2 text-[13px] mt-1">VCP trading agents</div>
          </div>
        </button>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => (
            <button
              key={n.path}
              onClick={() => go(n.path)}
              className={`flex items-center gap-3 px-3 h-12 rounded-2xl text-[17px] font-semibold transition-colors ${isActive(n.path) ? 'bg-card shadow-soft text-ink' : 'text-ink2 hover:bg-card/60 hover:text-ink'}`}
            >
              <n.icon size={21} strokeWidth={2.1} className={isActive(n.path) ? 'text-accent' : ''} />
              {n.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto px-3 text-[13px] text-ink3 leading-snug">
          Trading involves risk. Pivot follows your rules but cannot guarantee profits.
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <NiftyBar />
        <div className="mx-auto max-w-[1180px] px-4 sm:px-6 lg:px-10 pt-3 pb-32 lg:pb-12 overflow-x-clip">{page}</div>
      </main>

      {/* Mobile tab bar */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 glass border-t hairline safe-bottom">
        <div className="grid grid-cols-5 h-[64px]">
          {TABS.map((n) => (
            <button key={n.path} onClick={() => go(n.path)} className={`flex flex-col items-center justify-center gap-0.5 text-[12px] font-semibold ${isActive(n.path) ? 'text-accent' : 'text-ink3'}`}>
              <n.icon size={25} strokeWidth={isActive(n.path) ? 2.4 : 2} />
              {n.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

const PHASE = { market: ['Market open', 'bg-mint pulse-dot text-mint'], 'pre-market': ['Pre-market', 'bg-butter text-butter'], 'post-market': ['Market closed', 'bg-ink3 text-ink3'], holiday: ['Holiday', 'bg-ink3 text-ink3'] };

/** Sticky live NIFTY 50 bar at the top of every page. */
function NiftyBar() {
  const ix = useIndex();
  const phase = usePhase();
  const dir = useFlash(ix?.ltp);
  const up = (ix?.change ?? 0) >= 0;
  const [label, dot] = PHASE[phase] || ['', 'bg-ink3 text-ink3'];
  return (
    <div className="sticky top-0 z-30 glass border-b hairline pt-[env(safe-area-inset-top)]">
      <div className="mx-auto max-w-[1180px] px-4 sm:px-6 lg:px-10 h-12 flex items-center gap-2 sm:gap-3">
        <span className="font-bold text-[15px] tracking-wide whitespace-nowrap">
          NIFTY<span className="hidden min-[360px]:inline"> 50</span>
        </span>
        {ix ? (
          <>
            <span className={`num font-bold text-[18px] rounded-md px-1 ${dir === 'up' ? 'flash-up' : dir === 'down' ? 'flash-down' : ''}`}>{price(ix.ltp).replace('₹', '')}</span>
            <span className={`num font-semibold text-[15px] whitespace-nowrap ${up ? 'text-mint' : 'text-coral'}`}>
              {up ? '▲' : '▼'} <span className="hidden sm:inline">{Math.abs(ix.change).toFixed(2)} (</span>
              {up ? '+' : '−'}
              {Math.abs(ix.changePct).toFixed(2)}%<span className="hidden sm:inline">)</span>
            </span>
          </>
        ) : (
          <span className="text-ink3 text-[15px]">waiting for Kite…</span>
        )}
        <span className="ml-auto flex items-center gap-2 sm:gap-2.5 shrink-0">
          <AgentDots />
          {label && (
            <span className="hidden min-[360px]:flex items-center gap-1.5 text-[13px] font-semibold text-ink2 whitespace-nowrap">
              <span className={`h-2 w-2 rounded-full ${dot}`} />
              <span className="hidden sm:inline">{label}</span>
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

export function Logo({ size = 40 }) {
  return (
    <span className="inline-flex items-center justify-center rounded-[12px] text-white shadow-soft" style={{ width: size, height: size, background: 'linear-gradient(135deg, #a5b4fc 0%, #8b80f9 45%, #f0abfc 100%)' }}>
      <Diamond size={size * 0.52} strokeWidth={2.4} />
    </span>
  );
}
