// Beach flags as the alert language, after the US Lifesaving Association system lifeguards fly:
// purple for dangerous marine life, double red for water closed to the public.

import type { AlertJson } from '../../shared/alerts.ts';

type Level = AlertJson['level'];

function Pennant({ x, fill, stroke, dash }: { x: number; fill: string; stroke?: string; dash?: boolean }) {
  return (
    <g>
      <line x1={x} y1={2} x2={x} y2={38} stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
      <path
        d={`M${x + 0.8} 3 h17 l-4.5 6.5 l4.5 6.5 h-17 z`}
        fill={fill}
        stroke={stroke}
        strokeWidth={stroke ? 1.2 : 0}
        strokeDasharray={dash ? '2.5 2' : undefined}
        strokeLinejoin="round"
      />
    </g>
  );
}

/** The flag (or flags) a lifeguard tower would fly for an alert level. */
export function LevelFlag({ level, className = 'h-10 w-10' }: { level: Level | 'open'; className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      {level === 'critical' && (
        <>
          <Pennant x={6} fill="var(--color-red)" />
          <Pennant x={16} fill="var(--color-red)" />
        </>
      )}
      {level === 'warning' && <Pennant x={10} fill="var(--color-purple)" />}
      {level === 'advisory' && <Pennant x={10} fill="none" stroke="var(--color-purple)" dash />}
      {level === 'open' && <Pennant x={10} fill="none" stroke="currentColor" />}
    </svg>
  );
}

export const LEVEL_SIGN: Record<Level, { word: string; line: string; color: string }> = {
  warning: { word: 'Purple flag', line: 'Dangerous marine life · lifeguards warn swimmers', color: 'text-purple' },
  critical: { word: 'Water closed', line: 'Double red · clear the water now', color: 'text-red' },
  advisory: { word: 'Sighting logged', line: 'Nobody notified · keep watching', color: 'text-ink' },
};

/** The SharkWatch mark: a pennant with a dorsal fin cut through it, in ink, so the alert colours
 * only ever appear when there is an alert. */
export function SharkWatchMark({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <line x1="5" y1="2.5" x2="5" y2="29.5" stroke="var(--color-ink)" strokeWidth="2" strokeLinecap="round" />
      <path d="M6 4 h21 l-5.5 8 l5.5 8 h-21 z" fill="var(--color-ink)" />
      <path d="M8.5 18.2 c3.4-.6 6.2-3.7 8.2-9.4 c1.2 4.2 3.4 7.3 6.8 9.4 z" fill="var(--color-paper)" />
    </svg>
  );
}
