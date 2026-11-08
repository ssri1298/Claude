import { useEffect, useState } from 'react';
import { RefreshCcw, Sparkles } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { useYieldModel } from '../lib/yieldModel.js';

/** One-time card: the topic-yield model changed, offer to re-score the student's topics. */
export default function ModelUpdateCard() {
  const { settings, refresh, toast, version } = useApp();
  const model = useYieldModel();
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.topics().then((t) => setCount(t.length)).catch(() => {});
  }, [version]);
  if (!model?.version || !settings || settings.yieldModelSeen === model.version || !count) return null;

  const rescore = async () => {
    setBusy(true);
    try {
      const r = await api.rescoreYield();
      await refresh();
      toast(`Re-scored with past-paper data: ${r.changed} topic${r.changed === 1 ? '' : 's'} changed. Your manual overrides were kept.`);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const dismiss = async () => {
    await api.saveSettings({ yieldModelSeen: model.version });
    refresh();
  };

  return (
    <div className="glass ring-gradient flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-300"><Sparkles size={18} /></div>
        <div className="min-w-0">
          <div className="label text-emerald-300/80">Topic yield model updated</div>
          <div className="mt-0.5 font-display text-base font-semibold text-white">Now based on the 2022–2024 NEET SS Surgical papers</div>
          <p className="mt-0.5 text-xs text-slate-400">Weights come from 429 recalled questions plus 2025 paper analyses. Re-score your {count} topics to update Study Next. Your manual overrides are kept.</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button className="btn-primary" onClick={rescore} disabled={busy}><RefreshCcw size={16} /> {busy ? 'Re-scoring…' : `Re-score my ${count} topics`}</button>
        <button className="btn-ghost" onClick={dismiss}>Not now</button>
      </div>
    </div>
  );
}
