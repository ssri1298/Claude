import { useEffect, useState } from 'react';
import { ShieldCheck, Wallet, Target, Repeat, KeyRound, Send, Bell, Palette, Database, LogOut, Copy, Check, CalendarOff, Zap, TrendingUp, Download, Loader2, ChevronLeft, Timer, Activity } from 'lucide-react';
import { api, useApi, applyTheme, getTheme, go } from '../lib.js';
import { LargeTitle, List, Row, Toggle, Segmented, NumberField, TextField, Button, Spinner, Sheet, Pill } from '../components/ui.jsx';

const SECTIONS = [
  { key: 'trading', title: 'Trading', icon: Zap, tone: 'lav', blurb: 'Paper or live, approvals, pausing' },
  { key: 'capital', title: 'Capital & position size', icon: Wallet, tone: 'mint', blurb: 'How much goes into each trade' },
  { key: 'buying', title: 'Buying rules', icon: TrendingUp, tone: 'sky', blurb: 'Score, volume, breakout checks, market filter, re-entry' },
  { key: 'selling', title: 'Selling rules', icon: Target, tone: 'coral', blurb: 'Stop-loss, profit taking, trailing, early exits' },
  { key: 'zerodha', title: 'Zerodha', icon: KeyRound, tone: 'butter', blurb: 'Kite Connect keys and daily login', live: true },
  { key: 'notifications', title: 'Notifications', icon: Bell, tone: 'peach', blurb: 'App notifications, Telegram, what to send, login reminder' },
  { key: 'holidays', title: 'Market holidays', icon: CalendarOff, tone: 'rose', blurb: 'Days the agents rest' },
  { key: 'app', title: 'App & data', icon: Palette, tone: 'gray', blurb: 'Theme, updates, stock list, erase paper data' },
];

