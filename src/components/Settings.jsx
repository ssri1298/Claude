import { useEffect, useRef, useState } from 'react';
import { Download, FileUp, Save } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Card, SectionHeader } from './ui.jsx';

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
  const fileRef = useRef();
  useEffect(() => setS(settings), [settings]);
  useEffect(() => {
    api.yieldTable().then(setTable);
  }, []);
  if (!s) return null;
  const set = (k, v) => setS((p) => ({ ...p, [k]: v }));
  const setP = (k, v) => setS((p) => ({ ...p, pomodoro: { ...p.pomodoro, [k]: v } }));

  const save = async () => {
    await api.saveSettings(s);
    await refresh();
    window.dispatchEvent(new Event('settings:changed'));
    toast('Settings saved');
  };
  const exportData = async () => {
    const d = await api.exportData();
    const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `scalpel-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  const importData = async (file) => {
    if (!confirm('Replace ALL current data with this backup?')) return;
    try {
      await api.importData(JSON.parse(await file.text()));
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
            <p className="mb-4 text-sm text-slate-400">Everything is stored locally in <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs">data/study.db</code>. You can also export a JSON backup.</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost" onClick={exportData}><Download size={15} /> Export backup</button>
              <button className="btn-ghost" onClick={() => fileRef.current?.click()}><FileUp size={15} /> Restore backup</button>
              <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files[0] && importData(e.target.files[0])} />
            </div>
          </Card>
          {table && (
            <Card className="p-5 sm:p-6">
              <div className="label mb-1">Exam-frequency model</div>
              <p className="mb-4 text-xs text-slate-500">{table.exam} · {table.areas.length} topic areas. {table.note}</p>
              <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                {[...table.areas].sort((a, b) => b.weight - a.weight).map((a) => (
                  <div key={a.area} className="flex items-center gap-3 text-xs">
                    <span className="w-6 text-right font-display text-white">{a.weight}</span>
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/5">
                      <div className="h-full bg-gradient-to-r from-violet-500 to-cyan-400" style={{ width: `${a.weight * 10}%` }} />
                    </div>
                    <span className="truncate text-slate-300">{a.area}</span>
                    <span className="ml-auto shrink-0 text-slate-600">{a.subject}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
