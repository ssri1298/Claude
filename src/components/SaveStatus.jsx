import { useEffect, useState } from 'react';
import { Cloud, CloudOff, Loader2, HardDrive } from 'lucide-react';
import { IS_WEB } from '../api.js';

/** Shows where the website keeps your data and whether the last change was saved. */
export default function SaveStatus({ compact = false }) {
  const [s, setS] = useState(null);
  useEffect(() => {
    if (!IS_WEB) return;
    let off = () => {};
    import('../web/backend.js').then((m) => (off = m.onStatus(setS)));
    return () => off();
  }, []);
  if (!IS_WEB || !s) return null;
  let icon = Cloud, text = 'Saved to your account', cls = 'text-emerald-300';
  if (s.mode === 'loading') [icon, text, cls] = [Loader2, 'Loading your data…', 'text-slate-400 animate-spin'];
  else if (s.error) [icon, text, cls] = [CloudOff, s.error, 'text-rose-300'];
  else if (s.saving) [icon, text, cls] = [Loader2, 'Saving…', 'text-slate-400 animate-spin'];
  else if (s.mode === 'offline') [icon, text, cls] = [CloudOff, 'Couldn’t reach your saved data. Changes on this visit stay in this browser.', 'text-amber-300'];
  else if (s.mode === 'browser') [icon, text, cls] = [HardDrive, 'Saved in this browser only', 'text-amber-300'];
  const Icon = icon;
  return (
    <div className={`flex items-start gap-2 text-xs text-slate-400 ${compact ? '' : 'rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5'}`} role="status">
      <Icon size={14} className={`mt-px shrink-0 ${cls}`} />
      <span>{text}</span>
    </div>
  );
}
