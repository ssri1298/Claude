import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Lock, Share2, Users } from 'lucide-react';
import { IS_WEB } from '../api.js';
import { Card } from './ui.jsx';

const SHARE_URL = import.meta.env.VITE_SHARE_URL || '';

/**
 * Settings card. For you: how to share Scalpel with friends (they get an empty copy; your data stays
 * private). For a friend opening your shared link: their progress lives in their own browser.
 */
export default function ShareCard() {
  const [owner, setOwner] = useState(null);
  const [copied, setCopied] = useState(false);
  const linkRef = useRef();
  useEffect(() => {
    if (!IS_WEB) return setOwner(true);
    import('../web/backend.js').then((m) => m.onStatus((s) => s.mode !== 'loading' && setOwner(!!s.owner)));
  }, []);
  if (owner === null || !SHARE_URL) return null;

  if (!owner) {
    return (
      <Card className="p-5 sm:p-6">
        <div className="label mb-2 flex items-center gap-1.5"><Users size={12} /> Shared with you</div>
        <p className="text-sm text-slate-300">This is your own Scalpel. The friend who shared it can’t see your topics or progress, and you can’t see theirs.</p>
        <p className="mt-2 text-sm text-slate-400">Your progress is saved in this browser only. Use <b className="text-slate-200">Export backup</b> below now and then, so you don’t lose it if you clear your browser or switch devices.</p>
      </Card>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SHARE_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      linkRef.current?.select();
    }
  };

  return (
    <Card className="p-5 sm:p-6">
      <div className="label mb-2 flex items-center gap-1.5"><Share2 size={12} /> Share Scalpel with friends</div>
      <p className="flex gap-2 text-sm text-slate-300">
        <Lock size={15} className="mt-0.5 shrink-0 text-emerald-300" />
        Friends get an empty Scalpel of their own. Your topics, plans, progress and the lists Claude prepares for you stay private.
      </p>
      <div className="mt-4 flex gap-2">
        <input id="share-link" ref={linkRef} readOnly value={SHARE_URL} onFocus={(e) => e.target.select()} className="input !py-2 font-mono text-xs" aria-label="Link to Scalpel" />
        <button className="btn-ghost shrink-0" onClick={copy}>{copied ? <><Check size={15} className="text-emerald-300" /> Copied</> : <><Copy size={15} /> Copy link</>}</button>
      </div>
      <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-xs text-slate-400">
        <li>Open the <b className="text-slate-200">Share</b> menu at the top of this claude.ai page and invite your friends by email, or turn on link sharing.</li>
        <li>Send them the link. It only opens for people you’ve shared it with.</li>
        <li>Their progress is saved in their own browser, so tell them to use <b className="text-slate-200">Export backup</b> now and then.</li>
      </ol>
    </Card>
  );
}
