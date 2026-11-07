import { useEffect, useState } from 'react';
import { Brain } from 'lucide-react';
import { Modal } from './ui.jsx';

const PROMPTS = [
  'Definition, classification & staging',
  'Aetiology / risk factors & pathology',
  'Clinical features & key signs',
  'Investigations of choice (and gold standard)',
  'Management algorithm — conservative vs operative',
  'Complications & prognosis',
  'Recent guideline changes / exam-favourite facts',
];

const RATINGS = [
  { v: 'again', label: 'Blank', sub: 'Review tomorrow', cls: 'border-rose-400/30 hover:bg-rose-500/15 text-rose-200' },
  { v: 'hard', label: 'Hard', sub: 'Shorter gap', cls: 'border-amber-400/30 hover:bg-amber-500/15 text-amber-200' },
  { v: 'ok', label: 'Good', sub: 'Normal gap', cls: 'border-cyan-400/30 hover:bg-cyan-500/15 text-cyan-200' },
  { v: 'easy', label: 'Easy', sub: 'Longer gap', cls: 'border-emerald-400/30 hover:bg-emerald-500/15 text-emerald-200' },
];

/** Active-recall card: write from memory first, then self-rate (feeds spaced repetition). */
export default function RecallModal({ topic, onClose, onSubmit }) {
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setNotes(''), [topic?.id, topic?.title]);
  const rate = async (r) => {
    setBusy(true);
    try {
      await onSubmit(r, notes);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={!!topic} onClose={onClose} width="max-w-2xl">
      {topic && (
        <>
          <div className="mb-5 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-cyan-500/15 ring-1 ring-cyan-300/20">
              <Brain size={20} className="text-cyan-300" />
            </div>
            <div className="min-w-0">
              <div className="label text-cyan-300/80">Active recall</div>
              <h2 className="truncate font-display text-xl font-semibold text-white">{topic.title}</h2>
            </div>
          </div>
          <p className="text-sm text-slate-400">Close your notes. Write everything you can remember, then compare and rate yourself honestly.</p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {PROMPTS.map((p) => (
              <span key={p} className="chip border-white/10 bg-white/[0.03] text-slate-400">{p}</span>
            ))}
          </div>
          <textarea
            className="input mt-4 min-h-[180px] resize-y font-mono text-[13px] leading-relaxed"
            placeholder="Brain-dump here…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            autoFocus
          />
          <div className="label mt-6">How well did you recall it?</div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {RATINGS.map((r) => (
              <button key={r.v} disabled={busy} onClick={() => rate(r.v)} className={`rounded-xl border bg-white/[0.02] px-3 py-3 text-left transition ${r.cls}`}>
                <div className="font-display text-sm font-semibold">{r.label}</div>
                <div className="text-[11px] text-slate-400">{r.sub}</div>
              </button>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
