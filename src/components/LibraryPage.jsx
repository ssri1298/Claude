import { useEffect, useMemo, useRef, useState } from 'react';
import { FileUp, RotateCcw, Search, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Card, SectionHeader, Segmented, YieldBadge, fmtMin, Empty, ConfirmButton } from './ui.jsx';

const STATUS_CLS = {
  pending: 'border-slate-500/30 text-slate-400',
  planned: 'border-violet-400/30 text-violet-300',
  done: 'border-emerald-400/30 text-emerald-300',
  skipped: 'border-amber-400/30 text-amber-300',
};

export default function LibraryPage() {
  const { version, toast, refresh } = useApp();
  const [topics, setTopics] = useState([]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const csvRef = useRef();
  const load = () => api.topics().then(setTopics);
  useEffect(() => {
    load();
  }, [version]);

  const shown = useMemo(
    () =>
      topics.filter((t) => (filter === 'all' || t.status === filter) && (!q || `${t.title} ${t.yield_area} ${t.subject}`.toLowerCase().includes(q.toLowerCase()))),
    [topics, q, filter],
  );

  const patch = async (t, p) => {
    const u = await api.patchTopic(t.id, p);
    setTopics((all) => all.map((x) => (x.id === t.id ? u : x)));
  };

  const onCsv = async (file) => {
    const text = await file.text();
    const r = await api.yieldCsv(text);
    toast(`Past-paper CSV: ${r.rows} rows, ${r.matched} topics re-weighted`);
    load();
    refresh();
  };

  return (
    <div>
      <SectionHeader
        eyebrow={`${topics.length} topics`}
        title="Library"
        subtitle="Every imported video topic. Drag the exam-frequency slider to override the built-in estimate with your own past-paper analysis."
        right={
          <>
            {topics.some((t) => t.source === 'sample') && (
              <ConfirmButton
                className="btn-ghost"
                confirmLabel="Remove all sample topics?"
                onConfirm={async () => {
                  for (const t of topics.filter((x) => x.source === 'sample')) await api.deleteTopic(t.id);
                  toast('Sample topics removed');
                  load();
                  refresh();
                }}
              >
                <Trash2 size={15} /> Remove sample topics
              </ConfirmButton>
            )}
            <button className="btn-ghost" onClick={() => csvRef.current?.click()} title="CSV with columns: topic,count">
              <FileUp size={15} /> Import past-paper CSV
            </button>
            <input ref={csvRef} type="file" accept=".csv,text/csv,text/plain" hidden onChange={(e) => e.target.files[0] && onCsv(e.target.files[0])} />
          </>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className="input pl-10" placeholder="Search topics, areas, subjects…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[{ value: 'all', label: 'All' }, { value: 'pending', label: 'Pending' }, { value: 'done', label: 'Done' }, { value: 'skipped', label: 'Skipped' }]}
        />
      </div>
      <Card className="overflow-hidden">
        {!shown.length ? (
          <Empty icon={Search} title="No topics match">Try a different search or filter.</Empty>
        ) : (
          <ul className="divide-y divide-white/[0.04]">
            {shown.map((t) => (
              <li key={t.id} className="grid gap-3 p-4 md:grid-cols-[1fr_220px_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-white">{t.title}</span>
                    <span className={`chip ${STATUS_CLS[t.status]}`}>{t.status}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                    {t.section && <><span className="text-slate-400">{t.section}</span>·</>}
                    <span>{t.yield_area}</span>·<span>{fmtMin(t.duration_min)}</span>
                    {t.next_review && t.status === 'done' && <span>· next recall {t.next_review}</span>}
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <YieldBadge weight={t.weight} />
                    {t.yield_override != null && (
                      <button className="text-[10px] text-slate-500 hover:text-slate-300" onClick={() => patch(t, { yield_override: null })}>reset</button>
                    )}
                  </div>
                  <input
                    type="range"
                    className="range"
                    min={1}
                    max={10}
                    step={1}
                    defaultValue={Math.round(t.weight)}
                    onMouseUp={(e) => patch(t, { yield_override: Number(e.currentTarget.value) })}
                    onTouchEnd={(e) => patch(t, { yield_override: Number(e.currentTarget.value) })}
                    onKeyUp={(e) => patch(t, { yield_override: Number(e.currentTarget.value) })}
                    aria-label="Exam frequency"
                  />
                </div>
                <div className="flex justify-end gap-1">
                  {t.status === 'skipped' && (
                    <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={async () => { await api.restoreTopic(t.id); load(); refresh(); }}>
                      <RotateCcw size={13} /> Restore
                    </button>
                  )}
                  <ConfirmButton
                    confirmLabel="Delete topic?"
                    title="Delete this topic and its history"
                    aria-label="Delete"
                    onConfirm={async () => {
                      await api.deleteTopic(t.id);
                      toast(`Deleted “${t.title}”`);
                      load();
                      refresh();
                    }}
                  >
                    <Trash2 size={15} />
                  </ConfirmButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
