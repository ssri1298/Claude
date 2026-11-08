import { useEffect, useRef, useState } from 'react';
import { BellRing, Download, FileUp, Save } from 'lucide-react';
import { permission, requestPermission, showPlanNotification } from '../lib/reminder.js';
import { api, IS_WEB } from '../api.js';
import { useApp } from '../store.jsx';
import { Card, SectionHeader } from './ui.jsx';
import SaveStatus from './SaveStatus.jsx';

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-slate-200">{label}</span>
        {hint && <span className="font-display text-sm text-violet-300">{hint}</span>}
      </div>
      <div className="mt-2.5">{children}</div>
    </label>
  );
}

export default function Settings() {
  const { settings, toast, refresh } = useApp();
  const [s, setS] = useState(settings);
  const [table, setTable] = useState(null);
  const [perm, setPerm] = useState(permission);
  const [pending, setPending] = useState(null); // backup file waiting for confirmation
  const fileRef = useRef();
  useEffect(() => setS(settings), [settings]);
  useEffect(() => {
    api.yieldTable().then(setTable);
  }, []);
  if (!s) return null;
  const set = (k, v) => setS((p) => ({ ...p, [k]: v }));
  const setR = (k, v) => setS((p) => ({ ...p, reminder: { ...p.reminder, [k]: v } }));
  const setP = (k, v) => setS((p) => ({ ...p, pomodoro: { ...p.pomodoro, [k]: v } }));

  const save = async () => {
    await api.saveSettings(s);
    await refresh();
    window.dispatchEvent(new Event('settings:changed'));
    toast('Settings saved');
  };
  const exportData = async () => {
    const d = await api.exportData();
    const filename = `scalpel-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const text = JSON.stringify(d, null, 2);
    if (IS_WEB) {
      // The website asks you to confirm the download.
      const downloads = await window.claude?.use?.('downloads');
      if (!downloads) return toast('Downloads aren’t available in this view.', 'error');
      try {
        await downloads.save({ filename, data: text });
      } catch (e) {
        if (e?.code !== 'cancelled' && e?.code !== 'declined') toast('The backup could not be saved.', 'error');
      }
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = filename;
    a.click();
  };
  const pickBackup = async (file) => {
    try {
      setPending({ name: file.name, data: JSON.parse(await file.text()) });
    } catch {
      toast('That file is not a Scalpel backup', 'error');
    }
  };
  const restore = async () => {
    try {
      await api.importData(pending.data);
      setPending(null);
      await refresh();
      toast('Backup restored');
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <div>
      <SectionHeader
        eyebrow="Preferences"
        title="Settings"
        right={<button className="btn-primary" onClick={save}><Save size={16} /> Save settings</button>}
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="space-y-6 p-5 sm:p-6">
          <div className="label">Planner</div>
          <Field label="Share of time for active recall" hint={`${Math.round(s.revisionShare * 100)}%`}>
            <input type="range" className="range" min={0} max={0.7} step={0.05} value={s.revisionShare} onChange={(e) => set('revisionShare', +e.target.value)} />
          </Field>
          <Field label="Video time multiplier (pauses & notes)" hint={`× ${s.durationMultiplier}`}>
            <input type="range" className="range" min={1} max={2.5} step={0.05} value={s.durationMultiplier} onChange={(e) => set('durationMultiplier', +e.target.value)} />
          </Field>
          <Field label="Break buffer" hint={`${Math.round(s.breakBufferPct * 100)}%`}>
            <input type="range" className="range" min={0} max={0.3} step={0.01} value={s.breakBufferPct} onChange={(e) => set('breakBufferPct', +e.target.value)} />
          </Field>
          <Field label="Minutes per recall block" hint={`${s.recallMinutes} min`}>
            <input type="range" className="range" min={5} max={30} step={1} value={s.recallMinutes} onChange={(e) => set('recallMinutes', +e.target.value)} />
          </Field>
          <Field label="Suggest skipping topics with yield ≤" hint={s.lowYieldThreshold}>
            <input type="range" className="range" min={0} max={6} step={1} value={s.lowYieldThreshold} onChange={(e) => set('lowYieldThreshold', +e.target.value)} />
          </Field>
          <Field label="Exam date">
            <input type="date" className="input" value={s.examDate || ''} onChange={(e) => set('examDate', e.target.value || null)} />
          </Field>
        </Card>
        <div className="space-y-5">
          <Card className="space-y-4 p-5 sm:p-6">
            <div className="label flex items-center gap-1.5"><BellRing size={12} /> Daily plan reminder</div>
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-200">Ask for my plan every day</span>
              <input type="checkbox" className="h-5 w-5 accent-violet-500" checked={!!s.reminder?.enabled} onChange={(e) => setR('enabled', e.target.checked)} />
            </label>
            <Field label="Reminder time">
              <input type="time" className="input" value={s.reminder?.time || '10:00'} onChange={(e) => setR('time', e.target.value || '10:00')} />
            </Field>
            <p className="text-xs text-slate-500">
              {IS_WEB
                ? 'At the reminder time, Scalpel opens the “How much time do you have today?” check-in if it’s open in a tab. It’s skipped once today’s plan is finalized.'
                : <>Browser notification status: <span className={perm === 'granted' ? 'text-emerald-300' : 'text-amber-300'}>{perm}</span>. The reminder fires while Scalpel is open in a tab (it can be in the background). It’s skipped once today’s plan is finalized.</>}
            </p>
            <div className="flex flex-wrap gap-2">
              {!IS_WEB && perm !== 'granted' && perm !== 'unsupported' && (
                <button className="btn-ghost" onClick={async () => setPerm(await requestPermission())}><BellRing size={15} /> Allow notifications</button>
              )}
              {!IS_WEB && perm === 'granted' && (
                <button className="btn-ghost" onClick={() => showPlanNotification('Test reminder — this is how your daily plan prompt will look.')}><BellRing size={15} /> Send test notification</button>
              )}
            </div>
          </Card>
          <Card className="space-y-5 p-5 sm:p-6">
            <div className="label">Pomodoro</div>
            <div className="grid grid-cols-2 gap-4">
              {[
                ['focus', 'Focus (min)'],
                ['short', 'Short break'],
                ['long', 'Long break'],
                ['roundsBeforeLong', 'Rounds before long'],
              ].map(([k, l]) => (
                <Field key={k} label={l}>
                  <input type="number" min={1} max={120} className="input" value={s.pomodoro[k]} onChange={(e) => setP(k, Math.max(1, +e.target.value || 1))} />
                </Field>
              ))}
            </div>
          </Card>
          <Card className="p-5 sm:p-6">
            <div className="label mb-4">Your data</div>
            <p className="mb-4 text-sm text-slate-400">
              {IS_WEB
                ? 'Your topics and progress are saved privately to your account and follow you to any device you sign in on. Export a backup now and then.'
                : <>Everything is stored on this computer in <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs">data/study.json</code>. You can also export a backup.</>}
            </p>
            <div className="mb-4"><SaveStatus /></div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost" onClick={exportData}><Download size={15} /> Export backup</button>
              <button className="btn-ghost" onClick={() => fileRef.current?.click()}><FileUp size={15} /> Restore backup</button>
              <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { if (e.target.files[0]) pickBackup(e.target.files[0]); e.target.value = ''; }} />
            </div>
            {pending && (
              <div className="mt-4 rounded-xl border border-rose-400/25 bg-rose-500/[0.06] p-4">
                <div className="text-sm text-rose-100">Replace all your current topics, plans and progress with “{pending.name}”?</div>
                <div className="mt-3 flex gap-2">
                  <button className="btn !border !border-rose-400/40 !bg-rose-500/20 text-rose-100 hover:!bg-rose-500/30" onClick={restore}>Replace my data</button>
                  <button className="btn-ghost" onClick={() => setPending(null)}>Cancel</button>
                </div>
              </div>
            )}
          </Card>
          {table && (
            <Card className="p-5 sm:p-6">
              <div className="label mb-1">Exam-frequency model</div>
              <p className="text-xs text-slate-400">
                {table.areas.length} topic areas, calibrated {table.calibrated?.checked} from real NEET SS Surgical recall papers (2022–2024) and published 2025 analyses. Tap a row to see why it has its weight.
              </p>
              <div className="mb-3 mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
                {[['high', 'bg-emerald-400', '6+ questions in recalls'], ['medium', 'bg-amber-400', 'a few questions or several sources'], ['low', 'bg-slate-500', 'estimate only']].map(([k, c, d]) => (
                  <span key={k} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${c}`} />{k}: {d}</span>
                ))}
              </div>
              <div className="max-h-96 space-y-1 overflow-y-auto pr-1">
                {[...table.areas].sort((a, b) => b.weight - a.weight).map((a) => (
                  <details key={a.area} className="group rounded-lg px-1.5 py-1 open:bg-white/[0.03]">
                    <summary className="flex cursor-pointer list-none items-center gap-3 text-xs">
                      <span className="w-6 text-right font-display text-white">{a.weight}</span>
                      <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-white/5">
                        <div className="h-full bg-gradient-to-r from-violet-500 to-cyan-400" style={{ width: `${a.weight * 10}%` }} />
                      </div>
                      <span className={`h-2 w-2 shrink-0 rounded-full ${a.confidence === 'high' ? 'bg-emerald-400' : a.confidence === 'medium' ? 'bg-amber-400' : 'bg-slate-500'}`} title={`Confidence: ${a.confidence}`} />
                      <span className="min-w-0 truncate text-slate-300">{a.area}</span>
                      <span className="ml-auto hidden shrink-0 text-slate-600 sm:inline">{a.subject}</span>
                    </summary>
                    <div className="ml-9 mt-1.5 space-y-1 pb-1 text-[11px] leading-relaxed text-slate-400">
                      <div>{a.evidence}</div>
                      {a.prior_weight != null && a.prior_weight !== a.weight && <div className="text-slate-500">Earlier estimate: {a.prior_weight} → now {a.weight}</div>}
                    </div>
                  </details>
                ))}
              </div>
              {table.calibrated && (
                <details className="mt-4 text-xs">
                  <summary className="cursor-pointer text-slate-300">Sources & method</summary>
                  <p className="mt-2 text-slate-500">{table.calibrated.method} Weight = 60% evidence + 40% earlier estimate. Recall papers are memory-based reconstructions, not official NBEMS papers.</p>
                  <ul className="mt-2 space-y-1">
                    {table.calibrated.sources.map((s) => (
                      <li key={s.id}>
                        <a className="text-violet-300 hover:text-violet-200" href={s.url} target="_blank" rel="noreferrer">{s.name}</a>
                        <span className="text-slate-600"> · {s.kind}{s.questions ? ` · ${s.questions} questions` : ''}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
