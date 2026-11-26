// Hand-drawn animated icons for the four agents. The drawing itself moves while the agent works:
//   busy      full animation
//   watching  the same motion, slow and calm
//   waiting   still, with a small nudge every few seconds (it needs you)
//   idle      completely still
// All motion stops when the phone asks for reduced motion.

const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

/** Parent — a crown; its three jewels light up one after another. */
function Crown() {
  return (
    <>
      <g className="ag-bob">
        <path d="M6.5 22 L8 11.5 L12.8 16.2 L16 9 L19.2 16.2 L24 11.5 L25.5 22 Z" {...common} />
        <path d="M7.5 25.5 H24.5" {...common} />
        {[
          [8, 9.6],
          [16, 6.8],
          [24, 9.6],
        ].map(([cx, cy], i) => (
          <circle key={i} className="ag-jewel" style={{ animationDelay: `${i * 0.28}s` }} cx={cx} cy={cy} r="1.9" fill="currentColor" />
        ))}
      </g>
    </>
  );
}

/** Screener — a radar screen: a beam sweeps around inside and blips appear where it finds stocks. */
function Radar() {
  return (
    <>
      <circle cx="16" cy="16" r="11.5" {...common} />
      <circle cx="16" cy="16" r="6" {...common} strokeWidth="1.2" opacity="0.4" />
      <g className="ag-beam">
        <path d="M16 16 L16 4.5 A11.5 11.5 0 0 1 25.4 9.4 Z" fill="currentColor" opacity="0.28" />
        <path d="M16 16 L16 4.5" {...common} />
      </g>
      <circle className="ag-blip" style={{ animationDelay: '0.35s' }} cx="21.5" cy="11.5" r="1.7" fill="currentColor" />
      <circle className="ag-blip" style={{ animationDelay: '1.4s' }} cx="11" cy="20.5" r="1.7" fill="currentColor" />
      <circle cx="16" cy="16" r="1.4" fill="currentColor" />
    </>
  );
}

/** Analyst — a magnifying glass gliding along a price line, with a sparkle when it finds something. */
function Analyst() {
  return (
    <>
      <polyline points="4.5,25 10,20 14,22.5 20,15 27.5,17" {...common} strokeWidth="1.6" opacity="0.45" />
      <g transform="translate(14.5 13.5)">
        <g className="ag-scan">
          <circle cx="0" cy="0" r="5.6" {...common} />
          <path d="M4.1 4.1 L8 8" {...common} strokeWidth="2.6" />
        </g>
      </g>
      <path className="ag-spark" d="M25.5 3.5 L26.4 6.1 L29 7 L26.4 7.9 L25.5 10.5 L24.6 7.9 L22 7 L24.6 6.1 Z" fill="currentColor" />
    </>
  );
}

/** Executor — a shield with a heartbeat pulse running through it (guarding your positions). */
function Executor() {
  const pulse = 'M9 16.5 H12.4 L14.3 11.5 L17.6 21 L19.5 16.5 H23';
  return (
    <>
      <path d="M16 4 L25.5 7.6 V15 C25.5 21 21.6 25.4 16 27.8 C10.4 25.4 6.5 21 6.5 15 V7.6 Z" {...common} />
      <path d={pulse} {...common} strokeWidth="1.8" opacity="0.3" />
      <path className="ag-pulse" d={pulse} pathLength="1" {...common} strokeWidth="2.2" />
    </>
  );
}

const DRAW = { parent: Crown, screener: Radar, analyst: Analyst, executor: Executor };

export default function AgentGlyph({ kind, s = 'idle', size = 24 }) {
  const Draw = DRAW[kind] || Crown;
  return (
    <svg className="ag" data-s={s} viewBox="0 0 32 32" width={size} height={size} aria-hidden>
      <Draw />
    </svg>
  );
}
