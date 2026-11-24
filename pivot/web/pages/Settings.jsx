import { useEffect, useState } from 'react';
import { ShieldCheck, Wallet, Target, Repeat, KeyRound, Send, Bell, Palette, Database, LogOut, Copy, Check, CalendarOff, Zap, TrendingUp } from 'lucide-react';
import { api, useApi, applyTheme, getTheme } from '../lib.js';
import { LargeTitle, List, Row, Toggle, Segmented, NumberField, TextField, Button, Spinner, Sheet, Pill } from '../components/ui.jsx';

export default function Settings({ query }) {
  const { data, reload } = useApi('/settings', { events: ['settings', 'kite'] });
  const [saving, setSaving] = useState(false);
  const [liveAsk, setLiveAsk] = useState(false);
  const [msg, setMsg] = useState(query.kite && query.kite !== 'connected' ? `Kite login: ${query.kite}` : '');
  if (!data) return <Spinner />;
  const s = data.settings;
  const r = s.rules;

  const save = async (patch) => {
    setSaving(true);
    setMsg('');
    try {
      await api('/settings', { method: 'PUT', body: patch });
      await reload();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setSaving(false);
    }
  };
  const rule = (k) => (v) => save({ rules: { [k]: v } });
  const c = r.confirm;
  const conf = (patch) => save({ rules: { confirm: patch } });

  return (
    <div className="space-y-7 pb-10">
      <LargeTitle title="Settings" right={saving ? <Pill tone="lav">Saving…</Pill> : null} />
      {msg && <div className="bg-coral-soft text-coral rounded-2xl px-4 py-3 font-semibold">{msg}</div>}

      <Group title="Trading">
        <Row
          icon={Zap}
          iconTone={s.tradingMode === 'live' ? 'coral' : 'lav'}
          title="Trading mode"
          subtitle={s.tradingMode === 'live' ? 'Real orders in your Zerodha account' : 'Pretend money on live prices — safe practice'}
          right={<Segmented size="sm" value={s.tradingMode} onChange={(v) => (v === 'live' ? setLiveAsk(true) : save({ tradingMode: 'paper' }))} options={[{ value: 'paper', label: 'Paper' }, { value: 'live', label: 'Live' }]} />}
        />
        <Row icon={ShieldCheck} iconTone="sky" title="Ask me before every buy" subtitle="Off = fully automatic. Stops and profit-taking always run automatically." right={<Toggle checked={s.confirmTrades} onChange={(v) => save({ confirmTrades: v })} />} />
        <Row title="Approval window" subtitle="Signal expires if you don't answer" right={<NumberField value={s.approvalMinutes} onChange={(v) => save({ approvalMinutes: v })} suffix="min" width="w-20" />} />
        <Row title="Pause new buys" subtitle="Open positions stay protected" right={<Toggle checked={s.agentsPaused} onChange={(v) => save({ agentsPaused: v })} />} />
      </Group>

      <Group title="Capital" footer="Each new trade uses this share of your total capital. If there is not enough free cash, the signal is saved as a shadow trade and the setup stays on the watchlist.">
        <Row icon={Wallet} iconTone="mint" title="Capital source" right={<Segmented size="sm" value={s.capitalSource} onChange={(v) => save({ capitalSource: v })} options={[{ value: 'kite', label: 'Kite funds' }, { value: 'fixed', label: 'Fixed' }]} />} />
        {s.capitalSource === 'fixed' && <Row title="Capital for Pivot" right={<NumberField value={s.fixedCapital} onChange={(v) => save({ fixedCapital: v })} step={10000} suffix="₹" width="w-36" />} />}
        <Row title="Paper-trading capital" right={<NumberField value={s.paperCapital} onChange={(v) => save({ paperCapital: v })} step={10000} suffix="₹" width="w-36" />} />
        <Row title="Position size" right={<NumberField value={r.positionPct} onChange={rule('positionPct')} suffix="% each" width="w-20" />} />
        <Row title="Maximum open positions" right={<NumberField value={r.maxPositions} onChange={rule('maxPositions')} width="w-20" />} />
        <Row title="Maximum per industry" right={<NumberField value={r.maxPerIndustry} onChange={rule('maxPerIndustry')} width="w-20" />} />
      </Group>

      <Group title="Stop-loss & profit taking">
        <Row icon={Target} iconTone="coral" title="Maximum stop" subtitle="Chart stop below the last contraction, never wider than this" right={<NumberField value={r.maxStopPct} onChange={rule('maxStopPct')} suffix="%" step={0.5} width="w-20" />} />
        <Row title="Minimum stop" subtitle="Very tight chart stops are widened to this" right={<NumberField value={r.minStopPct} onChange={rule('minStopPct')} suffix="%" step={0.5} width="w-20" />} />
        <Row title="If the chart stop is wider" right={<Segmented size="sm" value={r.wideStopAction} onChange={rule('wideStopAction')} options={[{ value: 'skip', label: 'Skip trade' }, { value: 'cap', label: `Use ${r.maxStopPct}%` }]} />} />
        <Row title="Sell one third at" right={<NumberField value={r.partialAtPct} onChange={rule('partialAtPct')} suffix="% gain" width="w-20" />} />
        <Row title="Move stop to breakeven after that" right={<Toggle checked={r.breakevenAfterPartial} onChange={rule('breakevenAfterPartial')} />} />
        <Row title="Trailing exit for the rest">
          <Segmented
            size="sm"
            className="mt-2"
            value={r.trailMethod}
            onChange={rule('trailMethod')}
            options={[
              { value: 'ema21', label: 'Close < 21 EMA' },
              { value: 'pct10', label: '10% trail' },
              { value: 'sma50', label: 'Close < 50 DMA' },
              { value: 'none', label: 'Breakeven only' },
            ]}
          />
        </Row>
        <Row title="Backup stop at Zerodha (GTT)" subtitle="Sells even if the server goes down" right={<Toggle checked={s.backupGtt} onChange={(v) => save({ backupGtt: v })} />} />
      </Group>

      <Group title="Entry rules">
        <Row icon={TrendingUp} iconTone="mint" title="Minimum setup score" subtitle="65 = grade B · 75 = A · 85 = A+" right={<NumberField value={r.minScore} onChange={rule('minScore')} width="w-20" />} />
        <Row title="Buy zone above pivot" subtitle="Never chase further than this" right={<NumberField value={r.buyZonePct} onChange={rule('buyZonePct')} suffix="%" step={0.5} width="w-20" />} />
        <Row title="Breakout volume" subtitle="Projected volume vs 50-day average" right={<NumberField value={r.minVolPace} onChange={rule('minVolPace')} suffix="×" step={0.1} width="w-20" />} />
        <Row title="In a market correction">
          <Segmented size="sm" className="mt-2" value={s.marketFilter} onChange={(v) => save({ marketFilter: v })} options={[{ value: 'pause', label: 'Pause new buys' }, { value: 'half', label: 'Half size' }, { value: 'off', label: 'Ignore' }]} />
        </Row>
      </Group>

      <Group title="Breakout confirmation" footer="The first tick above the pivot only 'arms' a stock. Pivot buys once these checks pass. Every breakout is also tracked from its first tick, so the Dashboard can show which checks really help.">
        <Row icon={ShieldCheck} iconTone="lav" title="Confirm breakouts" subtitle="Off = buy on the first tick above the pivot" right={<Toggle checked={c.enabled} onChange={(v) => conf({ enabled: v })} />} />
        {c.enabled && (
          <>
            <Row title="15-min candle closes above the pivot" subtitle="Filters quick pokes that fail" right={<Toggle checked={c.holdCandle} onChange={(v) => conf({ holdCandle: v })} />} />
            <Row title="Price above VWAP" subtitle="Today's average traded price" right={<Toggle checked={c.vwap} onChange={(v) => conf({ vwap: v })} />} />
            <Row title="Top third of today's range" subtitle="No long upper wick" right={<Toggle checked={c.rangePos} onChange={(v) => conf({ rangePos: v })} />} />
            <Row title="Gap-up rule" subtitle="Opened above the pivot → wait for the 30-min high to break" right={<Toggle checked={c.gapRule} onChange={(v) => conf({ gapRule: v })} />} />
            <Row title="Clear the pivot by" right={<NumberField value={c.pivotBufferPct} onChange={(v) => conf({ pivotBufferPct: v })} suffix="%" step={0.1} width="w-20" />} />
          </>
        )}
      </Group>

      <Group title="Two-stage buy & failed breakouts" footer="Half the position is bought at the confirmed breakout; the other half at 3:15 pm only if it is still above the pivot with good volume. A new buy that closes back below its pivot is sold at the close (usually a 1–3% loss instead of the full stop).">
        <Row icon={Zap} iconTone="butter" title="Two-stage buy" right={<Toggle checked={r.twoStage.enabled} onChange={(v) => save({ rules: { twoStage: { enabled: v } } })} />} />
        {r.twoStage.enabled && <Row title="First part" right={<NumberField value={Math.round(r.twoStage.firstFraction * 100)} onChange={(v) => save({ rules: { twoStage: { firstFraction: Math.min(0.9, Math.max(0.1, v / 100)) } } })} suffix="%" width="w-20" />} />}
        <Row title="Sell failed breakouts early" subtitle="Close back below the pivot" right={<Toggle checked={r.failedExit.enabled} onChange={(v) => save({ rules: { failedExit: { enabled: v } } })} />} />
        {r.failedExit.enabled && <Row title="Within the first" right={<NumberField value={r.failedExit.days} onChange={(v) => save({ rules: { failedExit: { days: v } } })} suffix="days" width="w-20" />} />}
      </Group>

      <Group title="Re-entry" footer="If a stock stops you out but reclaims its pivot on strong volume within the window, Pivot proposes buying it again.">
        <Row icon={Repeat} iconTone="sky" title="Re-buy after a stop-out" right={<Toggle checked={r.reentry.enabled} onChange={(v) => save({ rules: { reentry: { enabled: v } } })} />} />
        <Row title="Window" right={<NumberField value={r.reentry.windowDays} onChange={(v) => save({ rules: { reentry: { windowDays: v } } })} suffix="days" width="w-20" />} />
        <Row title="Max re-entries per setup" right={<NumberField value={r.reentry.maxPerSetup} onChange={(v) => save({ rules: { reentry: { maxPerSetup: v } } })} width="w-20" />} />
      </Group>

      {!data.demo && <ZerodhaGroup data={data} reload={reload} />}
      <PushGroup />
      <TelegramGroup data={data} reload={reload} />

      <Group title="What to notify me about">
        {[
          ['proposals', 'Trade approvals'],
          ['fills', 'Buys filled'],
          ['exits', 'Stops, partial profits & exits'],
          ['morningBrief', 'Morning brief'],
          ['eveningReport', 'Evening report'],
          ['nearPivot', 'Stock within 1% of pivot'],
        ].map(([k, l]) => (
          <Row key={k} icon={k === 'proposals' ? Bell : undefined} iconTone="peach" title={l} right={<Toggle checked={s.notify[k] !== false} onChange={(v) => save({ notify: { [k]: v } })} />} />
        ))}
      </Group>

      <HolidaysGroup s={s} save={save} />

      <Group title="Appearance">
        <Row icon={Palette} iconTone="rose" title="Theme" right={<ThemePicker />} />
      </Group>

      <Group title="Data">
        <Row icon={Database} iconTone="sky" title="Stocks tracked" subtitle={`Nifty 500 list · history from ${data.historyFrom || '—'}`} right={<b className="num">{data.universeCount}</b>} />
        {!data.demo && <UploadNifty500 />}
        {data.demo && (
          <Row
            title="Restart the demo"
            subtitle="Clears demo trades and starts the simulated market again"
            right={
              <Button size="sm" tone="coralSoft" onClick={() => confirm('Reset the demo?') && api('/demo/reset', { method: 'POST' }).then(() => setTimeout(() => location.reload(), 2500))}>
                Reset
              </Button>
            }
          />
        )}
      </Group>

      <List>
        <Row icon={LogOut} iconTone="gray" title="Log out" onClick={() => api('/auth/logout', { method: 'POST' }).then(() => location.reload())} />
      </List>

      <Sheet open={liveAsk} onClose={() => setLiveAsk(false)} title="Switch to live trading?">
        <ul className="space-y-2.5 text-[17px]">
          <li>• Pivot will place <b>real orders</b> in your Zerodha account.</li>
          <li>• {s.confirmTrades ? 'Every buy still waits for your Approve tap.' : <b className="text-coral">Buys will happen automatically without asking.</b>}</li>
          <li>• Stops, the ⅓ profit at +10% and trailing exits run automatically.</li>
          <li>• Your server's fixed IP must be registered in the Kite developer console.</li>
          <li>• Paper-trade for a few weeks first and check the Dashboard.</li>
        </ul>
        <div className="grid grid-cols-2 gap-3 mt-6">
          <Button tone="soft" size="lg" onClick={() => setLiveAsk(false)}>
            Stay on paper
          </Button>
          <Button
            tone="coral"
            size="lg"
            onClick={async () => {
              setLiveAsk(false);
              await save({ tradingMode: 'live' });
            }}
          >
            Go live
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function Group({ title, footer, children }) {
  return (
    <section>
      <h2 className="text-[15px] font-semibold uppercase tracking-wide text-ink2 px-4 mb-2">{title}</h2>
      <List>{children}</List>
      {footer && <p className="text-ink2 text-[14px] px-4 mt-2 leading-snug">{footer}</p>}
    </section>
  );
}

function ThemePicker() {
  const [t, setT] = useState(getTheme());
  return (
    <Segmented
      size="sm"
      value={t}
      onChange={(v) => {
        setT(v);
        applyTheme(v);
      }}
      options={[
        { value: 'system', label: 'Auto' },
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ]}
    />
  );
}

function CopyText({ text }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setOk(true);
        setTimeout(() => setOk(false), 1500);
      }}
      className="flex items-center gap-2 bg-card2 rounded-xl px-3 py-2 text-[14px] font-mono break-all text-left w-full mt-2"
    >
      <span className="flex-1">{text}</span>
      {ok ? <Check size={16} className="text-mint shrink-0" /> : <Copy size={16} className="text-ink3 shrink-0" />}
    </button>
  );
}

