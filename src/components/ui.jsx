import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useYieldModel } from '../lib/yieldModel.js';

export const fmtMin = (m) => {
  m = Math.round(m || 0);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
};

export function Card({ className = '', children, gradient = false, ...rest }) {
  return (
    <div className={`glass ${gradient ? 'ring-gradient' : ''} ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function SectionHeader({ eyebrow, title, subtitle, right }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <div className="label mb-2 text-violet-300/80">{eyebrow}</div>}
        <h1 className="h-section">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-slate-400">{subtitle}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

export function YieldBadge({ weight, area }) {
  const model = useYieldModel();
  const info = area && model?.byArea?.[area];
  const w = Number(weight) || 0;
  const band = w >= 8 ? 'high' : w >= 5 ? 'medium' : 'low';
  const cls = {
    high: 'border-rose-400/30 bg-rose-500/10 text-rose-300',
    medium: 'border-amber-400/30 bg-amber-500/10 text-amber-300',
    low: 'border-slate-500/30 bg-slate-500/10 text-slate-400',
  }[band];
  return (
    <span
      className={`chip ${cls}`}
      title={info ? `${area} · exam-frequency weight ${w}/10\n${info.evidence}\nConfidence: ${info.confidence}` : `Past-exam frequency weight ${w}/10`}
    >
      {band === 'high' ? 'High yield' : band === 'medium' ? 'Med yield' : 'Low yield'} · {Math.round(w * 10) / 10}
    </span>
  );
}

export function KindBadge({ kind }) {
  if (kind === 'revision')
    return <span className="chip border-cyan-400/30 bg-cyan-500/10 text-cyan-300">Active recall</span>;
  return <span className="chip border-violet-400/30 bg-violet-500/10 text-violet-300">New video</span>;
}

export function ProgressRing({ value = 0, size = 120, stroke = 10, children, from = '#8b5cf6', to = '#22d3ee', id = 'pr' }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.06)" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - v) }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          style={{ filter: `drop-shadow(0 0 6px ${from}66)` }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

export function Modal({ open, onClose, children, width = 'max-w-lg', dismissable = true }) {
  useEffect(() => {
    if (!open || !dismissable) return;
    const k = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose, dismissable]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => dismissable && e.target === e.currentTarget && onClose?.()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            className={`glass-strong ring-gradient w-full ${width} p-6 sm:p-7`}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          >
            {dismissable && (
              <button className="btn-icon absolute right-3 top-3" onClick={onClose} aria-label="Close">
                <X size={18} />
              </button>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Empty({ icon: Icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {Icon && (
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-gradient-to-br from-violet-500/15 to-cyan-500/10">
          <Icon className="text-violet-300" size={24} />
        </div>
      )}
      <div className="font-display text-lg font-semibold text-white">{title}</div>
      {children && <p className="mt-1.5 max-w-sm text-sm text-slate-400">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = '' }) {
  return (
    <div className={`relative overflow-hidden rounded-xl bg-white/[0.04] ${className}`}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/[0.05] to-transparent" />
    </div>
  );
}

export function Segmented({ value, onChange, options }) {
  return (
    <div className="inline-flex rounded-xl border border-white/[0.08] bg-white/[0.03] p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`relative rounded-lg px-3 py-1.5 text-xs font-medium transition ${value === o.value ? 'text-white' : 'text-slate-400 hover:text-slate-200'}`}
        >
          {value === o.value && <motion.span layoutId={`seg-${options.map((x) => x.value).join()}`} className="absolute inset-0 rounded-lg bg-white/[0.08]" />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Two-step button: the first click arms it, the second (within 4 s) runs `onConfirm`. */
export function ConfirmButton({ onConfirm, children, confirmLabel = 'Click again to confirm', className = 'btn-icon hover:text-rose-300', armedClassName = 'btn !border !border-rose-400/40 !bg-rose-500/15 !px-3 !py-1.5 text-xs text-rose-200', ...rest }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      {...rest}
      className={armed ? armedClassName : className}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}

export const SPEEDS = [1, 1.25, 1.5, 1.75, 2];
export const fmtSpeed = (s) => `${Number(s || 1)}×`;

/** Video playback speed chips (1× – 2×). */
export function SpeedPicker({ value, onChange, disabled = false, id = 'speed' }) {
  return (
    <div role="radiogroup" aria-label="Video speed" id={id} className="flex flex-wrap gap-1.5">
      {SPEEDS.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={Number(value) === s}
          disabled={disabled}
          onClick={() => onChange(s)}
          className={`chip cursor-pointer px-3 py-1 text-xs font-display transition ${Number(value) === s ? 'border-violet-400/50 bg-violet-500/20 text-white' : 'border-white/10 text-slate-400 hover:text-white'} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          {fmtSpeed(s)}
        </button>
      ))}
    </div>
  );
}
