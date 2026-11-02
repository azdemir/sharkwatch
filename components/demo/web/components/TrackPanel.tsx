// Contacts, in the radar sense: every tracked animal and person, most important first. A row reads
// across like a log line; the selected one opens to show its evidence photo and Muse Spark's note.

import type { TrackSummary } from '../../shared/events.ts';
import { speciesPhrase } from '../../shared/risk.ts';
import { api } from '../lib/api.ts';
import { formatDistance } from '../lib/chart.ts';

const fmtM = (m: number) => (m < 10 ? m.toFixed(1) : m.toFixed(0));
const compass = (deg: number) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function title(t: TrackSummary): string {
  if (t.kind === 'person') return 'Person';
  switch (t.verdict) {
    case 'shark':
      return capitalise(speciesPhrase(t.verification) ?? 'shark');
    case 'not_shark':
      return capitalise((t.verification?.label ?? 'not a shark').replace(/_/g, ' '));
    case 'uncertain':
      return 'Needs a human look';
    case 'verifying':
      return 'Checking with Muse Spark';
    default:
      return 'Candidate';
  }
}

function Marker({ t }: { t: TrackSummary }) {
  const base = 'h-2.5 w-2.5 shrink-0';
  if (t.kind === 'person') return <span className={`${base} border border-ink-2 bg-sheet`} />;
  switch (t.verdict) {
    case 'shark':
      return <span className={`${base} bg-orange`} />;
    case 'uncertain':
      return <span className={`${base} border-[1.5px] border-yellow-ink`} />;
    case 'not_shark':
      return <span className={`${base} bg-ink-3/50`} />;
    default:
      return <span className={`${base} bg-yellow`} />;
  }
}

function lengthText(t: TrackSummary): string | undefined {
  if (!t.length) return undefined;
  return t.length.reliable === false ? `${fmtM(t.length.low)}–${fmtM(t.length.high)} m?` : `${fmtM(t.length.meters)} m`;
}

function Row({ track: t, sessionId, selected, onSelect, departed = false }: { track: TrackSummary; sessionId?: string; selected: boolean; onSelect: () => void; departed?: boolean }) {
  const v = t.verification;
  const near = t.nearestPersonM;
  const details = [
    t.kind === 'animal' && near !== undefined ? `${fmtM(near)} m to a person` : undefined,
    t.distanceToShoreM !== undefined ? `${formatDistance(t.distanceToShoreM)} to shore` : undefined,
    t.speedMps !== undefined && t.headingDeg !== undefined ? `${t.speedMps.toFixed(1)} m/s ${compass(t.headingDeg)}` : undefined,
    t.inSwimZone ? 'in swim zone' : undefined,
  ].filter(Boolean);
  const close = t.kind === 'animal' && t.verdict === 'shark' && near !== undefined && near < 5;

  return (
    <li className={`border-b border-rule ${selected ? 'bg-sheet' : ''}`}>
      <button
        type="button"
        onClick={onSelect}
        className={`relative w-full px-5 py-2 text-left hover:bg-sheet ${departed && !selected ? 'text-ink-2 opacity-75' : ''} ${selected ? 'before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-ink' : ''}`}
      >
        <div className="flex items-center gap-2.5">
          <Marker t={t} />
          <span className="w-8 shrink-0 font-mono text-[11px] text-ink-3">{t.id}</span>
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-[560]">{title(t)}</span>
          {v && t.kind === 'animal' && <span className="num shrink-0 font-mono text-[11px] text-ink-3">{Math.round(v.confidence * 100)}%</span>}
          {lengthText(t) && <span className="num shrink-0 whitespace-nowrap text-right font-mono text-[13px]">{lengthText(t)}</span>}
        </div>
        {details.length > 0 && (
          <div className={`num mt-0.5 pl-[50px] font-mono text-[11px] ${close ? 'font-[600] text-ink' : 'text-ink-2'}`}>{details.join(' · ')}</div>
        )}
      </button>
      {selected && (
        <div className="px-5 pb-3 pl-[70px] text-[12.5px]">
          {t.evidence && sessionId && (
            <img src={api.evidenceUrl(sessionId, t.evidence)} alt="Evidence frame with this contact outlined" className="mb-2 aspect-video w-full border border-rule object-cover" loading="lazy" />
          )}
          {t.length && (
            <p className="num text-ink-2">
              {t.length.reliable === false
                ? t.length.unreliableReason === 'unstable'
                  ? 'Outline changes size between frames: length not trusted.'
                  : `Outline covers ${v?.bodies_in_outline ?? 'several'} animals: length not trusted.`
                : `Length ${fmtM(t.length.meters)} m, likely ${fmtM(t.length.low)}–${fmtM(t.length.high)} m.`}
            </p>
          )}
          {t.verdict === 'shark' && v?.species_guess && !speciesPhrase(v) && (
            <p className="text-ink-2">Species unclear. Muse Spark's low-confidence guess: {v.species_guess.toLowerCase()}.</p>
          )}
          {v?.behavior && <p className="place mt-1 text-[14px] text-ink">“{v.behavior}”</p>}
        </div>
      )}
    </li>
  );
}

