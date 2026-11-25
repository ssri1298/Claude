// Trade journal: notes and tags for a trade — why you took it, how you felt, what you learned.
import { useEffect, useState } from 'react';
import { NotebookPen, Trash2 } from 'lucide-react';
import { api, istDateTime } from '../lib.js';
import { Button, Sheet } from './ui.jsx';

export const JOURNAL_TAGS = ['Followed the rules', 'Overruled the agents', 'FOMO', 'Sold too early', 'Held too long', 'Great setup', 'Market was weak', 'Lesson learned'];

export function JournalSheet({ position, onClose, onChanged }) {
  const [notes, setNotes] = useState(null);
  const [text, setText] = useState('');
  const [tags, setTags] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const load = () => position && api(`/journal?positionId=${position.id}`).then(setNotes).catch(() => setNotes([]));
  useEffect(() => {
    setNotes(null);
    setText('');
    setTags([]);
    load();
  }, [position?.id]);
  if (!position) return null;
  const add = async () => {
    setBusy(true);
    setErr('');
    try {
      await api('/journal', { method: 'POST', body: { positionId: position.id, text, tags } });
      setText('');
      setTags([]);
      await load();
      onChanged?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const del = async (id) => {
    await api(`/journal/${id}`, { method: 'DELETE' });
    await load();
    onChanged?.();
  };
  return (
    <Sheet open title={`Journal · ${position.symbol}`} onClose={onClose}>
      <div className="space-y-2">
        {notes === null ? null : notes.length === 0 ? (
          <p className="text-ink2">No notes yet. Write why you took the trade, how you felt, and what you learned — your weekly report collects them.</p>
        ) : (
          notes.map((n) => (
            <div key={n.id} className="bg-card rounded-2xl px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink3 text-[13px]">{istDateTime(n.ts)}</span>
                <button onClick={() => del(n.id)} className="text-ink3 hover:text-coral" aria-label="Delete note">
                  <Trash2 size={16} />
                </button>
              </div>
              {n.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {n.tags.map((t) => (
                    <span key={t} className="text-[12px] font-semibold rounded-full px-2 py-0.5 bg-lav-soft text-lav">
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {n.text && <p className="text-[16px] mt-1 whitespace-pre-wrap break-words">{n.text}</p>}
            </div>
          ))
        )}
      </div>
      <div className="mt-5">
        <div className="flex flex-wrap gap-1.5">
          {JOURNAL_TAGS.map((t) => {
            const on = tags.includes(t);
            return (
              <button key={t} onClick={() => setTags(on ? tags.filter((x) => x !== t) : [...tags, t])} className={`text-[14px] font-semibold rounded-full px-3 py-1.5 ${on ? 'bg-accent text-white' : 'bg-card text-ink2'}`}>
                {t}
              </button>
            );
          })}
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Why did you take it? How did you feel? What would you do differently?"
          rows={4}
          className="mt-3 w-full bg-card rounded-2xl px-4 py-3 text-[16px] outline-none focus:ring-2 ring-accent/40 resize-y"
        />
        {err && <div className="text-coral font-semibold mt-2">{err}</div>}
        <Button className="w-full mt-3" size="lg" icon={NotebookPen} loading={busy} onClick={add}>
          Add note
        </Button>
      </div>
    </Sheet>
  );
}

export function JournalButton({ p, onOpen, size = 'sm' }) {
  return (
    <Button
      size={size}
      tone="soft"
      icon={NotebookPen}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(p);
      }}
    >
      Journal{p.journalCount ? ` (${p.journalCount})` : ''}
    </Button>
  );
}
