// The patrol log, kept like a ship's log: time in the margin, one plain line per event, newest first.

import type { LogEntry } from '../lib/sessionState.ts';

function Mark({ e }: { e: LogEntry }) {
  if (e.level === 'warn') return <span className="mt-[5px] h-1.5 w-1.5 shrink-0 bg-yellow" />;
  if (e.level !== 'alert') return <span className="mt-[5px] h-1.5 w-1.5 shrink-0" />;
  const color = /CRITICAL/.test(e.text) ? 'bg-red' : /alert/i.test(e.text) ? 'bg-purple' : 'bg-orange';
  return <span className={`mt-[5px] h-1.5 w-1.5 shrink-0 ${color}`} />;
}

export function EventLog({ entries }: { entries: LogEntry[] }) {
  const recent = entries.slice(-80).reverse();
  return (
    <section className="flex h-full min-h-0 flex-col px-5 pb-2 pt-3">
      <h2 className="label mb-1.5">Log</h2>
      <ol className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
        {recent.length === 0 && <li className="py-1 text-[12px] text-ink-3">Entries appear here once a patrol starts.</li>}
        {recent.map((e, i) => (
          <li key={`${e.t}-${i}`} className="flex gap-3 border-b border-rule/70 py-[3px] text-[12.5px] leading-snug">
            <span className="num w-12 shrink-0 text-right font-mono text-[11px] leading-[18px] text-ink-3">{e.t.toFixed(1)}s</span>
            <Mark e={e} />
            <span className={e.level === 'info' ? 'text-ink-2' : 'text-ink'}>{e.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