function ZerodhaGroup({ data, reload }) {
  const [key, setKey] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const saveKeys = async () => {
    setBusy(true);
    try {
      await api('/secrets', { method: 'PUT', body: { ...(key && { kiteApiKey: key }), ...(secret && { kiteApiSecret: secret }) } });
      setKey('');
      setSecret('');
      reload();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Group title="Zerodha (Kite Connect)" footer="Zerodha requires one login every morning (SEBI rule). Pivot sends you a login button on Telegram at 8:00 am.">
      <Row
        icon={KeyRound}
        iconTone="butter"
        title={data.kite.connected ? `Connected · ${data.kite.userName}` : 'Not logged in today'}
        subtitle={data.secrets.kiteApiKey ? `API key ${data.secrets.kiteApiKey}` : 'Add your API key and secret below'}
        right={data.secrets.kiteApiKey && <Button size="sm" onClick={() => (window.location.href = '/api/kite/login')}>{data.kite.connected ? 'Log in again' : 'Log in'}</Button>}
      />
      <Row title="Redirect URL" subtitle="Paste this into your Kite Connect app at developers.kite.trade">
        <CopyText text={data.kiteRedirect} />
      </Row>
      <div className="px-4 sm:px-5 py-4 space-y-3">
        <TextField value={key} onChange={setKey} placeholder={data.secrets.kiteApiKey ? 'New API key (optional)' : 'API key'} />
        <TextField value={secret} onChange={setSecret} placeholder={data.secrets.kiteApiSecret ? `Secret saved (${data.secrets.kiteApiSecret})` : 'API secret'} type="password" />
        <Button onClick={saveKeys} loading={busy} disabled={!key && !secret}>
          Save keys
        </Button>
      </div>
    </Group>
  );
}

function TelegramGroup({ data, reload }) {
  const [token, setToken] = useState('');
  const [code, setCode] = useState(null);
  const [msg, setMsg] = useState('');
  const t = data.telegram;
  useEffect(() => {
    if (!code || t.paired) return;
    const i = setInterval(reload, 3000); // notice the pairing automatically
    return () => clearInterval(i);
  }, [code, t.paired]);
  const [saving, setSaving] = useState(false);
  const saveToken = async () => {
    setSaving(true);
    setMsg('');
    try {
      const r = await api('/secrets', { method: 'PUT', body: { telegramToken: token } });
      setToken('');
      setMsg(r.telegram?.ok ? `✓ Bot @${r.telegram.bot} accepted. Now tap Pair.` : `✗ ${r.telegram?.error || 'Telegram did not accept the token'}`);
      reload();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setSaving(false);
    }
  };
  const pair = async () => {
    try {
      setCode(await api('/telegram/pair', { method: 'POST' }));
    } catch (e) {
      setMsg(e.message);
    }
  };
  const test = async () => {
    try {
      await api('/telegram/test', { method: 'POST' });
      setMsg('Sent! Check Telegram.');
    } catch (e) {
      setMsg(e.message);
    }
  };
  return (
    <Group title="Telegram (optional)" footer="Not needed if Pivot app notifications are on. Telegram adds Approve / Reject buttons inside the chat.">
      <Row
        icon={Send}
        iconTone="sky"
        title={t.paired ? `Connected${t.bot ? ' · @' + t.bot : ''}` : data.secrets.telegramToken ? (t.ok ? `Bot @${t.bot} ready — pair your chat` : 'Bot token saved') : 'Not set up'}
        subtitle={!data.secrets.telegramToken ? 'In Telegram, message @BotFather → /newbot → copy the token here' : !t.ok && t.error ? `Problem: ${t.error}` : undefined}
        right={t.paired ? <Button size="sm" tone="soft" onClick={test}>Test</Button> : data.secrets.telegramToken ? <Button size="sm" onClick={pair}>Pair</Button> : null}
      />
      {code && !t.paired && (
        <div className="px-5 py-4 text-[17px]">
          Open <b>@{code.bot}</b> in Telegram, tap <b>Start</b>, then send this code:
          <CopyText text={code.code} />
          <div className="text-ink2 text-[14px] mt-1">This page turns to “Connected” by itself within a few seconds.</div>
          <Button size="sm" tone="ghost" className="mt-2" onClick={reload}>
            I’ve sent it
          </Button>
        </div>
      )}
      <div className="px-4 sm:px-5 py-4 space-y-3">
        <TextField value={token} onChange={setToken} placeholder={data.secrets.telegramToken ? `Token saved (${data.secrets.telegramToken})` : 'Bot token from @BotFather'} type="password" />
        <Button onClick={saveToken} disabled={!token} loading={saving}>
          Save token
        </Button>
        {msg && <div className="font-semibold">{msg}</div>}
      </div>
    </Group>
  );
}

const b64ToBytes = (s) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const deviceName = () => {
  const ua = navigator.userAgent;
  return /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android phone' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows PC' : 'This device';
};

function PushGroup() {
  const [state, setState] = useState('checking'); // checking | unsupported | needs-home-screen | off | on | denied
  const [devices, setDevices] = useState([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const isIOS = /iPhone|iPad/.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  const refresh = async () => {
    try {
      const k = await api('/push/key');
      setDevices(k.devices);
    } catch {
      /* ignore */
    }
    if (isIOS && !standalone) return setState('needs-home-screen');
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return setState('unsupported');
    if (Notification.permission === 'denied') return setState('denied');
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && (await reg.pushManager.getSubscription());
    setState(sub ? 'on' : 'off');
  };
  useEffect(() => {
    refresh();
  }, []);

  const turnOn = async () => {
    setBusy(true);
    setMsg('');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'denied' : 'off');
        return;
      }
      if (!(await navigator.serviceWorker.getRegistration())) await navigator.serviceWorker.register('/sw.js');
      const reg = await navigator.serviceWorker.ready;
      const { key } = await api('/push/key');
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) }));
      await api('/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON(), device: deviceName() } });
      await api('/push/test', { method: 'POST' });
      setMsg('✓ Notifications are on — a test notification is on its way.');
      refresh();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };
  const turnOff = async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && (await reg.pushManager.getSubscription());
    if (sub) {
      await api('/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } });
      await sub.unsubscribe();
    }
    refresh();
  };
  const test = async () => {
    try {
      await api('/push/test', { method: 'POST' });
      setMsg('✓ Test sent.');
    } catch (e) {
      setMsg(e.message);
    }
  };

  const title = { on: 'On for this device', off: 'Off on this device', denied: 'Blocked on this device', 'needs-home-screen': 'Add Pivot to your Home Screen first', unsupported: 'Not supported in this browser', checking: 'Checking…' }[state];
  return (
    <Group title="Pivot app notifications" footer={devices.length ? `Sending to ${devices.length} device${devices.length > 1 ? 's' : ''}: ${devices.map((d) => d.device).join(', ')}.` : 'Buy signals, fills, stops, the morning brief and evening report — right on your phone.'}>
      <Row
        icon={Bell}
        iconTone="mint"
        title={title}
        subtitle={state === 'on' ? (isIOS ? 'Tap a buy signal to open Pivot and Approve / Reject.' : 'Buy signals have Approve / Reject buttons.') : undefined}
        right={
          state === 'on' ? (
            <div className="flex gap-2">
              <Button size="sm" tone="soft" onClick={test}>
                Test
              </Button>
              <Button size="sm" tone="ghost" onClick={turnOff}>
                Turn off
              </Button>
            </div>
          ) : state === 'off' ? (
            <Button size="sm" onClick={turnOn} loading={busy}>
              Turn on
            </Button>
          ) : null
        }
      />
      {state === 'needs-home-screen' && (
        <div className="px-5 py-4 text-[16px] space-y-1.5">
          <div>iPhone only allows notifications from apps on your Home Screen:</div>
          <div>1. In Safari, tap the <b>Share</b> button (square with an arrow).</div>
          <div>2. Tap <b>Add to Home Screen</b> → <b>Add</b>.</div>
          <div>3. Open <b>Pivot from the new icon</b>, come back to Settings, and tap <b>Turn on</b>.</div>
          <div className="text-ink2 text-[14px]">Needs iOS 16.4 or newer (Settings → General → About → iOS Version).</div>
        </div>
      )}
      {state === 'denied' && (
        <div className="px-5 py-4 text-[16px]">
          Notifications were blocked. {isIOS ? <>Open iPhone <b>Settings → Notifications → Pivot</b> and switch on <b>Allow Notifications</b>, then reopen Pivot.</> : <>Allow notifications for this site in your browser’s site settings, then reload.</>}
        </div>
      )}
      {msg && <div className="px-5 pb-4 font-semibold">{msg}</div>}
    </Group>
  );
}

