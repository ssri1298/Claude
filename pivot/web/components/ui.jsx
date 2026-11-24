import { useEffect, useState } from 'react';
import { X, ChevronRight, Loader2 } from 'lucide-react';
import { pct, price } from '../lib.js';
import { useQuote, useFlash } from '../live.js';

export function Card({ className = '', children, onClick, as: As = 'div', ...rest }) {
  return (
    <As
      onClick={onClick}
      className={`bg-card rounded-3xl shadow-soft ${onClick ? 'cursor-pointer active:scale-[0.99] transition-transform' : ''} ${className}`}
      {...rest}
    >
      {children}
    </As>
  );
}

export function Section({ title, action, children, className = '', subtitle }) {
  return (
    <section className={`rise ${className}`}>
      {(title || action) && (
        <div className="flex items-end justify-between px-1 mb-3 gap-3">
          <div>
            {title && <h2 className="text-[22px] font-bold tracking-tight">{title}</h2>}
            {subtitle && <p className="text-ink2 text-[15px] mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function LargeTitle({ title, subtitle, right }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 pt-2 pb-5">
      <div className="min-w-0">
        {subtitle && <div className="text-ink2 text-[15px] font-semibold uppercase tracking-wide">{subtitle}</div>}
        <h1 className="text-[34px] sm:text-[40px] leading-tight font-bold tracking-tight truncate">{title}</h1>
      </div>
      {right}
    </header>
  );
}

const PILL_TONES = {
  mint: 'bg-mint-soft text-mint',
  coral: 'bg-coral-soft text-coral',
  lav: 'bg-lav-soft text-lav',
  sky: 'bg-sky-soft text-sky',
  peach: 'bg-peach-soft text-peach',
  butter: 'bg-butter-soft text-butter',
  rose: 'bg-rose-soft text-rose',
  gray: 'bg-card2 text-ink2',
};

export function Pill({ tone = 'gray', children, className = '', icon: Icon }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[14px] font-semibold whitespace-nowrap ${PILL_TONES[tone]} ${className}`}>
      {Icon && <Icon size={15} strokeWidth={2.4} />}
      {children}
    </span>
  );
}

export const gradeTone = (g) => ({ 'A+': 'mint', A: 'sky', B: 'lav', C: 'butter', D: 'gray' })[g] || 'gray';

export function GradeBadge({ grade, score, size = 'md' }) {
  const big = size === 'lg';
  return (
    <span
      className={`inline-flex items-center justify-center rounded-2xl font-bold num ${PILL_TONES[gradeTone(grade)]} ${big ? 'h-14 min-w-14 px-3 text-[22px]' : 'h-9 min-w-9 px-2 text-[16px]'}`}
      title={score != null ? `Score ${score}/100` : undefined}
    >
      {grade}
      {score != null && big && <span className="ml-1.5 text-[14px] font-semibold opacity-80">{score}</span>}
    </span>
  );
}

export function ScoreRing({ score = 0, size = 56, stroke = 6, label }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tone = score >= 85 ? 'text-mint' : score >= 75 ? 'text-sky' : score >= 65 ? 'text-lav' : score >= 55 ? 'text-butter' : 'text-ink3';
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} aria-label={`Score ${score} of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-current text-card2" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(100, score) / 100)}
          className={`stroke-current ${tone} transition-all duration-700`}
        />
      </svg>
      <span className="absolute text-[17px] font-bold num">{label ?? score}</span>
    </div>
  );
}

export function Segmented({ value, onChange, options, className = '', size = 'md' }) {
  return (
    <div className={`inline-flex bg-card2 rounded-2xl p-1 gap-1 ${className}`} role="tablist">
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.value;
        const l = typeof o === 'string' ? o : o.label;
        const active = v === value;
        return (
          <button
            key={v}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(v)}
            className={`rounded-xl font-semibold whitespace-nowrap transition-all ${size === 'sm' ? 'px-3 py-1.5 text-[14px]' : 'px-4 py-2 text-[16px]'} ${
              active ? 'bg-card text-ink shadow-soft' : 'text-ink2 hover:text-ink'
            }`}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ checked, onChange, disabled, label }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 ${checked ? 'bg-mint' : 'bg-ink3/40'} ${disabled ? 'opacity-40' : ''}`}
    >
      <span className={`absolute top-[2px] left-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-md transition-transform duration-200 ${checked ? 'translate-x-5' : ''}`} />
    </button>
  );
}

export function Button({ children, tone = 'accent', size = 'md', className = '', loading, icon: Icon, ...rest }) {
  const tones = {
    accent: 'bg-accent text-white hover:brightness-110',
    mint: 'bg-mint text-white dark:text-black hover:brightness-110',
    coral: 'bg-coral text-white dark:text-black hover:brightness-110',
    soft: 'bg-card2 text-ink hover:bg-line/10',
    lav: 'bg-lav-soft text-lav hover:brightness-95',
    coralSoft: 'bg-coral-soft text-coral hover:brightness-95',
    mintSoft: 'bg-mint-soft text-mint hover:brightness-95',
    ghost: 'text-accent hover:bg-lav-soft',
  };
  const sizes = { sm: 'h-10 px-4 text-[15px]', md: 'h-12 px-5 text-[17px]', lg: 'h-14 px-7 text-[19px]' };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none ${tones[tone]} ${sizes[size]} ${className}`}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading ? <Loader2 size={18} className="animate-spin" /> : Icon && <Icon size={size === 'sm' ? 17 : 20} strokeWidth={2.3} />}
      {children}
    </button>
  );
}

