import { useState } from 'react';
import { FlaskConical, ImageUp, Sun, Sparkles } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { SAMPLE_TOPICS } from '../data/sampleTopics.js';
import { Card } from './ui.jsx';

const STEPS = [
  { icon: ImageUp, title: 'Import your video list', text: 'Drop screenshots of your course’s lessons. Scalpel reads each topic and its length.' },
  { icon: Sparkles, title: 'See what to study next', text: 'Topics are ranked by how often they appear in past NEET SS Surgical papers.' },
  { icon: Sun, title: 'Plan each morning', text: 'Say how much time you have. You get new videos plus active recall, as a to-do list.' },
];

export default function WelcomeCard() {
  const { navigate, refresh, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const addSamples = async () => {
    setBusy(true);
    try {
      await api.importTopics(SAMPLE_TOPICS);
      await refresh();
      toast('Added 10 sample topics. Remove them anytime from the Library.');
      navigate('next');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card gradient className="p-6 sm:p-8">
      <div className="label text-violet-300/80">Welcome to Scalpel</div>
      <h2 className="mt-2 font-display text-2xl font-semibold text-white">Three steps to your first study day</h2>
      <ol className="mt-6 grid gap-4 md:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, text }, i) => (
          <li key={title} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-violet-500/15 text-violet-200"><Icon size={16} /></span>
              <span className="font-display text-xs text-slate-500">Step {i + 1}</span>
            </div>
            <div className="mt-3 text-sm font-medium text-white">{title}</div>
            <p className="mt-1 text-sm text-slate-400">{text}</p>
          </li>
        ))}
      </ol>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <button className="btn-primary" onClick={() => navigate('import')}><ImageUp size={16} /> Import screenshots</button>
        <button className="btn-ghost" onClick={addSamples} disabled={busy}><FlaskConical size={16} /> Try it with 10 sample topics</button>
      </div>
    </Card>
  );
}