function UploadNifty500() {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    setMsg('');
    try {
      const r = await api('/universe/manual', { method: 'PUT', body: { csv: await f.text() } });
      setMsg(`✓ ${r.count} stocks saved. Tap “Re-scan” on the Agents page to use them now.`);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };
  return (
    <Row title="Upload the Nifty 500 list" subtitle="Only needed if NSE blocks your server. Download the CSV on your phone or computer, then upload it here.">
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <a href="https://www.niftyindices.com/IndexConstituent/ind_nifty500list.csv" target="_blank" rel="noreferrer" className="text-accent font-semibold text-[15px]">
          1. Download from NSE
        </a>
        <label className={`inline-flex items-center h-10 px-4 rounded-full bg-lav-soft text-lav font-semibold text-[15px] cursor-pointer ${busy ? 'opacity-50' : ''}`}>
          2. Upload CSV
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} disabled={busy} />
        </label>
      </div>
      {msg && <div className="mt-2 text-[15px] font-semibold">{msg}</div>}
    </Row>
  );
}

function HolidaysGroup({ s, save }) {
  const [d, setD] = useState('');
  return (
    <Group title="Market holidays" footer="Weekends are skipped automatically. Add NSE trading holidays so the agents rest on those days.">
      <Row icon={CalendarOff} iconTone="butter" title="Add a holiday">
        <div className="flex gap-2 mt-2">
          <input type="date" value={d} onChange={(e) => setD(e.target.value)} className="bg-card2 rounded-xl px-3 py-2 text-[16px]" />
          <Button size="sm" disabled={!d} onClick={() => (save({ holidays: [...new Set([...s.holidays, d])].sort() }), setD(''))}>
            Add
          </Button>
        </div>
      </Row>
      {s.holidays.length > 0 && (
        <div className="px-5 py-3 flex flex-wrap gap-2">
          {s.holidays.map((h) => (
            <button key={h} onClick={() => save({ holidays: s.holidays.filter((x) => x !== h) })} className="bg-card2 rounded-full px-3 py-1.5 text-[14px] font-semibold num">
              {h} ✕
            </button>
          ))}
        </div>
      )}
    </Group>
  );
}