export function Stat({ label, value, sub, tone = '', className = '', big }) {
  return (
    <div className={`bg-card rounded-3xl shadow-soft p-4 sm:p-5 ${className}`}>
      <div className="text-ink2 text-[14px] font-semibold">{label}</div>
      <div className={`num font-bold tracking-tight mt-1 ${big ? 'text-[34px]' : 'text-[26px]'} ${tone}`}>{value}</div>
      {sub && <div className="text-ink2 text-[14px] mt-0.5">{sub}</div>}
    </div>
  );
}

export function Sheet({ open, onClose, title, children, wide }) {
  useEffect(() => {
    if (!open) return;
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', h);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px]" onClick={onClose} />
      <div className={`relative bg-bg w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} max-h-[92vh] overflow-y-auto rounded-t-4xl sm:rounded-4xl shadow-lift rise safe-bottom`}>
        <div className="sticky top-0 glass flex items-center justify-between px-5 py-4 z-10">
          <h3 className="text-[20px] font-bold">{title}</h3>
          <button onClick={onClose} className="h-9 w-9 rounded-full bg-card2 flex items-center justify-center text-ink2" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="px-5 pb-6">{children}</div>
      </div>
    </div>
  );
}

export function Empty({ icon: Icon, title, text, action }) {
  return (
    <div className="text-center py-10 px-6">
      {Icon && (
        <div className="mx-auto h-16 w-16 rounded-3xl bg-lav-soft text-lav flex items-center justify-center mb-4">
          <Icon size={30} />
        </div>
      )}
      <div className="text-[19px] font-semibold">{title}</div>
      {text && <p className="text-ink2 mt-1 max-w-md mx-auto">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ className = '' }) {
  return (
    <div className={`flex justify-center py-16 text-ink3 ${className}`}>
      <Loader2 className="animate-spin" size={30} />
    </div>
  );
}

/** iOS-style grouped list */
export function List({ children, className = '' }) {
  return <div className={`bg-card rounded-3xl shadow-soft overflow-hidden divide-y hairline ${className}`}>{children}</div>;
}

export function Row({ title, subtitle, right, onClick, icon: Icon, iconTone = 'lav', chevron, children }) {
  const C = onClick ? 'button' : 'div';
  return (
    <C onClick={onClick} className={`w-full text-left flex items-center gap-3 px-4 sm:px-5 py-3.5 min-h-[60px] ${onClick ? 'hover:bg-card2/60 active:bg-card2' : ''}`}>
      {Icon && (
        <span className={`h-9 w-9 shrink-0 rounded-xl flex items-center justify-center ${PILL_TONES[iconTone]}`}>
          <Icon size={19} strokeWidth={2.2} />
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[17px] font-medium">{title}</div>
        {subtitle && <div className="text-ink2 text-[14px] leading-snug">{subtitle}</div>}
        {children}
      </div>
      {right}
      {chevron && <ChevronRight size={20} className="text-ink3 shrink-0" />}
    </C>
  );
}

export function NumberField({ value, onChange, suffix, min, max, step = 1, width = 'w-28' }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => setV(value ?? ''), [value]);
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        inputMode="decimal"
        className={`${width} text-right bg-card2 rounded-xl px-3 py-2 text-[17px] num font-semibold outline-none focus:ring-2 ring-accent/40`}
        value={v}
        min={min}
        max={max}
        step={step}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== '' && Number(v) !== value && onChange(Number(v))}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      {suffix && <span className="text-ink2 text-[15px]">{suffix}</span>}
    </div>
  );
}

export function TextField({ value, onChange, placeholder, type = 'text', className = '' }) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full bg-card2 rounded-xl px-4 py-3 text-[17px] outline-none focus:ring-2 ring-accent/40 ${className}`}
      autoComplete="off"
      spellCheck={false}
    />
  );
}

export const STAGES = {
  breakout: { label: 'In buy zone', tone: 'mint' },
  near: { label: 'Near pivot', tone: 'sky' },
  forming: { label: 'Forming', tone: 'lav' },
  extended: { label: 'Extended', tone: 'peach' },
  none: { label: 'No setup', tone: 'gray' },
};

export function StageBadge({ stage, dist }) {
  const live = dist != null && dist > 0 && dist <= 5 ? 'breakout' : stage;
  const s = STAGES[live] || STAGES.none;
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

/** Visual: stop ◀— entry —▶ +10% target, with the current price marker. */
export function RiskBar({ stop, entry, target, ltp, partialDone }) {
  const lo = Math.min(stop, ltp) * 0.995;
  const hi = Math.max(target, ltp) * 1.005;
  const x = (v) => `${((v - lo) / (hi - lo)) * 100}%`;
  const up = ltp >= entry;
  return (
    <div className="mt-3">
      <div className="relative h-2.5 rounded-full bg-card2">
        <div className="absolute inset-y-0 rounded-full bg-coral/25" style={{ left: x(stop), width: `calc(${x(entry)} - ${x(stop)})` }} />
        <div className="absolute inset-y-0 rounded-full bg-mint/25" style={{ left: x(entry), width: `calc(${x(target)} - ${x(entry)})` }} />
        <div
          className={`absolute -top-1 h-[18px] w-[18px] -ml-[9px] rounded-full border-[3px] border-card shadow ${up ? 'bg-mint' : 'bg-coral'}`}
          style={{ left: x(ltp) }}
          title={`Now ${price(ltp)}`}
        />
      </div>
      <div className="flex justify-between text-[13px] text-ink2 mt-2 num">
        <span>{partialDone ? 'Stop (breakeven)' : 'Stop'} {price(stop)}</span>
        <span>Buy {price(entry)}</span>
        <span>{partialDone ? '⅓ booked ✓' : `+10% ${price(target)}`}</span>
      </div>
    </div>
  );
}

export function Contractions({ list = [] }) {
  if (!list.length) return null;
  const max = Math.max(...list);
  return (
    <div className="flex items-end gap-1 h-7" title={list.map((x) => x.toFixed(1) + '%').join(' → ')} aria-label={`Contractions ${list.map((x) => x.toFixed(0) + '%').join(', ')}`}>
      {list.map((d, i) => (
        <div key={i} className="w-2.5 rounded-t-[4px] bg-lav/70" style={{ height: `${Math.max(14, (d / max) * 100)}%` }} />
      ))}
    </div>
  );
}

export function Delta({ value, suffix = '%', d = 1, className = '' }) {
  if (value == null) return <span className="text-ink3">—</span>;
  return <span className={`num font-semibold ${value > 0 ? 'text-mint' : value < 0 ? 'text-coral' : 'text-ink2'} ${className}`}>{suffix === '%' ? pct(value, d) : value}</span>;
}

/** A price that updates live from Kite and flashes green/red when it ticks. */
export function LivePrice({ symbol, fallback, className = '', showChange = false, changeClass = 'text-[14px]' }) {
  const q = useQuote(symbol);
  const ltp = q?.ltp ?? fallback?.ltp ?? fallback;
  const chg = q?.changePct ?? fallback?.changePct;
  const dir = useFlash(ltp);
  return (
    <span className="inline-flex flex-col items-end">
      <span className={`num rounded-md px-1 -mx-1 transition-colors ${dir === 'up' ? 'flash-up' : dir === 'down' ? 'flash-down' : ''} ${className}`}>{price(ltp)}</span>
      {showChange && <Delta value={chg} className={changeClass} />}
    </span>
  );
}
