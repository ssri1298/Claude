import { useEffect, useState } from 'react';
import { Inbox, ListChecks } from 'lucide-react';
import { IS_WEB } from '../api.js';
import { useApp } from '../store.jsx';
import { setPrefill } from '../lib/prefill.js';
import { ConfirmButton, fmtMin } from './ui.jsx';

/** Shows topic batches Claude prepared for you (e.g. from screenshots sent in chat). */
export default function InboxBanner({ compact = false }) {
  const { navigate, version, page } = useApp();
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (!IS_WEB) return;
    let live = true;
    import('../web/backend.js').then((m) => m.listInbox()).then((x) => live && setItems(x));
    return () => {
      live = false;
    };
  }, [version]);
  if (!items.length) return null;

  const review = (b) => {
    setPrefill(b);
    if (page === 'import') window.dispatchEvent(new Event('scalpel:prefill'));
    else navigate('import');
  };
  const dismiss = async (b) => {
    const { deleteInbox } = await import('../web/backend.js');
    await deleteInbox(b.inboxId);
    setItems((x) => x.filter((y) => y.inboxId !== b.inboxId));
  };

  return (
    <div className="space-y-3">
      {items.map((b) => {
        const mins = b.topics.reduce((a, t) => a + (Number(t.duration_min) || 0), 0);
        return (
          <div key={b.inboxId} className={`glass ring-gradient flex flex-col gap-4 ${compact ? 'p-4' : 'p-5 sm:flex-row sm:items-center sm:p-6'}`}>
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-200"><Inbox size={18} /></div>
              <div className="min-w-0">
                <div className="label text-violet-300/80">Prepared by Claude</div>
                <div className="mt-0.5 font-display text-base font-semibold text-white">{b.topics.length} topics from your screenshots</div>
                <div className="mt-0.5 truncate text-xs text-slate-400">{b.title} · {fmtMin(mins)} of video</div>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn-primary" onClick={() => review(b)}><ListChecks size={16} /> Review & import</button>
              <ConfirmButton className="btn-ghost" confirmLabel="Discard this list?" onConfirm={() => dismiss(b)}>Dismiss</ConfirmButton>
            </div>
          </div>
        );
      })}
    </div>
  );
}
