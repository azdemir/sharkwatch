import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { ClipInfo, HealthInfo, RecordingInfo } from '../shared/api.ts';
import { assessRisk, speciesPhrase } from '../shared/risk.ts';
import { DroneFeed } from './components/DroneFeed.tsx';
import { EventLog } from './components/EventLog.tsx';
const MapPanel = dynamic(() => import('./components/MapPanel.tsx').then((m) => m.MapPanel), { ssr: false });
import { Timeline } from './components/Timeline.tsx';
import { TrackPanel } from './components/TrackPanel.tsx';
import { api, type TelegramInfo } from './lib/api.ts';
import { departedTracks, visibleTracks } from './lib/sessionState.ts';
import { useSession } from './lib/useSession.ts';

type Mode = 'replay' | 'live';

const fmtM = (m: number) => (m < 10 ? m.toFixed(1) : m.toFixed(0));
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function App() {
  const [health, setHealth] = useState<HealthInfo>();
  const [clips, setClips] = useState<ClipInfo[]>([]);
  const [recordings, setRecordings] = useState<RecordingInfo[]>([]);
  const [clipId, setClipId] = useState<string>();
  const [mode, setMode] = useState<Mode>('replay');
  const [selectedId, setSelectedId] = useState<string>();
  const [error, setError] = useState<string>();
  const [showLost, setShowLost] = useState(false);
  const [telegram, setTelegram] = useState<TelegramInfo>();
  const { state, connect, reset } = useSession();
  /* Uploaded footage: played back in the visitor's own browser only (an
   * object URL — the file is never sent to the server) until the visitor
   * presses Run Live detection, which sends it to /api/uploads and then
   * starts a real Live SAM 3.1 + Muse Spark session over it. The preview
   * itself draws no boxes, species or alerts — that only happens in the
   * hero feed once a Live session is running. */
  const [uploaded, setUploaded] = useState<{ name: string; url: string; source: 'file' | 'url'; file?: File } | null>(null);
  const [uploadClip, setUploadClip] = useState<ClipInfo | null>(null);
  const [uploadBusy, setUploadBusy] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadUrl, setUploadUrl] = useState('');
  const uploadRef = useRef<HTMLInputElement>(null);
  const clearUploaded = () => {
    if (uploaded?.source === 'file') URL.revokeObjectURL(uploaded.url);
    setUploaded(null);
    setUploadClip(null);
    setUploadBusy(null);
  };
  const onUploadFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      setError('Please choose a video file.');
      return;
    }
    clearUploaded();
    setError(undefined);
    setUploaded({ name: file.name, url: URL.createObjectURL(file), source: 'file', file });
    setShowUpload(false);
  };
  const onUploadUrl = () => {
    const url = uploadUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      setError('Paste a direct video link starting with https:// — a watch page will not play.');
      return;
    }
    clearUploaded();
    setError(undefined);
    setUploaded({ name: url, url, source: 'url' });
    setShowUpload(false);
  };

  const runLiveDetection = async () => {
    if (!uploaded || running) return;
    setError(undefined);
    setUploadBusy('Sending your footage to the server…');
    try {
      const sent = uploaded.source === 'file' && uploaded.file ? await api.uploadFile(uploaded.file) : await api.uploadUrl(uploaded.url);
      if (!sent.liveAvailable) {
        setUploadBusy(null);
        setError('Live detection is not available: no Meta key is configured on this server.');
        return;
      }
      setUploadClip(sent.clip);
      setUploadBusy('Starting Live SAM 3.1 analysis…');
      let passcode: string | undefined;
      if (health?.livePasscodeRequired) {
        passcode = window.prompt('Live mode uses paid Meta API calls. Enter the passcode:') ?? undefined;
        if (!passcode) { setUploadBusy(null); return; }
      }
      const started = await api.start({ mode: 'live', uploadId: sent.uploadId, passcode });
      setUploadBusy(null);
      setShowUpload(false);
      clearUploaded();
      setUploadClip(sent.clip);
      reset();
      setSelectedId(undefined);
      connect(started.sessionId);
    } catch (e) {
      setUploadBusy(null);
      setError((e as Error).message);
    }
  };

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
    api.telegram().then(setTelegram).catch(() => setTelegram({ enabled: false }));
  }, []);

  const clip = uploadClip ?? clips.find((c) => c.id === clipId);
  const hasRecording = recordings.some((r) => r.clipId === clipId);
  const running = state.status === 'connecting' || state.status === 'running';
  const canStart = !uploadClip && Boolean(clip) && (mode === 'replay' ? hasRecording : Boolean(health?.live));
  const tracks = useMemo(() => visibleTracks(state), [state]);
  const departed = useMemo(() => departedTracks(state), [state]);
  const allTracks = [...tracks, ...departed];
  const detection = (selectedId ? allTracks.find((t) => t.id === selectedId) : undefined) ?? allTracks.find((t) => t.verdict === 'shark') ?? allTracks.find((t) => t.kind === 'animal');
  const alerts = [...state.alerts.values()].reverse();
  const currentAlert = alerts.find((a) => a.status !== 'resolved') ?? alerts[0];

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
    setUploadClip(null);
    setClipId(id);
  }

  const card = 'overflow-hidden rounded-none border border-rule bg-paper-2';
  const statusText = state.status === 'running' ? 'Patrolling — SAM 3.1 tracking, Muse Spark verifying' : state.status === 'ended' ? (state.endReason === 'stopped' ? 'Patrol stopped by the operator' : state.endReason === 'error' || state.endReason === 'budget' ? 'Patrol ended with an error' : 'Patrol complete') : state.status === 'error' ? 'Patrol ended with an error' : state.status === 'connecting' ? 'Connecting…' : 'Standing by — press Start patrol';
  const detectionTitle = detection ? (detection.kind === 'person' ? 'Person' : detection.verdict === 'shark' ? capitalise(speciesPhrase(detection.verification) ?? 'shark') : detection.verdict === 'not_shark' ? capitalise((detection.verification?.label ?? 'not a shark').replace(/_/g, ' ')) : detection.verdict === 'uncertain' ? 'Needs a human look' : detection.verdict === 'verifying' ? 'Checking with Muse Spark' : 'Candidate') : 'No detection yet';
  const risk = detection ? assessRisk(detection)?.level : undefined;
  const framesSeen = state.horizonFrame >= 0 ? state.horizonFrame + 1 : 0;
  const frameCount = state.started?.frameCount ?? (clip ? Math.round(clip.durationS * clip.fps) : 0);

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[#04090f] text-[#eef4f6]">
      {/* Design 3 top bar, without the place tabs: logo, Replay note, API cost — nothing else. */}
      <header className="sticky top-0 z-20 w-full border-b border-rule bg-[#04090f]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1560px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6 lg:px-7">
          <a href="/" aria-label="Back to SharkWatch" className="shrink-0">
            <img src="/sharkwatch-logo.svg" alt="SharkWatch" width="148" style={{ display: 'block', height: 'auto' }} />
          </a>
          <span className="num ml-auto flex shrink-0 flex-wrap items-center gap-4 font-mono text-[12px] text-ink-2">
            <span>{mode === 'live' ? 'LIVE · PAID META CALLS' : 'REPLAY · NO NEW API CALLS'}</span>
            <span title="Meta Model API cost for this session">API ${state.costUsd.toFixed(3)}</span>
          </span>
          <button type="button" className="upload-btn" onClick={() => setShowUpload((v) => !v)}>
            Upload video
          </button>
          <input
            ref={uploadRef}
            type="file"
            accept="video/*"
            className="hidden"
            aria-label="Upload your own video"
            onChange={(e) => {
              onUploadFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1560px] flex-col gap-5 px-4 pb-8 pt-7 sm:px-6 lg:px-7">
        {showUpload && (
          <section className={`${card} px-5 py-5`}>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="label">Upload a video — file or link</h2>
              <button
                type="button"
                className="text-[12px] font-[700] uppercase tracking-[0.08em] text-ink-2 underline"
                onClick={() => setShowUpload(false)}
              >
                Cancel
              </button>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" className="alert-btn light" onClick={() => uploadRef.current?.click()}>
                Choose a file
              </button>
              <span className="text-[13px] text-ink-3">or paste a direct video link:</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              <input
                type="url"
                value={uploadUrl}
                onChange={(e) => setUploadUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onUploadUrl();
                }}
                placeholder="https://example.com/drone-footage.mp4"
                className="min-w-[240px] flex-1 border border-rule-strong bg-sheet px-3 py-3 text-[13px] text-ink placeholder:text-ink-3"
                aria-label="Direct video link"
              />
              <button type="button" className="alert-btn green" onClick={onUploadUrl}>
                Use this link
              </button>
            </div>
            <p className="mt-3 text-[12px] leading-[1.6] text-ink-3">
              Paste a direct video link (for example an .mp4 link), or a YouTube link copied from
              YouTube — YouTube links are downloaded with yt-dlp on this Mac, so yt-dlp must be
              installed (brew install yt-dlp) or the download will say so plainly. When you run
              Live detection from the preview card, the server downloads that same link and
              analyses it. A YouTube preview will not play in the browser until it is downloaded.
            </p>
          </section>
        )}
        {uploaded && (
          <section className={`${card} px-5 py-5`}>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="label">Your footage — preview only</h2>
              <button
                type="button"
                className="text-[12px] font-[700] uppercase tracking-[0.08em] text-ink-2 underline"
                onClick={clearUploaded}
              >
                Remove
              </button>
            </div>
            <p className="mt-2 break-all text-[13px] leading-[1.6] text-ink-2">
              {uploaded.source === 'file'
                ? `${uploaded.name} — previewing in your browser only; this file has not been sent to the server yet.`
                : `${uploaded.name} — streaming from that link; nothing has been downloaded yet.`}
              {' '}Press Run Live detection below and the server will send this footage to Meta's
              SAM 3.1 + Muse Spark (paid calls) and draw the real boxes in the hero feed.
              Until then this is a preview only — no detection has run on it.
            </p>
            {error && <div className="mt-4 rounded-none border border-red/40 bg-red/10 px-4 py-3 text-[13px] text-red">{error}</div>}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {health?.live ? (
                <button type="button" className="alert-btn green" onClick={runLiveDetection} disabled={Boolean(uploadBusy) || running}>
                  {uploadBusy ? uploadBusy : 'Run Live detection'}
                </button>
              ) : (
                <span className="text-[13px] text-ink-2">Live detection needs a Meta key on this server — add MODEL_API_KEY (or META_KEY) to .env and restart, then come back here.</span>
              )}
              <span className="text-[12px] text-ink-3">LIVE results are labelled LIVE, not simulated. If SAM or Muse Spark fails, the patrol ends with an error — no invented boxes.</span>
            </div>
            <video src={uploaded.url} controls playsInline className="mt-4 aspect-video w-full bg-monitor object-contain" />
          </section>
        )}
        {uploadClip && !uploaded && (
          <section className={`${card} flex flex-wrap items-center gap-3 px-5 py-3`}>
            <span className="label">Showing your footage — LIVE</span>
            <span className="break-all text-[13px] text-ink-2">{uploadClip.title}</span>
            <button type="button" className="ml-auto text-[12px] font-[700] uppercase tracking-[0.08em] text-ink-2 underline" onClick={() => { reset(); setUploadClip(null); }}>Back to patrol footage</button>
          </section>
        )}
        {/* Hero row: smaller video (7 cols, ~860px wide, ~485px tall) with the map
            beside it (5 cols), instead of a full-width video on its own. No headline on
            the video — the place name and 'watched from above' were removed, and the
            map card has no 'Where it is' header or coordinates either. */}
        <section className="grid min-w-0 grid-cols-1 items-stretch gap-5 lg:grid-cols-12">
          <div className="overflow-hidden rounded-none border border-rule bg-monitor lg:col-span-7">
            {clip ? <DroneFeed clip={clip} state={state} selectedId={selectedId} /> : <div className="aspect-video h-full bg-monitor" />}
          </div>
          <div className={`${card} flex flex-col lg:col-span-5`}>
            <div className="min-h-[320px] flex-1">{clip && <MapPanel clip={clip} tracks={tracks} departed={departed} selectedId={selectedId} onSelect={setSelectedId} />}</div>
          </div>
        </section>

        {/* Controls: exactly Design 3's strip — .controls / .seg / .primary in demo.css. */}
        <section className={`${card} controls`}>
          <span className={`status-pill${running ? ' on' : ''}`}><i />{statusText}</span>
          <select value={clipId ?? ''} onChange={(e) => chooseClip(e.target.value)} disabled={running} aria-label="Patrol footage">
            {[false, true].map((demo) => {
              const group = clips.filter((c) => c.demo === demo);
              return group.length ? (
                <optgroup key={String(demo)} label={demo ? 'Demo only (staged scene)' : 'Patrol footage'}>
                  {group.map((c) => (
                    <option key={c.id} value={c.id}>{c.title}{recordings.some((r) => r.clipId === c.id) ? '' : ' (no recording)'}</option>
                  ))}
                </optgroup>
              ) : null;
            })}
          </select>
          <div className="seg" role="radiogroup" aria-label="Mode">
            {(['replay', 'live'] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} disabled={running || (m === 'live' && !health?.live)} title={m === 'live' && !health?.live ? 'Live mode needs a Meta key: add MODEL_API_KEY (or META_KEY) to .env, then restart' : undefined} onClick={() => setMode(m)} className={mode === m ? 'on' : ''}>{m}</button>
            ))}
          </div>
          {running ? (
            <button type="button" onClick={stop} className="primary stop">Stop patrol</button>
          ) : (
            <button type="button" onClick={start} disabled={!canStart} title={uploadClip ? 'Your footage runs from its preview card — press Run Live detection there' : mode === 'replay' && !hasRecording ? 'No recording for this clip yet' : undefined} className="primary">{state.status === 'ended' ? 'Run again' : 'Start patrol'}</button>
          )}
        </section>

        {error && <div className="rounded-none border border-red/40 bg-red/10 px-5 py-3 text-[13px] text-red">{error}</div>}

        {/* Detection + Alerts: the story, and the accountability. */}
        <main className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-12">
          <section className={`${card} px-5 py-5 lg:col-span-7`}>
            <h2 className="label">Latest detection{detection ? ` · ${detection.id}` : ''}</h2>
            <h3 className="mt-2 text-[26px] font-[700] tracking-[-0.02em]">{detectionTitle}{risk ? <span className="text-red"> · {risk.toUpperCase()}</span> : ''}</h3>
            {detection ? (
              <>
                {detection.verification?.behavior && <p className="mt-2 text-[14px] leading-[1.7] text-ink-2">“{detection.verification.behavior}”</p>}
                {detection.verification?.evidence && <p className="mt-2 text-[13px] leading-[1.6] text-ink-2">{detection.verification.evidence.join(' · ')}</p>}
                <div className="mt-5 grid grid-cols-1 items-stretch gap-4 sm:grid-cols-3">
                  <div className="flex flex-col border border-rule bg-sheet p-4"><div className="label">Confidence</div><b className="mt-2 block text-[26px]">{detection.verification ? `${Math.round(detection.verification.confidence * 100)}%` : '—'}</b><div className="mt-auto pt-3"><div className="h-1 bg-rule"><div className="h-full bg-[#7ee7ff]" style={{ width: detection.verification ? `${Math.round(detection.verification.confidence * 100)}%` : '0%' }} /></div></div></div>
                  <div className="flex flex-col border border-rule bg-sheet p-4"><div className="label">Length</div><b className="mt-2 block text-[26px]">{detection.length ? `${fmtM(detection.length.meters)} m` : '—'}</b><div className="mt-auto pt-3 text-[12px] text-ink-3">{detection.length && !detection.length.reliable ? 'Length not fully trusted' : 'From the traced outline'}</div></div>
                  <div className="flex flex-col border border-rule bg-sheet p-4"><div className="label">Nearest person</div><b className="mt-2 block text-[26px]">{detection.nearestPersonM !== undefined ? `${fmtM(detection.nearestPersonM)} m` : '—'}</b><div className="mt-auto pt-3 text-[12px] text-ink-3">{detection.distanceToShoreM !== undefined ? `${fmtM(detection.distanceToShoreM)} m to shore` : ''}{detection.inSwimZone ? ' · in swim zone' : ''}</div></div>
                </div>
                {detection.evidence && state.sessionId && (
                  <div className="mt-5"><div className="label">Evidence</div><img src={api.evidenceUrl(state.sessionId, detection.evidence)} alt={`Evidence for ${detection.id}`} className="mt-3 max-h-[220px] border border-rule object-contain" /></div>
                )}
              </>
            ) : (
              <p className="mt-3 text-[14px] leading-[1.7] text-ink-2">Press Start patrol. When SAM 3.1 finds an animal and Muse Spark confirms it, its species, confidence, length and distance to the nearest person appear here — the numbers a lifeguard actually acts on.</p>
            )}
          </section>

          <section className={`${card} flex flex-col px-5 py-5 lg:col-span-5`}>
            <h2 className="label">Alerts — who was told, who answered</h2>
            {currentAlert ? (
              <div className="mt-4 border border-rule bg-sheet p-4">
                <b className="text-[14px]">{currentAlert.level.toUpperCase()} · {currentAlert.id}</b>
                <p className="mt-1 text-[13px] leading-[1.6] text-ink-2">{currentAlert.summary}</p>
                <ul className="mt-3 space-y-1.5 text-[13px]">
                  {currentAlert.recipients.map((r) => (
                    <li key={r.role} className="flex items-baseline justify-between gap-3"><span>{r.name.replace(' (simulated)', '')} <span className="text-ink-3">· {r.channels.join(' + ')}</span></span><span className="num shrink-0 font-mono text-[12px] text-ink-2">{r.status === 'acknowledged' ? `✓ ${r.acknowledgedBy ?? 'acknowledged'}` : r.status}</span></li>
                  ))}
                </ul>
                {currentAlert.telegramDelivered ? <p className="mt-2 text-[12px] text-ink-3">On {currentAlert.telegramDelivered} phone{currentAlert.telegramDelivered === 1 ? '' : 's'} via Telegram</p> : null}
                {/* All three actions in the Run Again button's style (.alert-btn in
                    demo.css, copied from .controls .primary): same 48px height,
                    same padding and text, so they line up exactly like it. */}
                <div className="alert-actions">
                  {currentAlert.status !== 'resolved' && currentAlert.recipients.length > 0 && (
                    <>
                      <button type="button" onClick={() => void api.acknowledge(currentAlert.id, 'lifeguards', 'Operator').catch(() => {})} className="alert-btn light">Acknowledge</button>
                      <button type="button" onClick={() => void api.resolve(currentAlert.id).catch(() => {})} className="alert-btn green">All clear</button>
                    </>
                  )}
                  <a href={api.capUrl(currentAlert.id)} target="_blank" rel="noreferrer" className="alert-btn outline">CAP XML</a>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-[13px] leading-[1.6] text-ink-2">No alerts yet. When a shark is confirmed, the alert, its recipients and their acknowledgements appear here.</p>
            )}
            {alerts.length > 1 && <p className="mt-3 text-[12px] text-ink-3">{alerts.length} alerts this session, latest first in the log below.</p>}
            {telegram?.enabled && <p className="mt-4 flex flex-wrap items-center gap-2 border-t border-rule pt-3 text-[14px] text-ink-2"><svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#229ED9" /><g transform="translate(3,3) scale(0.75)" fill="none" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13" /><path d="M22 2 15 22 11 13 2 9 22 2" /></g></svg><span>Alerts on Telegram{telegram.username ? ` · @${telegram.username}` : ''} · {telegram.subscribers ?? 0} subscribed{telegram.link ? <> · <a href={telegram.link} target="_blank" rel="noreferrer" className="underline">Join</a></> : null}</span></p>}
            <p className="mt-auto pt-4 text-[13px] leading-[1.7] text-ink-3">Exercise · simulated agencies. No real agency is contacted in Replay. Unacknowledged critical alerts escalate after 45 s.</p>
          </section>
        </main>

        {/* Timeline, full width now that the map has moved up beside the video. */}
        <section className={card}>{clip && <Timeline state={state} clip={clip} selectedId={selectedId} onSelect={setSelectedId} />}</section>

        {/* Contacts + Log: the full record, unchanged from the old demo. */}
        <section className="grid min-w-0 grid-cols-1 items-stretch gap-5 md:grid-cols-2">
          <div className={`${card} flex flex-col`}><TrackPanel tracks={tracks} departed={departed} sessionId={state.sessionId} selectedId={selectedId} onSelect={setSelectedId} showLost={showLost} onShowLost={setShowLost} /></div>
          <div className={`${card} flex flex-col`}><EventLog entries={state.log} /></div>
        </section>

        {/* Telemetry strip: findable, never outranking the shark. */}
        <section className={`${card} grid grid-cols-2 items-stretch gap-4 px-5 py-4 sm:grid-cols-3 lg:grid-cols-6`}>
          <div className="flex flex-col"><div className="label">Frames analysed</div><b className="num mt-auto block pt-1 font-mono text-[15px]">{framesSeen} / {frameCount}</b></div>
          <div className="flex flex-col"><div className="label">Analysis fps</div><b className="num mt-auto block pt-1 font-mono text-[15px]">{clip?.fps ?? '—'}</b></div>
          <div className="flex flex-col"><div className="label">Mode</div><b className="mt-auto block pt-1 font-mono text-[15px] capitalize">{mode}</b></div>
          <div className="flex flex-col"><div className="label">API cost (recorded)</div><b className="num mt-auto block pt-1 font-mono text-[15px]">${state.costUsd.toFixed(3)}</b></div>
          <div className="flex flex-col"><div className="label">Alerts</div><b className="num mt-auto block pt-1 font-mono text-[15px]">{alerts.length}</b></div>
          <div className="flex flex-col"><div className="label">Contacts</div><b className="num mt-auto block pt-1 font-mono text-[15px]">{allTracks.length}</b></div>
        </section>

      </div>

      {/* Proper footer, full width below the content: How it works as three steps
          (moved out of the cramped one-line footer), with source credits and the
          simulated-exercise note on a separate row underneath. */}
      <footer className="w-full border-t border-rule bg-paper-2">
        <div className="mx-auto w-full max-w-[1560px] px-4 py-8 sm:px-6 lg:px-7">
          <h2 className="label">How it works</h2>
          <ol className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-3">
            <li>
              <div className="flex items-baseline gap-3"><span className="num font-mono text-[13px] text-[#7ee7ff]">1</span><b className="text-[15px]">Detect — SAM 3.1</b></div>
              <p className="mt-2 pl-6 text-[13px] leading-[1.6] text-ink-2">SAM 3.1 tracks animals in the drone footage and outlines each contact.</p>
            </li>
            <li>
              <div className="flex items-baseline gap-3"><span className="num font-mono text-[13px] text-[#7ee7ff]">2</span><b className="text-[15px]">Verify — Muse Spark</b></div>
              <p className="mt-2 pl-6 text-[13px] leading-[1.6] text-ink-2">Muse Spark confirms whether it is a shark, its species and the risk to swimmers.</p>
            </li>
            <li>
              <div className="flex items-baseline gap-3"><span className="num font-mono text-[13px] text-[#7ee7ff]">3</span><b className="text-[15px]">Alert — lifeguards</b></div>
              <p className="mt-2 pl-6 text-[13px] leading-[1.6] text-ink-2">Lifeguards get the alert on Telegram and can acknowledge it or send the all-clear.</p>
            </li>
          </ol>
          <div className="mt-8 flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-rule pt-4 text-[12px] text-ink-3">
            <span>{clip?.source.author && <>Footage: {clip.source.author} via <a className="text-ink underline decoration-rule-strong underline-offset-2 hover:decoration-ink" href={clip.source.url} target="_blank" rel="noreferrer">{sourceSite(clip.source.url)}</a>{clip.source.license && ` (${clip.source.license.split(' (')[0]})`} · </>}{clip?.scene?.burnedInHud ? 'Location and telemetry from the camera HUD; authorities are simulated' : 'Locations, drone telemetry and authorities are simulated'}</span>
            <span>Exercise · simulated agencies. No real agency is contacted in Replay.</span>
          </div>
        </div>
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
