import { useEffect, useState } from 'react';
import { Sun, Radar, Briefcase, BarChart3, FlaskConical, Bot, Settings as SettingsIcon, MoreHorizontal, Diamond } from 'lucide-react';
import { api, useRoute, go, connectStream, disconnectStream } from './lib.js';
import { Spinner } from './components/ui.jsx';
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

const NAV = [
  { path: '/', label: 'Today', icon: Sun },
  { path: '/scanner', label: 'Scanner', icon: Radar },
  { path: '/trades', label: 'Trades', icon: Briefcase },
  { path: '/stats', label: 'Dashboard', icon: BarChart3 },
  { path: '/backtest', label: 'Backtest', icon: FlaskConical },
  { path: '/agents', label: 'Agents', icon: Bot },
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
    if (auth?.loggedIn) connectStream();
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
    case '/settings':
      page = <Settings query={route.query} />;
      break;
    case '/more':
      page = <More nav={NAV.slice(4)} />;
      break;
    default:
      page = <Today />;
  }
  const isActive = (p) => (p === '/' ? top === '/' : top === p || (p === '/scanner' && top === '/stock') || (p === '/more' && ['/backtest', '/agents', '/settings'].includes(top)));

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
        <div className="mx-auto max-w-[1180px] px-4 sm:px-6 lg:px-10 pt-[max(env(safe-area-inset-top),16px)] pb-32 lg:pb-12">{page}</div>
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

export function Logo({ size = 40 }) {
  return (
    <span className="inline-flex items-center justify-center rounded-[12px] text-white shadow-soft" style={{ width: size, height: size, background: 'linear-gradient(135deg, #a5b4fc 0%, #8b80f9 45%, #f0abfc 100%)' }}>
      <Diamond size={size * 0.52} strokeWidth={2.4} />
    </span>
  );
}
