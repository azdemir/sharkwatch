import { useEffect, useMemo, useState } from 'react';
import type { ClipInfo, HealthInfo, RecordingInfo } from '../shared/api.ts';
import { DroneFeed } from './components/DroneFeed.tsx';
import { SharkWatchMark } from './components/Flags.tsx';
import { EventLog } from './components/EventLog.tsx';
import { MapPanel } from './components/MapPanel.tsx';
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
  const control = 'h-8 rounded-[2px] text-[13px]';

  return (
    <div className="flex min-h-full flex-col lg:h-full">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2.5 border-b-[4px] border-double border-ink px-5 py-2.5">
        <div className="flex items-center gap-2">
          <SharkWatchMark />
          <span className="text-[19px] font-[780] tracking-[-0.015em] [font-stretch:86%]">SharkWatch</span>
        </div>

        {clip && (
          <div className="hidden min-w-0 border-l border-rule pl-6 md:block">
            <div className="place truncate text-[19px] leading-[1.1]">{beach ?? clip.title}</div>
            <div className="truncate text-[11px] text-ink-3">
              {clip.title}
              {clip.scene ? (clip.scene.burnedInHud ? ' · real position from the camera' : ' · simulated patrol') : ''}
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
          <select
            value={clipId ?? ''}
            onChange={(e) => chooseClip(e.target.value)}
            disabled={running}
            className={`${control} w-full min-w-0 appearance-none border border-rule-strong bg-sheet bg-[length:10px] bg-[right_10px_center] bg-no-repeat pl-2.5 pr-8 hover:border-ink disabled:opacity-60 lg:w-auto lg:max-w-72`}
            style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%2314212a' stroke-width='1.4'/%3E%3C/svg%3E\")" }}
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

          <div className={`${control} flex overflow-hidden border border-ink`} role="radiogroup" aria-label="Mode">
            {(['replay', 'live'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                disabled={running || (m === 'live' && !health?.live)}
                title={m === 'live' && !health?.live ? 'Live mode needs a Meta key: run "npm run setup", then restart' : undefined}
                onClick={() => setMode(m)}
                className={`px-3 capitalize disabled:cursor-not-allowed ${mode === m ? 'bg-ink font-[640] text-paper' : 'text-ink-2 hover:text-ink disabled:text-ink-3/60'}`}
              >
                {m}
              </button>
            ))}
          </div>

          {running ? (
            <button type="button" onClick={stop} className={`${control} flex items-center gap-2 border border-ink px-4 font-[650] hover:bg-ink hover:text-paper`}>
              <span className="h-2 w-2 bg-red" />
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={start}
              disabled={!canStart}
              title={mode === 'replay' && !hasRecording ? 'No recording for this clip yet' : undefined}
              className={`${control} bg-ink px-4 font-[680] text-paper hover:bg-[#22333e] disabled:cursor-not-allowed disabled:bg-rule disabled:text-ink-3`}
            >
              {state.status === 'ended' ? 'Run again' : 'Start patrol'}
            </button>
          )}

        </div>
      </header>

      {error && <div className="border-b border-red/40 bg-red/10 px-5 py-2 text-[13px] text-red">{error}</div>}

      <main className="grid flex-1 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_400px] lg:grid-rows-[minmax(0,1fr)_auto_10.5rem]">
        <div className="lg:col-start-1 lg:row-start-1 lg:min-h-0">
          {clip ? <DroneFeed clip={clip} state={state} selectedId={selectedId} /> : <div className="aspect-video h-full bg-monitor lg:aspect-auto" />}
        </div>

        <aside className="flex flex-col border-b border-rule lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:min-h-0 lg:border-b-0 lg:border-l">
          <div className="scroll-quiet lg:max-h-[62%] lg:shrink-0 lg:overflow-y-auto">
            <StatusPanel state={state} clip={clip} />
          </div>
          <div className="h-64 border-t border-rule lg:h-auto lg:min-h-[14rem] lg:flex-1">
            {clip && <MapPanel clip={clip} tracks={tracks} departed={departed} selectedId={selectedId} onSelect={setSelectedId} />}
          </div>
        </aside>

        <div className="border-b border-rule lg:col-start-1 lg:row-start-2">
          {clip && <Timeline state={state} clip={clip} selectedId={selectedId} onSelect={setSelectedId} />}
        </div>

        <div className="grid lg:col-start-1 lg:row-start-3 lg:min-h-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="flex max-h-96 min-h-[12rem] flex-col border-b border-rule lg:max-h-none lg:min-h-0 lg:border-b-0 lg:border-r">
            <TrackPanel tracks={tracks} departed={departed} sessionId={state.sessionId} selectedId={selectedId} onSelect={setSelectedId} showLost={showLost} onShowLost={setShowLost} />
          </div>
          <div className="h-56 lg:h-auto lg:min-h-0">
            <EventLog entries={state.log} />
          </div>
        </div>
      </main>

      <footer className="border-t border-rule bg-paper-2 px-5 py-1.5 text-[11px] text-ink-2">
        {clip?.source.author && (
          <>
            Footage: {clip.source.author} via{' '}
            <a className="text-ink underline decoration-rule-strong underline-offset-2 hover:decoration-ink" href={clip.source.url} target="_blank" rel="noreferrer">
              {sourceSite(clip.source.url)}
            </a>
            {clip.source.license && ` (${clip.source.license.split(' (')[0]})`} ·{' '}
          </>
        )}
        {clip?.scene?.burnedInHud ? 'Location and telemetry from the camera HUD; authorities are simulated' : 'Locations, drone telemetry and authorities are simulated'} · Detection:
        Meta SAM 3.1 · Verification: Meta Muse Spark 1.3
        <span className="num float-right font-mono" title="Meta Model API cost for this session">
          API ${state.costUsd.toFixed(3)}
        </span>
      </footer>
    </div>
  );
}

function sourceSite(url: string | undefined): string {
  const host = url ? new URL(url).hostname : '';
  if (host.endsWith('pexels.com')) return 'Pexels';
  if (host.endsWith('wikimedia.org')) return 'Wikimedia Commons';
  return host || 'source';
}
