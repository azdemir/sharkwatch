import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { ClipInfo, HealthInfo, RecordingInfo } from '../shared/api.ts';
import { DroneFeed } from './components/DroneFeed.tsx';
import { EventLog } from './components/EventLog.tsx';
const MapPanel = dynamic(() => import('./components/MapPanel.tsx').then((m) => m.MapPanel), { ssr: false });
import { StatusPanel } from './components/StatusPanel.tsx';
import { Timeline } from './components/Timeline.tsx';
import { TrackPanel } from './components/TrackPanel.tsx';
import { api } from './lib/api.ts';
import { departedTracks, visibleTracks } from './lib/sessionState.ts';
import { useSession } from './lib/useSession.ts';

type Mode = 'replay' | 'live';

export function App() {
  const [health, setHealth] = useState<HealthInfo>();
  const [clips, setClips] = useState<ClipInfo[]>([]);
  const [recordings, setRecordings] = useState<RecordingInfo[]>([]);
  const [clipId, setClipId] = useState<string>();
  const [mode, setMode] = useState<Mode>('replay');
  const [selectedId, setSelectedId] = useState<string>();
  const [error, setError] = useState<string>();
  const [showLost, setShowLost] = useState(false);
  const { state, connect, reset } = useSession();

  useEffect(() => {
    Promise.all([api.health(), api.clips(), api.recordings()])
      .then(([h, c, r]) => {
        setHealth(h);
        setClips(c);
        setRecordings(r);
        const withRecording = new Set(r.map((x) => x.clipId));
        const preferred = c.find((x) => x.id === 'clip-g-capistrano' && withRecording.has(x.id)) ?? c.find((x) => !x.demo && withRecording.has(x.id)) ?? c[0];
        setClipId(preferred?.id);
        if (!withRecording.size && h.live) setMode('live');
      })
      .catch((e: Error) => setError(`Can't reach the SharkWatch server: ${e.message}`));
  }, []);

  const clip = clips.find((c) => c.id === clipId);
  const hasRecording = recordings.some((r) => r.clipId === clipId);
  const running = state.status === 'connecting' || state.status === 'running';
  const canStart = Boolean(clip) && (mode === 'replay' ? hasRecording : Boolean(health?.live));
  const tracks = useMemo(() => visibleTracks(state), [state]);
  const departed = useMemo(() => departedTracks(state), [state]);

  async function start() {
    if (!clip) return;
    setError(undefined);
    setSelectedId(undefined);
    try {
      let passcode: string | undefined;
      if (mode === 'live' && health?.livePasscodeRequired) {
        passcode = window.prompt('Live mode uses paid Meta API calls. Enter the passcode:') ?? undefined;
        if (!passcode) return;
      }
      const started = await api.start({ mode, clipId: clip.id, passcode });
      connect(started.sessionId);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function stop() {
    if (state.sessionId) await api.stop(state.sessionId).catch(() => {});
  }

  function chooseClip(id: string) {
    reset();
    setSelectedId(undefined);
    setClipId(id);
  }

  const beach = clip?.scene?.beachName.replace(/ \(simulated patrol\)$/, '');
  const card = 'overflow-hidden rounded-none border border-rule bg-paper-2 shadow-[0_1px_3px_rgba(15,23,42,0.08)]';

  return (
    <div className="min-h-screen w-full overflow-x-hidden">
      {/* Full-bleed nav bar, not a black card inside the page. */}
      <header className="w-full bg-[#05080c]">
        <div className="mx-auto flex w-full max-w-[1680px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6 lg:px-8">
          <a href="/" aria-label="Back to SharkWatch" className="shrink-0">
            <img src="/sharkwatch-logo.svg" alt="SharkWatch" width="148" style={{ display: 'block', height: 'auto' }} />
          </a>
          <span className="num ml-auto shrink-0 font-mono text-[12px] text-[#b8c4cc]" title="Meta Model API cost for this session">
            API ${state.costUsd.toFixed(3)}
          </span>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-5 px-4 pb-8 pt-5 sm:px-6 lg:px-8">
        {/* Control bar: beach left, controls right, wrapping cleanly. */}
        <section className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-4 rounded-none border border-rule bg-paper-2 px-5 py-4 shadow-[0_1px_3px_rgba(15,23,42,0.08)]">
          <div className="min-w-[220px] flex-1">
            <h1 className="place truncate text-[22px] leading-tight">{beach ?? 'Choose footage to patrol'}</h1>
            <p className="mt-0.5 truncate text-[13px] text-ink-3">
              {clip ? clip.title : 'Patrol footage'}
              {clip?.scene ? (clip.scene.burnedInHud ? ' · real position from the camera' : ' · simulated patrol') : ''}
            </p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <select
              value={clipId ?? ''}
              onChange={(e) => chooseClip(e.target.value)}
              disabled={running}
              className="h-11 min-w-[220px] max-w-full flex-1 appearance-none rounded-none border border-rule-strong bg-sheet bg-[length:10px] bg-[right_14px_center] bg-no-repeat pl-4 pr-10 text-[13px] hover:border-ink disabled:opacity-60 sm:flex-none sm:basis-[280px]"
              style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%230f172a' stroke-width='1.4'/%3E%3C/svg%3E\")" }}
              aria-label="Patrol footage"
            >
              {[false, true].map((demo) => {
                const group = clips.filter((c) => c.demo === demo);
                return group.length ? (
                  <optgroup key={String(demo)} label={demo ? 'Demo only (staged scene)' : 'Patrol footage'}>
                    {group.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                        {recordings.some((r) => r.clipId === c.id) ? '' : ' (no recording)'}
                      </option>
                    ))}
                  </optgroup>
                ) : null;
              })}
            </select>
            <div className="flex h-11 shrink-0 rounded-none border border-rule bg-sheet p-1" role="radiogroup" aria-label="Mode">
              {(['replay', 'live'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  disabled={running || (m === 'live' && !health?.live)}
                  title={m === 'live' && !health?.live ? 'Live mode needs a Meta key: run "npm run setup", then restart' : undefined}
                  onClick={() => setMode(m)}
                  className={`h-9 rounded-none px-4 text-[13px] capitalize disabled:cursor-not-allowed ${mode === m ? 'bg-ink font-[650] text-paper' : 'text-ink-2 hover:text-ink disabled:text-ink-3/60'}`}
                >
                  {m}
                </button>
              ))}
            </div>
            {running ? (
              <button type="button" onClick={stop} className="flex h-11 shrink-0 items-center gap-2 rounded-none border border-rule-strong bg-sheet px-6 text-[13px] font-[650] hover:bg-paper">
                <span className="h-2 w-2 bg-red" />
                Stop patrol
              </button>
            ) : (
              <button
                type="button"
                onClick={start}
                disabled={!canStart}
                title={mode === 'replay' && !hasRecording ? 'No recording for this clip yet' : undefined}
                className="h-11 shrink-0 rounded-none bg-[#ffb454] px-6 text-[13px] font-[700] text-black hover:bg-[#ffc67f] disabled:cursor-not-allowed disabled:bg-rule disabled:text-ink-3"
              >
                {state.status === 'ended' ? 'Run again' : 'Start patrol'}
              </button>
            )}
          </div>
        </section>

        {error && <div className="rounded-none border border-red/40 bg-red/10 px-5 py-3 text-[13px] text-red">{error}</div>}

        {/* Hero row: video left, status + pipeline + map stacked right. */}
        <main className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-12">
          <div className={`${card} bg-monitor lg:col-span-8`}>
            {clip ? <DroneFeed clip={clip} state={state} selectedId={selectedId} /> : <div className="aspect-video h-full bg-monitor" />}
          </div>
          <div className="flex min-w-0 flex-col gap-5 lg:col-span-4">
            <div className={card}>
              <StatusPanel state={state} clip={clip} />
            </div>
            <div className={`${card} p-5`}>
              <h2 className="label">How it works</h2>
              <ol className="mt-3 space-y-3">
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-none bg-sheet font-mono text-[11px] text-ink">1</span>
                  <span><span className="block text-[13px] font-[600]">Detect — SAM 3.1</span><span className="block text-[12px] text-ink-3">Finds animals and people in every drone frame.</span></span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-none bg-sheet font-mono text-[11px] text-ink">2</span>
                  <span><span className="block text-[13px] font-[600]">Verify — Muse Spark</span><span className="block text-[12px] text-ink-3">Confirms it is a shark, measures it, writes the alert.</span></span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-none bg-sheet font-mono text-[11px] text-ink">3</span>
                  <span><span className="block text-[13px] font-[600]">Alert — lifeguards</span><span className="block text-[12px] text-ink-3">Flags, Telegram and CAP go out; acknowledgement is tracked.</span></span>
                </li>
              </ol>
            </div>
            <div className={card}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule px-5 py-3">
                <h2 className="label">Location</h2>
                {clip?.scene && <span className="num font-mono text-[11px] text-ink-3">{Math.abs(clip.scene.center.lat).toFixed(4)}°{clip.scene.center.lat >= 0 ? 'N' : 'S'} {Math.abs(clip.scene.center.lon).toFixed(4)}°{clip.scene.center.lon >= 0 ? 'E' : 'W'}</span>}
              </div>
              <div className="h-80">
                {clip && <MapPanel clip={clip} tracks={tracks} departed={departed} selectedId={selectedId} onSelect={setSelectedId} />}
              </div>
            </div>
          </div>
        </main>

        {/* Timeline: Timeline already renders its own header — no second header here. */}
        <section className={card}>
          {clip && <Timeline state={state} clip={clip} selectedId={selectedId} onSelect={setSelectedId} />}
        </section>

        {/* Contacts and Log: two separate cards with a gap between them. */}
        <section className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2">
          <div className={`${card} flex min-h-[22rem] flex-col`}>
            <TrackPanel tracks={tracks} departed={departed} sessionId={state.sessionId} selectedId={selectedId} onSelect={setSelectedId} showLost={showLost} onShowLost={setShowLost} />
          </div>
          <div className={`${card} min-h-[22rem]`}>
            <EventLog entries={state.log} />
          </div>
        </section>

        <footer className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-rule pt-4 text-[12px] text-ink-3">
          <span>
            {clip?.source.author && (
              <>Footage: {clip.source.author} via <a className="text-ink underline decoration-rule-strong underline-offset-2 hover:decoration-ink" href={clip.source.url} target="_blank" rel="noreferrer">{sourceSite(clip.source.url)}</a>{clip.source.license && ` (${clip.source.license.split(' (')[0]})`} · </>
            )}
            {clip?.scene?.burnedInHud ? 'Location and telemetry from the camera HUD; authorities are simulated' : 'Locations, drone telemetry and authorities are simulated'} · Detection: Meta SAM 3.1 · Verification: Meta Muse Spark 1.3
          </span>
        </footer>
      </div>
    </div>
  );
}

function sourceSite(url: string | undefined): string {
  const host = url ? new URL(url).hostname : '';
  if (host.endsWith('pexels.com')) return 'Pexels';
  if (host.endsWith('wikimedia.org')) return 'Wikimedia Commons';
  return host || 'source';
}