export function TrackPanel({
  tracks,
  departed,
  sessionId,
  selectedId,
  onSelect,
  showLost,
  onShowLost,
}: {
  /** Contacts in view now. */
  tracks: TrackSummary[];
  /** Contacts that left the frame, kept on the record. */
  departed: TrackSummary[];
  sessionId?: string;
  selectedId?: string;
  onSelect: (id: string | undefined) => void;
  showLost: boolean;
  onShowLost: (v: boolean) => void;
}) {
  // The header counts the whole patrol, so it doesn't drop to zero when sharks swim out of view.
  const sharks = [...tracks, ...departed].filter((t) => t.verdict === 'shark');
  const nearest = Math.min(...sharks.map((t) => t.nearestPersonM ?? Infinity));
  // Nothing in view (the patrol ended, or the sharks swam off): show the record, not an empty list.
  const forced = tracks.length === 0 || departed.some((t) => t.id === selectedId);
  const openDeparted = departed.length > 0 && (showLost || forced);
  const row = (t: TrackSummary, isDeparted = false) => (
    <Row key={t.id} track={t} sessionId={sessionId} selected={t.id === selectedId} departed={isDeparted} onSelect={() => onSelect(t.id === selectedId ? undefined : t.id)} />
  );
  return (
    <section className="flex min-h-0 flex-col">
      <header className="flex items-baseline justify-between gap-3 border-b border-rule px-5 pb-2 pt-3">
        <h2 className="label">Contacts</h2>
        <span className="num font-mono text-[11px] text-ink-2">
          {sharks.length} shark{sharks.length === 1 ? '' : 's'} seen
          {Number.isFinite(nearest) && <> · closest {fmtM(nearest)} m to a person</>}
        </span>
      </header>
      <ul className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
        {tracks.length === 0 && departed.length === 0 && <li className="px-5 py-6 text-[13px] text-ink-3">No contacts yet.</li>}
        {tracks.map((t) => row(t))}
        {departed.length > 0 && (
          <li className="border-b border-rule bg-paper-2/60">
            <button
              type="button"
              disabled={forced}
              onClick={() => onShowLost(!showLost)}
              className="flex w-full items-baseline justify-between px-5 py-1.5 text-left text-[12px] text-ink-2 enabled:hover:text-ink"
              aria-expanded={openDeparted}
            >
              <span>
                Left the frame <span className="num font-mono text-ink-3">· {departed.length}</span>
              </span>
              {!forced && <span className="text-ink-3">{openDeparted ? 'Hide' : 'Show'}</span>}
            </button>
          </li>
        )}
        {openDeparted && departed.map((t) => row(t, true))}
      </ul>
    </section>
  );
}