export default function Settings({ query, section }) {
  const { data, reload } = useApi('/settings', { events: ['settings', 'kite'] });
  const [saving, setSaving] = useState(false);
  const [liveAsk, setLiveAsk] = useState(false);
  const [msg, setMsg] = useState(query.kite && query.kite !== 'connected' ? `Kite login: ${query.kite}` : '');
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [section]);
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
  const sec = SECTIONS.find((x) => x.key === section);

  // ---- Settings home: one row per topic, with the current values at a glance
  if (!sec) {
    const summary = {
      trading: `${s.tradingMode === 'live' ? 'Live money' : 'Paper'} · ${s.confirmTrades ? 'asks before buying' : 'fully automatic'}${s.agentsPaused ? ' · buys paused' : ''}`,
      capital: `${r.positionPct}% per trade · max ${r.maxPositions} positions`,
      buying: `${data.universeLabel || 'Nifty 500'} · score ≥ ${r.minScore} · volume ≥ ${r.minVolPace}× · ${c.enabled ? 'breakout checks on' : 'no breakout checks'}`,
      selling: `Stop ≤ ${r.maxStopPct}% · ⅓ at +${r.partialAtPct}% · ${{ ema21: '21-EMA trail', pct10: '10% trail', sma50: '50-DMA trail', none: 'no trail' }[r.trailMethod]}`,
      zerodha: data.kite?.connected ? 'Connected today' : data.secrets?.kiteApiKey ? 'Not logged in today' : 'Not set up',
      notifications: [data.push?.devices ? 'App' : null, data.telegram?.paired ? 'Telegram' : null].filter(Boolean).join(' + ') || 'Not set up',
      holidays: `${(s.holidays || []).length} holidays`,
      app: { system: 'Auto theme', light: 'Light theme', dark: 'Dark theme' }[getTheme()],
    };
    return (
      <div className="space-y-6 pb-10">
        <LargeTitle title="Settings" right={saving ? <Pill tone="lav">Saving…</Pill> : null} />
        {msg && <div className="bg-coral-soft text-coral rounded-2xl px-4 py-3 font-semibold">{msg}</div>}
        <List>
          {SECTIONS.filter((x) => !(x.live && data.demo)).map((x) => (
            <Row key={x.key} icon={x.icon} iconTone={x.tone} title={x.title} subtitle={summary[x.key] || x.blurb} chevron onClick={() => go(`/settings/${x.key}`)} />
          ))}
        </List>
        <List>
          <Row icon={LogOut} iconTone="gray" title="Log out" onClick={() => api('/auth/logout', { method: 'POST' }).then(() => location.reload())} />
        </List>
      </div>
    );
  }

  return (
    <div className="space-y-7 pb-10">
      <div>
        <button onClick={() => go('/settings')} className="flex items-center gap-1 text-accent font-semibold text-[17px] pt-2 -ml-1">
          <ChevronLeft size={24} /> Settings
        </button>
        <LargeTitle title={sec.title} subtitle={sec.blurb} right={saving ? <Pill tone="lav">Saving…</Pill> : null} />
      </div>
      {msg && <div className="bg-coral-soft text-coral rounded-2xl px-4 py-3 font-semibold">{msg}</div>}

      {section === 'trading' && (
        <>
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

        </>
      )}

      {section === 'capital' && (
        <>
      <Group title="Capital" footer="Same %: every trade gets the same share of capital. By risk: every trade risks the same amount, so tight, high-quality setups get bigger positions — the way Minervini sizes. Each new trade uses this share of your total capital. If there is not enough free cash, the signal is saved as a shadow trade and the setup stays on the watchlist.">
        <Row icon={Wallet} iconTone="mint" title="Capital source" right={<Segmented size="sm" value={s.capitalSource} onChange={(v) => save({ capitalSource: v })} options={[{ value: 'kite', label: 'Kite funds' }, { value: 'fixed', label: 'Fixed' }]} />} />
        {s.capitalSource === 'fixed' && <Row title="Capital for Pivot" right={<NumberField value={s.fixedCapital} onChange={(v) => save({ fixedCapital: v })} step={10000} suffix="₹" width="w-36" />} />}
        <Row title="Paper-trading capital" right={<NumberField value={s.paperCapital} onChange={(v) => save({ paperCapital: v })} step={10000} suffix="₹" width="w-36" />} />
        <Row title="How to size each trade">
          <Segmented
            size="sm"
            className="mt-2"
            value={r.sizing?.method || 'percent'}
            onChange={(v) => save({ rules: { sizing: { method: v } } })}
            options={[
              { value: 'percent', label: 'Same % of capital' },
              { value: 'risk', label: 'By risk (stop distance)' },
            ]}
          />
        </Row>
        {(r.sizing?.method || 'percent') === 'percent' ? (
          <Row title="Position size" right={<NumberField value={r.positionPct} onChange={rule('positionPct')} suffix="% each" width="w-20" />} />
        ) : (
          <>
            <Row title="Risk per trade" subtitle={`If the stop is hit you lose this much of your capital. 0.75% with a 5% stop = a 15% position.`} right={<NumberField value={r.sizing.riskPct} onChange={(v) => save({ rules: { sizing: { riskPct: Math.max(0.1, Math.min(3, v)) } } })} suffix="%" step={0.05} width="w-20" />} />
            <Row title="Largest position" subtitle="Tight stops never put more than this in one stock" right={<NumberField value={r.sizing.maxPct} onChange={(v) => save({ rules: { sizing: { maxPct: Math.max(5, Math.min(50, v)) } } })} suffix="%" width="w-20" />} />
          </>
        )}
        <Row title="Maximum open positions" right={<NumberField value={r.maxPositions} onChange={rule('maxPositions')} width="w-20" />} />
        <Row title="Maximum per industry" right={<NumberField value={r.maxPerIndustry} onChange={rule('maxPerIndustry')} width="w-20" />} />
      </Group>

        </>
      )}

      {section === 'buying' && (
        <>
          <UniverseGroup s={s} data={data} reload={reload} />
      <Group title="Entry rules">
        <Row icon={TrendingUp} iconTone="mint" title="Minimum setup score" subtitle="65 = grade B · 75 = A · 85 = A+" right={<NumberField value={r.minScore} onChange={rule('minScore')} width="w-20" />} />
        <Row title="Buy zone above pivot" subtitle="Never chase further than this" right={<NumberField value={r.buyZonePct} onChange={rule('buyZonePct')} suffix="%" step={0.5} width="w-20" />} />
        <Row title="Breakout volume" subtitle="Projected volume vs 50-day average" right={<NumberField value={r.minVolPace} onChange={rule('minVolPace')} suffix="×" step={0.1} width="w-20" />} />
      </Group>

      <Group title="Stock filters" footer="Checked before every buy. Results dates and surveillance lists come from NSE, circuit bands from Zerodha — refreshed every morning and evening.">
        <Row icon={CalendarOff} iconTone="butter" title="Skip stocks with results coming up" subtitle="One bad result can gap a stock straight through its stop" right={<Toggle checked={!!r.filters?.results?.enabled} onChange={(v) => save({ rules: { filters: { results: { enabled: v } } } })} />} />
        {r.filters?.results?.enabled && <Row title="No new buys within" right={<NumberField value={r.filters.results.daysBefore} onChange={(v) => save({ rules: { filters: { results: { daysBefore: Math.max(0, Math.min(20, v)) } } } })} suffix="days before" width="w-20" />} />}
        <Row title="Skip ASM / GSM stocks" subtitle="NSE surveillance lists — extra margins, trading limits, unreliable breakouts" right={<Toggle checked={!!r.filters?.surveillance} onChange={(v) => save({ rules: { filters: { surveillance: v } } })} />} />
        <Row title="Skip tight circuit bands" subtitle="Non-F&O stocks with a 5% or 10% band — a stop can't sell at the lower circuit" right={<Toggle checked={(r.filters?.minBandPct || 0) > 0} onChange={(v) => save({ rules: { filters: { minBandPct: v ? 20 : 0 } } })} />} />
        <Row title="Minimum daily turnover" subtitle="50-day average of ₹ traded per day — so orders fill near the expected price" right={<NumberField value={r.filters?.minTurnoverCr} onChange={(v) => save({ rules: { filters: { minTurnoverCr: Math.max(0, v) } } })} suffix="₹ cr" width="w-20" />} />
        <Row title="Only buy in leading sectors" subtitle="Skip stocks whose industry group is in the weaker half (by average relative strength). See Scanner → Sectors." right={<Toggle checked={(r.filters?.minSectorRank || 0) > 0} onChange={(v) => save({ rules: { filters: { minSectorRank: v ? 50 : 0 } } })} />} />
        <FlagsStatus f={data.flags} reload={reload} demo={data.demo} />
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

      <Group title="Two-stage buy" footer="Half the position is bought at the confirmed breakout; the other half at 3:15 pm only if it is still above the pivot with good volume.">
        <Row icon={Zap} iconTone="butter" title="Two-stage buy" right={<Toggle checked={r.twoStage.enabled} onChange={(v) => save({ rules: { twoStage: { enabled: v } } })} />} />
        {r.twoStage.enabled && <Row title="First part" right={<NumberField value={Math.round(r.twoStage.firstFraction * 100)} onChange={(v) => save({ rules: { twoStage: { firstFraction: Math.min(0.9, Math.max(0.1, v / 100)) } } })} suffix="%" width="w-20" />} />}
      </Group>
      <Group title="Market filter" footer="Based on the Nifty 50 trend and how many of the watched stocks are above their 50-day average.">
        <Row icon={Activity} iconTone="butter" title="In a market correction">
          <Segmented size="sm" className="mt-2" value={s.marketFilter} onChange={(v) => save({ marketFilter: v })} options={[{ value: 'pause', label: 'Pause new buys' }, { value: 'half', label: 'Half size' }, { value: 'off', label: 'Ignore' }]} />
        </Row>
      </Group>
      <Group title="Re-entry" footer="If a stock stops you out but reclaims its pivot on strong volume within the window, Pivot proposes buying it again.">
        <Row icon={Repeat} iconTone="sky" title="Re-buy after a stop-out" right={<Toggle checked={r.reentry.enabled} onChange={(v) => save({ rules: { reentry: { enabled: v } } })} />} />
        <Row title="Window" right={<NumberField value={r.reentry.windowDays} onChange={(v) => save({ rules: { reentry: { windowDays: v } } })} suffix="days" width="w-20" />} />
        <Row title="Max re-entries per setup" right={<NumberField value={r.reentry.maxPerSetup} onChange={(v) => save({ rules: { reentry: { maxPerSetup: v } } })} width="w-20" />} />
      </Group>

        </>
      )}

      {section === 'selling' && (
        <>
      <Group title="Stop-loss & profit taking" footer="The stop-loss always runs, every second, during market hours.">
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

      <Group title="Big winners" footer="Minervini's rules for the best trades. The 8-week hold keeps a fast mover through normal pullbacks (only the stop can sell it). The climax sale books part of a stock that suddenly goes vertical — those runs often mark the top.">
        <Row icon={TrendingUp} iconTone="mint" title="8-week hold for fast movers" subtitle={`Up ${r.winners?.eightWeek?.gainPct}% within ${r.winners?.eightWeek?.withinDays} trading days → no trailing exit for ${r.winners?.eightWeek?.holdDays} trading days`} right={<Toggle checked={!!r.winners?.eightWeek?.enabled} onChange={(v) => save({ rules: { winners: { eightWeek: { enabled: v } } } })} />} />
        {r.winners?.eightWeek?.enabled && <Row title="Fast move means up" right={<NumberField value={r.winners.eightWeek.gainPct} onChange={(v) => save({ rules: { winners: { eightWeek: { gainPct: Math.max(10, Math.min(50, v)) } } } })} suffix="% in 3 weeks" width="w-20" />} />}
        <Row title="Sell into a climax run" subtitle={`Up ${r.winners?.climax?.gainPct}% in ${r.winners?.climax?.days} days and today is the biggest up-day since buying`} right={<Toggle checked={!!r.winners?.climax?.enabled} onChange={(v) => save({ rules: { winners: { climax: { enabled: v } } } })} />} />
        {r.winners?.climax?.enabled && (
          <>
            <Row title="Climax means up" right={<NumberField value={r.winners.climax.gainPct} onChange={(v) => save({ rules: { winners: { climax: { gainPct: Math.max(10, Math.min(100, v)) } } } })} suffix="%" width="w-20" />} />
            <Row title="Sell" right={<NumberField value={Math.round(r.winners.climax.fraction * 100)} onChange={(v) => save({ rules: { winners: { climax: { fraction: Math.max(0.1, Math.min(1, v / 100)) } } } })} suffix="% of what's left" width="w-20" />} />
          </>
        )}
      </Group>
      <Group title="Early exits" footer="A new buy that closes back below its pivot is sold at the close (usually a 1–3% loss instead of the full stop). A trade that goes nowhere ties up capital: the time exit sells it at the close if it has hit neither the stop nor the profit target in time.">
        <Row icon={Timer} iconTone="peach" title="Sell failed breakouts early" subtitle="Close back below the pivot" right={<Toggle checked={r.failedExit.enabled} onChange={(v) => save({ rules: { failedExit: { enabled: v } } })} />} />
        {r.failedExit.enabled && <Row title="Within the first" right={<NumberField value={r.failedExit.days} onChange={(v) => save({ rules: { failedExit: { days: v } } })} suffix="days" width="w-20" />} />}
        <Row title="Time exit" subtitle={`Sell at the close if neither the stop nor +${r.partialAtPct}% is hit in time`} right={<Toggle checked={!!r.timeExit?.enabled} onChange={(v) => save({ rules: { timeExit: { enabled: v } } })} />} />
        {r.timeExit?.enabled && <Row title="After" right={<NumberField value={r.timeExit.days} onChange={(v) => save({ rules: { timeExit: { days: Math.max(1, Math.min(60, v)) } } })} suffix="trading days" width="w-20" />} />}
      </Group>
        </>
      )}

      {section === 'zerodha' && (data.demo ? <p className="text-ink2 px-1">Zerodha is not used in demo mode.</p> : <ZerodhaGroup data={data} reload={reload} />)}

      {section === 'notifications' && (
        <>
          <PushGroup />
          <TelegramGroup data={data} reload={reload} />
      <Group title="What to notify me about" footer="Sent to the Pivot app and Telegram (whichever you have set up). Morning and evening reports are always saved on the Reports page.">
        {[
          ['login', 'Morning Kite login reminder'],
          ['proposals', 'Trade approvals'],
          ['fills', 'Buys filled'],
          ['exits', 'Stops, partial profits & exits'],
          ['morningBrief', 'Morning brief'],
          ['eveningReport', 'Evening report'],
          ['weeklyReport', 'Weekly & monthly report'],
          ['health', 'Problems with Pivot (price feed, morning analysis)'],
          ['alerts', 'My price alerts'],
          ['nearPivot', 'Stock within 1% of pivot'],
        ].map(([k, l]) => (
          <Row key={k} icon={k === 'proposals' ? Bell : undefined} iconTone="peach" title={l} right={<Toggle checked={s.notify[k] !== false} onChange={(v) => save({ notify: { [k]: v } })} />} />
        ))}
      </Group>

      <Group title="Morning login reminder" footer="Zerodha needs one login every trading day. Pivot reminds you at this time, again 45 minutes later and at 09:10 if you haven't logged in, and confirms when Zerodha is connected. No reminders on weekends and market holidays.">
        <Row
          icon={KeyRound}
          iconTone="butter"
          title="Remind me at"
          right={
            <input
              type="time"
              value={s.schedule.login}
              min="06:00"
              max="09:00"
              onChange={(e) => e.target.value && e.target.value <= '09:00' && save({ schedule: { login: e.target.value } })}
              className="bg-card2 rounded-xl px-3 py-2 text-[17px] num font-semibold"
            />
          }
        />
      </Group>

        </>
      )}

      {section === 'holidays' && <HolidaysGroup s={s} save={save} names={data.holidayNames} sync={data.holidaySync} reload={reload} />}

      {section === 'app' && (
        <>
          <Group title="Appearance">
            <Row icon={Palette} iconTone="rose" title="Theme" right={<ThemePicker />} />
          </Group>
          <AppUpdates />
          <WatchdogGroup s={s} save={save} />
      <Group title="Data">
        <Row icon={Database} iconTone="sky" title="Stocks tracked" subtitle={`${data.universeLabel || 'Nifty 500'} list · history from ${data.historyFrom || '—'}`} right={<b className="num">{data.universeCount}</b>} />
        {!data.demo && <UploadNifty500 />}
        <ErasePaper />
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

        </>
      )}

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

/** Erase every paper trade and start the paper account fresh. Live (real-money) data is never touched. */
function ErasePaper() {
  const [open, setOpen] = useState(false);
  const [sum, setSum] = useState(null);
  const [shadow, setShadow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [err, setErr] = useState('');
  const start = async () => {
    setDone(null);
    setErr('');
    setOpen(true);
    setSum(await api('/paper/summary').catch(() => null));
  };
  const erase = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await api('/paper/erase', { method: 'POST', body: { confirm: 'ERASE', includeShadow: shadow } });
      setDone(r.erased);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Row
        title="Erase paper-trading data"
        subtitle="Start the paper account fresh. Real (live) trades are never touched."
        right={
          <Button size="sm" tone="coralSoft" onClick={start}>
            Erase…
          </Button>
        }
      />
      <Sheet open={open} onClose={() => setOpen(false)} title="Erase paper-trading data?">
        {done ? (
          <>
            <p className="text-[18px]">✅ Done. The paper account starts again at <b>₹{Number(sum?.capital || 0).toLocaleString('en-IN')}</b>.</p>
            <p className="text-ink2 mt-2">The agents keep running and will paper-trade the next breakout as usual.</p>
            <Button className="w-full mt-6" size="lg" onClick={() => location.reload()}>
              Done
            </Button>
          </>
        ) : !sum ? (
          <Spinner />
        ) : (
          <>
            <p className="text-[17px]">This permanently deletes:</p>
            <ul className="mt-2 space-y-1.5 text-[17px]">
              <li>
                • <b>{sum.open}</b> open and <b>{sum.closed}</b> closed paper trades, with their orders and fills
              </li>
              <li>• The paper equity curve and Dashboard statistics</li>
              {sum.pending > 0 && (
                <li>
                  • <b>{sum.pending}</b> buy {sum.pending === 1 ? 'request' : 'requests'} waiting for your approval
                </li>
              )}
            </ul>
            <div className="flex items-center gap-3 mt-5 bg-card rounded-2xl px-4 py-3">
              <div className="flex-1">
                <div className="font-semibold">Also erase shadow trades ({sum.shadow})</div>
                <div className="text-ink2 text-[14px] leading-snug">Signals the agents tracked but didn't take, and the breakout-check measurements on the Dashboard.</div>
              </div>
              <Toggle checked={shadow} onChange={setShadow} label="Also erase shadow trades" />
            </div>
            <p className="text-ink2 text-[15px] mt-4">Kept: settings, the watchlist, scores, the activity log and any live (real-money) trades.</p>
            {err && <div className="text-coral font-semibold mt-3">{err}</div>}
            <div className="grid grid-cols-2 gap-3 mt-6">
              <Button tone="soft" size="lg" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button tone="coral" size="lg" loading={busy} onClick={erase}>
                Erase
              </Button>
            </div>
          </>
        )}
      </Sheet>
    </>
  );
}

/** Outside heartbeat (healthchecks.io), health notifications and daily backups. */
function WatchdogGroup({ s, save }) {
  const { data, reload } = useApi('/watchdog');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const run = async (key, fn) => {
    setBusy(key);
    setMsg('');
    try {
      await fn();
      await reload();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy('');
    }
  };
  const hb = data?.heartbeat;
  const lb = data?.lastBackup;
  return (
    <>
      <Group
        title="Watchdog"
        footer="If the server crashes, nothing inside it can warn you — so Pivot checks in with a free outside service every minute. Create a free account at healthchecks.io → New check (period 1 minute, grace 3 minutes) → copy its ping URL here. If the check-ins stop, or Pivot reports a problem, healthchecks.io alerts your email or phone. Inside Pivot, problems in market hours (price stream down, morning analysis not done) also send a notification."
      >
        <Row icon={ShieldCheck} iconTone="mint" title="Health right now" subtitle={data?.problem ? data.problem : 'Everything is working'} right={data?.problem ? <Pill tone="coral">Problem</Pill> : <Pill tone="mint">OK</Pill>} />
        <Row title="Outside check-in URL" subtitle={hb?.configured ? (hb.lastPing ? `Last check-in ${new Date(hb.lastPing).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} — ${hb.ok ? 'received' : 'failed: ' + (hb.error || '')}` : 'Saved — first check-in within a minute') : 'Not set up'}>
          <div className="flex gap-2 mt-2">
            <TextField value={url} onChange={setUrl} placeholder={hb?.configured ? 'Saved ✓ — paste a new URL to change' : 'https://hc-ping.com/…'} />
            <Button size="sm" loading={busy === 'url'} disabled={!url.trim()} onClick={() => run('url', async () => (await api('/secrets', { method: 'PUT', body: { heartbeatUrl: url.trim() } }), setUrl(''), await api('/watchdog/test', { method: 'POST' })))}>
              Save
            </Button>
          </div>
        </Row>
      </Group>
      <Group title="Backups" footer="Every evening Pivot saves a full copy on the server (last 7 kept) and a small copy of your trades, journal, reports and settings — no market data and no passwords. Send that small copy to your Telegram, or download it, so a server failure can't lose your history.">
        <Row icon={Database} iconTone="sky" title="Daily backup" subtitle={lb ? `Last: ${new Date(lb.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${Math.round((lb.smallSize || 0) / 1024)} KB` : 'No backup yet'} right={<Toggle checked={s.backup?.daily !== false} onChange={(v) => save({ backup: { daily: v } })} />} />
        <Row title="Send it to my Telegram" subtitle={data?.telegram ? 'The small copy arrives as a file every evening' : 'Connect Telegram first (Settings → Notifications)'} right={<Toggle checked={!!s.backup?.telegram} disabled={!data?.telegram} onChange={(v) => save({ backup: { telegram: v } })} />} />
        <Row
          title="Back up now"
          subtitle={msg || undefined}
          right={
            <div className="flex gap-2">
              <Button size="sm" tone="soft" loading={busy === 'bk'} onClick={() => run('bk', () => api('/backup', { method: 'POST', body: { send: !!s.backup?.telegram } }))}>
                Back up
              </Button>
              <Button size="sm" tone="soft" disabled={!lb} onClick={() => (window.location.href = '/api/backup/download')}>
                Download
              </Button>
            </div>
          }
        />
      </Group>
    </>
  );
}

/** Which stocks the agents watch and trade. */
function UniverseGroup({ s, data, reload }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const pick = async (kind) => {
    if (kind === (s.universe || 'nifty500')) return;
    setBusy(true);
    setNote('');
    try {
      const r = await api('/universe', { method: 'POST', body: { kind } });
      setNote(r.note || 'Saved');
      reload();
    } catch (e) {
      setNote(e.message);
    } finally {
      setBusy(false);
    }
  };
  const kind = s.universe || 'nifty500';
  const help = {
    nifty500: 'The 500 biggest, most traded NSE companies — the cleanest list for VCP breakouts.',
    total: 'Nifty 500 plus ~250 smaller companies (the Nifty Total Market index). More setups, slightly less liquid.',
    all: 'Every NSE equity (~2,000, no ETFs, bonds or SME / trade-to-trade series). The most setups, but many small, thin stocks — keep the turnover filter on. Industries are known only for stocks in NSE index lists.',
  }[kind];
  return (
    <Group title="Stocks to watch" footer={`${help} Morning preparation takes longer with more stocks (about 1 minute per 200 stocks after the first download). Changing the list keeps your trades and settings.`}>
      <Row title="Watch and trade" subtitle={`${data.universeCount} stocks now`}>
        <Segmented
          size="sm"
          className="mt-2"
          value={kind}
          onChange={pick}
          options={[
            { value: 'nifty500', label: 'Nifty 500' },
            { value: 'total', label: 'Total Market' },
            { value: 'all', label: 'All NSE' },
          ]}
        />
        {(busy || note) && <div className="text-[14px] font-semibold mt-2">{busy ? 'Saving…' : note}</div>}
      </Row>
    </Group>
  );
}

function FlagsStatus({ f, reload, demo }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const run = async () => {
    setBusy(true);
    setMsg('');
    try {
      const r = await api('/flags/refresh', { method: 'POST' });
      setMsg(r.problems?.length ? 'Some lists could not be downloaded: ' + r.problems.join(', ') : 'Lists updated');
      reload();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Row
      title="Lists"
      subtitle={
        <>
          {f?.updated ? `${f.results} upcoming results · ${f.surveillance} under surveillance · ${f.bands} circuit bands${demo ? ' (demo data)' : ''} · updated ${new Date(f.updated).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Not downloaded yet'}
          {f?.problems?.length > 0 && <span className="block text-coral">Last refresh had problems: {f.problems.join(', ')}</span>}
          {msg && <span className="block text-ink">{msg}</span>}
        </>
      }
      right={
        <Button size="sm" tone="soft" loading={busy} onClick={run}>
          Refresh
        </Button>
      }
    />
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
    <Row title="Upload the stock list" subtitle="Only needed if NSE blocks your server. Download the CSV on your phone or computer, then upload it here.">
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

function HolidaysGroup({ s, save, names = {}, sync, reload }) {
  const [d, setD] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [showPast, setShowPast] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = s.holidays.filter((h) => h >= today);
  const past = s.holidays.filter((h) => h < today);
  const fmt = (h) => new Date(h + 'T12:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const update = async () => {
    setBusy(true);
    setMsg('');
    try {
      const r = await api('/holidays/sync', { method: 'POST' });
      setMsg(`✓ Downloaded ${r.count} NSE holidays${r.added ? ` · ${r.added} new` : ' · already up to date'}`);
      reload();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };
  const Item = ({ h }) => (
    <div className="flex items-center justify-between gap-3 px-5 py-2.5">
      <div className="min-w-0">
        <div className="font-semibold num">{fmt(h)}</div>
        <div className="text-ink2 text-[14px] truncate">{names[h] || 'Added by you'}</div>
      </div>
      <button onClick={() => save({ holidays: s.holidays.filter((x) => x !== h) })} className="text-ink3 text-[14px] font-semibold shrink-0 px-2" aria-label={`Remove ${h}`}>
        Remove
      </button>
    </div>
  );
  return (
    <Group
      title="Market holidays (NSE)"
      footer={`The agents rest on weekends and these days. ${sync ? `Last updated ${new Date(sync.at).toLocaleDateString('en-IN')} from ${sync.source}.` : ''} Pivot checks NSE weekly, so next year's list appears as soon as NSE publishes it (usually late December).`}
    >
      <Row
        icon={CalendarOff}
        iconTone="butter"
        title={`${upcoming.length} upcoming`}
        subtitle={upcoming[0] ? `Next: ${new Date(upcoming[0] + 'T12:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })}` : 'None saved yet'}
        right={
          <Button size="sm" tone="soft" loading={busy} onClick={update}>
            Update
          </Button>
        }
      />
      {msg && <div className="px-5 py-2 font-semibold text-[15px]">{msg}</div>}
      <div className="divide-y hairline">
        {upcoming.map((h) => (
          <Item key={h} h={h} />
        ))}
      </div>
      {past.length > 0 && (
        <button onClick={() => setShowPast(!showPast)} className="w-full text-left px-5 py-3 text-accent font-semibold text-[15px]">
          {showPast ? 'Hide' : 'Show'} {past.length} past holidays
        </button>
      )}
      {showPast && (
        <div className="divide-y hairline opacity-70">
          {past.map((h) => (
            <Item key={h} h={h} />
          ))}
        </div>
      )}
      <Row title="Add a holiday yourself">
        <div className="flex gap-2 mt-2">
          <input type="date" value={d} onChange={(e) => setD(e.target.value)} className="bg-card2 rounded-xl px-3 py-2 text-[16px]" />
          <Button size="sm" disabled={!d} onClick={() => (save({ holidays: [...new Set([...s.holidays, d])].sort() }), setD(''))}>
            Add
          </Button>
        </div>
      </Row>
    </Group>
  );
}

function AppUpdates() {
  const { data, reload } = useApi('/update');
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState('');
  const [token, setToken] = useState('');
  const [restarting, setRestarting] = useState(false);
  const st = data?.status;
  const state = restarting ? 'updating' : st?.state;

  // While checking or updating, keep polling; during the restart the server is briefly unreachable.
  useEffect(() => {
    if (!busy && state !== 'updating') return;
    const startVersion = data?.version?.commit;
    const t = setInterval(async () => {
      try {
        const d = await api('/update');
        if (restarting && d.version?.commit && d.version.commit !== startVersion) return location.reload();
        if (busy === 'check' && d.status?.at !== st?.at) setBusy('');
        if (!restarting && d.status?.state === 'updating') setRestarting(true);
        if (d.status?.state === 'error' || d.status?.state === 'done') {
          setRestarting(false);
          setBusy('');
        }
        reload();
      } catch {
        /* server restarting — keep waiting */
      }
    }, 3000);
    return () => clearInterval(t);
  }, [busy, state, restarting, data?.version?.commit, st?.at]);

  if (!data) return null;
  const fmt = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
  const check = async () => {
    setBusy('check');
    try {
      await api('/update/check', { method: 'POST' });
    } catch (e) {
      setBusy('');
      alert(e.message);
    }
  };
  const update = async () => {
    setAsk(false);
    setBusy('update');
    try {
      await api('/update/apply', { method: 'POST' });
      setRestarting(true);
    } catch (e) {
      setBusy('');
      alert(e.message);
    }
  };
  const saveToken = async () => {
    await api('/secrets', { method: 'PUT', body: { githubToken: token } });
    setToken('');
    reload();
    check();
  };

  return (
    <Group title="App updates" footer={data.available ? 'Pivot checks for a new version every day. Updating takes 2–5 minutes; open positions stay protected by their stops and the backup GTT orders at Zerodha.' : undefined}>
      <Row
        icon={Download}
        iconTone="lav"
        title={data.version ? `Version ${data.version.commit}` : 'Current version'}
        subtitle={data.version ? `${data.version.subject} · ${fmt(data.version.date)}` : data.demo ? 'Demo mode' : 'Version information appears after the next install'}
      />
      {!data.available ? (
        <div className="px-5 py-4 text-ink2 text-[15px]">{data.demo ? 'Updates are not available in demo mode.' : 'In-app updates switch on after you run the install command once more from the SSH terminal.'}</div>
      ) : (
        <>
          <div className="px-5 py-4">
            {state === 'updating' ? (
              <div className="flex items-center gap-3 font-semibold">
                <Loader2 className="animate-spin text-accent" size={22} />
                {st?.message || 'Updating…'} The page reloads by itself when Pivot is back.
              </div>
            ) : state === 'available' ? (
              <div>
                <div className="font-bold text-[17px] text-mint">A new version is ready</div>
                <ul className="mt-2 space-y-1 text-[15px]">
                  {(st.newVersions || []).slice(0, 8).map((v) => (
                    <li key={v.commit} className="flex gap-2">
                      <span className="text-ink3 num shrink-0">{v.commit}</span>
                      <span>{v.subject}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : state === 'uptodate' ? (
              <div className="font-semibold">✓ Pivot is up to date <span className="text-ink3 font-normal text-[14px]">· checked {fmt(st.at)}</span></div>
            ) : state === 'done' ? (
              <div className="font-semibold text-mint">✓ Updated {fmt(st.at)}</div>
            ) : state === 'error' ? (
              <div>
                <div className="font-semibold text-coral">{st.message}</div>
                {data.log && <pre className="mt-2 text-[12px] bg-card2 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap">{data.log}</pre>}
              </div>
            ) : (
              <div className="text-ink2">Not checked yet.</div>
            )}
          </div>
          <div className="px-5 pb-4 flex flex-wrap gap-2">
            <Button size="sm" tone="soft" onClick={check} loading={busy === 'check'} disabled={state === 'updating'}>
              Check for updates
            </Button>
            {state === 'available' && (
              <Button size="sm" tone="mint" onClick={() => setAsk(true)} loading={busy === 'update'}>
                Update now
              </Button>
            )}
          </div>
          {(st?.needsToken || data.hasToken) && (
            <div className="px-5 pb-5 space-y-2">
              <div className="text-[15px] text-ink2">
                {data.hasToken ? 'A GitHub token is saved.' : 'Your GitHub repository is private. Create a read-only token: GitHub → Settings → Developer settings → Fine-grained tokens → this repository, Contents: Read-only.'}
              </div>
              <TextField value={token} onChange={setToken} placeholder={data.hasToken ? 'Replace GitHub token' : 'GitHub token'} type="password" />
              <Button size="sm" onClick={saveToken} disabled={!token}>
                Save token
              </Button>
            </div>
          )}
        </>
      )}
      <Sheet open={ask} onClose={() => setAsk(false)} title="Update Pivot now?">
        <ul className="space-y-2 text-[17px]">
          <li>• Pivot downloads the new version and restarts — about 2–5 minutes.</li>
          <li>• Your settings, trades and history are kept.</li>
          <li>• Open positions stay protected by the backup stop orders at Zerodha. Best done outside market hours.</li>
        </ul>
        <div className="grid grid-cols-2 gap-3 mt-6">
          <Button tone="soft" size="lg" onClick={() => setAsk(false)}>
            Later
          </Button>
          <Button tone="mint" size="lg" onClick={update}>
            Update now
          </Button>
        </div>
      </Sheet>
    </Group>
  );
}
