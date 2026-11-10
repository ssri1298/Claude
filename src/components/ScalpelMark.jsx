import { useId } from 'react';

/**
 * Scalpel logo: violet→cyan handle with grip ridges and a steel No. 10 blade (curved cutting
 * edge, straight spine), angled like an instrument laid on a tray.
 */
export default function ScalpelMark({ size = 22, className = '' }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`h${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7c3aed" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
        <linearGradient id={`b${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f8fafc" />
          <stop offset="0.55" stopColor="#cbd5e1" />
          <stop offset="1" stopColor="#64748b" />
        </linearGradient>
      </defs>
      <g transform="rotate(-38 32 32)">
        {/* handle */}
        <rect x="3" y="28.5" width="31" height="7" rx="3.5" fill={`url(#h${id})`} />
        <g stroke="#0a0b10" strokeOpacity="0.35" strokeWidth="1.1" strokeLinecap="round">
          <line x1="9" y1="30.6" x2="9" y2="33.4" />
          <line x1="12" y1="30.6" x2="12" y2="33.4" />
          <line x1="15" y1="30.6" x2="15" y2="33.4" />
        </g>
        {/* bolster */}
        <rect x="33" y="29.6" width="4.5" height="4.8" rx="1" fill="#94a3b8" />
        {/* blade: straight spine on top, bellied cutting edge below, fine tip */}
        <path d="M37 29.6 L54 29.6 Q60.5 29.9 61 31.6 Q55 38.6 45 38.2 Q39.5 37.9 37 34.4 Z" fill={`url(#b${id})`} />
        <path d="M38.5 31.4 L53.5 31.2" stroke="#ffffff" strokeOpacity="0.7" strokeWidth="0.8" strokeLinecap="round" />
      </g>
    </svg>
  );
}
