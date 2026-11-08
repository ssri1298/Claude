import { useEffect, useState } from 'react';
import { Brain, BrainCircuit, CalendarPlus } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import RecallModal from './RecallModal.jsx';
import { Card, Empty, SectionHeader, YieldBadge } from './ui.jsx';

const rel = (n) => (n > 0 ? `${n}d overdue` : n === 0 ? 'due today' : `in ${-n}d`);

export default function RevisionQueue() {
  const { version, toast, refresh } = useApp();
  const [list, setList] = useState([]);
  const [recall, setRecall] = useState(null);
  const load = () => api.revision().then(setList);
  useEffect(() => {
    load();
  }, [version]);

  const due = list.filter((t) => t.due);
  const upcoming = list.filter((t) => !t.due);

  const addToday = async (t) => {
    try {
      await api.addTopicToday(t.id, 'revision');
      toast(`Recall of “${t.title}” added to today`);
      refresh();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const Row = ({ t }) => (
    <li className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-3.5">
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${t.due ? 'bg-cyan-500/15 text-cyan-300' : 'bg-white/[0.04] text-slate-500'}`}>
        <Brain size={17} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-white">{t.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          <span className={t.overdue > 0 ? 'text-rose-300' : t.due ? 'text-cyan-300' : ''}>{rel(t.overdue)}</span>
          <span>· {t.repetitions} recall{t.repetitions === 1 ? '' : 's'}</span>
          <span>· ease {t.ease}</span>
          <YieldBadge weight={t.weight} area={t.yield_area} />
        </div>
      </div>
      <button className="btn-icon" title="Add to today" onClick={() => addToday(t)} aria-label="Add to today"><CalendarPlus size={16} /></button>
      <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => setRecall(t)}>Recall now</button>
    </li>
  );

  return (
    <div>
      <SectionHeader
        eyebrow="Spaced repetition"
        title="Revision queue"
        subtitle="Topics you’ve finished come back for active recall at growing intervals. Rate each recall honestly and the schedule adapts to you."
      />
      {!list.length ? (
        <Card>
          <Empty icon={BrainCircuit} title="Nothing to revise yet">Finish a video topic and it will show up here tomorrow for its first recall.</Empty>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="label text-cyan-300/80">Due now</div>
              <span className="font-display text-2xl text-white">{due.length}</span>
            </div>
            <ul className="space-y-2">{due.length ? due.map((t) => <Row key={t.id} t={t} />) : <li className="py-6 text-center text-sm text-slate-500">All caught up 🎯</li>}</ul>
          </Card>
          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="label">Coming up</div>
              <span className="font-display text-2xl text-white">{upcoming.length}</span>
            </div>
            <ul className="space-y-2">{upcoming.slice(0, 30).map((t) => <Row key={t.id} t={t} />)}</ul>
          </Card>
        </div>
      )}
      <RecallModal
        topic={recall}
        onClose={() => setRecall(null)}
        onSubmit={async (rating, notes) => {
          const r = await api.review(recall.id, rating, notes);
          toast(`Next recall in ${r.interval_days} day${r.interval_days === 1 ? '' : 's'}`);
          setRecall(null);
          load();
          refresh();
        }}
      />
    </div>
  );
}
