import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Quote, Shuffle } from 'lucide-react';
import { QUOTES, quoteOfTheDay } from '../data/quotes.js';

export default function QuoteCard() {
  const [idx, setIdx] = useState(quoteOfTheDay);
  const q = QUOTES[idx];
  const shuffle = () => {
    let n = idx;
    while (n === idx) n = Math.floor(Math.random() * QUOTES.length);
    setIdx(n);
  };
  return (
    <div className="glass ring-gradient relative overflow-hidden p-7 sm:p-10">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-violet-600/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-cyan-500/15 blur-3xl" />
      <Quote className="absolute right-8 top-8 text-white/[0.05]" size={120} strokeWidth={1} />
      <div className="relative flex items-center justify-between">
        <div className="label text-violet-300/80">Today’s scrub-in thought</div>
        <button className="btn-icon" onClick={shuffle} title="Another quote" aria-label="Another quote">
          <Shuffle size={16} />
        </button>
      </div>
      <AnimatePresence mode="wait">
        <motion.figure
          key={idx}
          initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
          transition={{ duration: 0.45 }}
          className="relative mt-5"
        >
          <blockquote className="max-w-3xl font-serif text-2xl font-light italic leading-snug text-white sm:text-[2rem] sm:leading-[1.25]">
            “{q.text}”
          </blockquote>
          <figcaption className="mt-5 flex items-center gap-3 text-sm text-slate-400">
            <span className="h-px w-8 bg-gradient-to-r from-violet-400 to-cyan-300" />
            {q.by}
          </figcaption>
        </motion.figure>
      </AnimatePresence>
    </div>
  );
}
