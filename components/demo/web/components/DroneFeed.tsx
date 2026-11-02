// The drone feed: video with detections drawn over it, a telemetry HUD, and a playback gate that
// holds the video just behind the latest analysed frame (the honest "broadcast delay").

import { useEffect, useRef, useState } from 'react';
import type { ClipInfo } from '../../shared/api.ts';
import { CONFIRM_FRAMES } from '../../shared/events.ts';
import { altitudeForGsd } from '../../shared/geo/gsd.ts';
import { drawOverlay } from '../lib/drawOverlay.ts';
import { containRect, objectsAt } from '../lib/overlay.ts';
import { publishPlayhead } from '../lib/playhead.ts';
import type { SessionState } from '../lib/sessionState.ts';

/** Seconds of analysed footage required ahead of the playhead before (re)starting playback. */
const BUFFER_S = 1;

interface Props {
  clip: ClipInfo;
  state: SessionState;
  selectedId?: string;
}

/** People are pixelated by default: a beach drone films bystanders who never agreed to it. */
const PRIVACY_DEFAULT = true;

/** requestVideoFrameCallback gives the exact media time of the frame on screen (Baseline 2024). */
const HAS_FRAME_CALLBACK = typeof HTMLVideoElement !== 'undefined' && 'requestVideoFrameCallback' in HTMLVideoElement.prototype;

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
}

export function DroneFeed({ clip, state, selectedId }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  const selectedRef = useRef(selectedId);
  const mediaTime = useRef(0);
  const sessionStartedAt = useRef<number | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [hud, setHud] = useState({ time: 0, sharks: 0, people: 0, delayS: 0 });
  const [privacy, setPrivacy] = useState(PRIVACY_DEFAULT);
  const privacyRef = useRef(privacy);

  stateRef.current = state;
  selectedRef.current = selectedId;
  privacyRef.current = privacy;

  // A new session (or clip) starts from the top, paused until analysis arrives.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = 0;
    mediaTime.current = 0;
    sessionStartedAt.current = state.status === 'idle' ? null : performance.now();
  }, [state.sessionId, clip.id]);

  // Playback gate.
  useEffect(() => {
    const timer = setInterval(() => {
      const v = videoRef.current;
      const s = stateRef.current;
      if (!v || s.status === 'idle' || s.status === 'connecting') return;
      const ended = s.status === 'ended' || s.status === 'error';
      // Stopped by the operator, out of budget or failed: the patrol is over, so the footage stops too.
      if (s.status === 'error' || (ended && s.endReason !== 'completed')) {
        if (!v.paused) v.pause();
        setWaiting(false);
        return;
      }
      const playhead = v.currentTime * clip.fps;
      // Once the last frame has been analysed nothing more is coming, so play through to the end
      // even while late verdicts are still on their way.
      const lastFrame = (s.started?.frameCount ?? Math.round(clip.durationS * clip.fps)) - 1;
      const ready = ended || s.horizonFrame >= lastFrame ? Infinity : s.horizonFrame;
      if (v.paused && !v.ended) {
        if (ready >= playhead + BUFFER_S * clip.fps) {
          setWaiting(false);
          void v.play().catch(() => {});
        } else {
          setWaiting(!ended);
        }
      } else if (!v.paused && playhead >= ready - 1) {
        v.pause();
        setWaiting(true);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [clip.fps]);

  // Track the exact media time of the frame on screen.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !HAS_FRAME_CALLBACK) return;
    let handle = 0;
    const onFrame: VideoFrameRequestCallback = (_now, meta) => {
      mediaTime.current = meta.mediaTime;
      handle = v.requestVideoFrameCallback(onFrame);
    };
    handle = v.requestVideoFrameCallback(onFrame);
    return () => v.cancelVideoFrameCallback(handle);
  }, [clip.id]);

  // Draw loop.
  useEffect(() => {
    let raf = 0;
    let lastHud = 0;
    const draw = (now: number) => {
      const v = videoRef.current;
      const canvas = canvasRef.current;
      const box = boxRef.current;
      if (v && canvas && box) {
        const dpr = window.devicePixelRatio || 1;
        const w = box.clientWidth;
        const h = box.clientHeight;
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
          canvas.width = Math.round(w * dpr);
          canvas.height = Math.round(h * dpr);
        }
        const t = HAS_FRAME_CALLBACK && !v.paused ? mediaTime.current : v.currentTime;
        const s = stateRef.current;
        // The video's last instant is past the last analysis frame; keep that frame's outlines (and
        // any verdict that lands after the footage ends) on screen.
        const lastFrameT = ((s.started?.frameCount ?? Math.round(clip.durationS * clip.fps)) - 1) / clip.fps;
        const drawn = s.status === 'idle' ? [] : objectsAt(s.frames, Math.min(t, lastFrameT), clip.fps);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          drawOverlay(ctx, {
            dpr,
            rect: containRect(clip.width, clip.height, w, h),
            drawn,
            tracks: s.tracks,
            selectedId: selectedRef.current,
            gsd: clip.scene?.gsd,
            privacy: privacyRef.current && v.readyState >= 2 ? { video: v, width: clip.width, height: clip.height } : undefined,
          });
        }
        if (now - lastHud > 200) {
          lastHud = now;
          const sharks = drawn.filter((d) => d.object.kind === 'animal' && s.tracks.get(d.object.trackId)?.verdict === 'shark').length;
          const people = drawn.filter((d) => d.object.kind === 'person' && (s.tracks.get(d.object.trackId)?.framesSeen ?? 0) >= CONFIRM_FRAMES).length;
          const started = sessionStartedAt.current;
          const delayS = started && s.status !== 'ended' ? Math.max(0, (now - started) / 1000 - t) : 0;
          setHud({ time: t, sharks, people, delayS });
          publishPlayhead(s.status === 'idle' ? 0 : t);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [clip]);

  const scene = clip.scene;
  const altitude = scene ? altitudeForGsd(scene.gsd, Math.max(clip.width, clip.height)) : undefined;
  const live = state.started?.mode === 'live';
  const active = state.status === 'running' || state.status === 'connecting';
  const sep = <span className="text-monitor-dim/60">·</span>;

  return (
    <div className="flex h-full w-full flex-col bg-monitor">
      <div ref={boxRef} className="relative aspect-video w-full overflow-hidden" style={{ minHeight: 420 }}>
        <video
          ref={videoRef}
          src={clip.playbackUrl}
          className="absolute inset-0 h-full w-full object-contain"
          muted
          playsInline
          preload="auto"
        />
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />

        {waiting && (
          <div className="absolute inset-x-0 bottom-6 flex justify-center px-6">
            <div className="w-full max-w-md overflow-hidden rounded-none bg-monitor/90 text-monitor-ink">
              <div className="relative h-[2px] overflow-hidden bg-monitor-2">
                <span className="sweep absolute inset-y-0 w-1/3 bg-[#ff5a1f]" />
              </div>
              <div className="px-4 py-3">
                <div className="text-[13px] font-[620]">
                  {live ? (state.horizonFrame < 0 ? 'Filming the first chunk, then SAM 3.1 analyses it' : 'Waiting for SAM 3.1 on the next chunk') : 'Loading footage'}
                </div>
                {live && (
                  <p className="mt-1 text-[12px] leading-snug text-monitor-dim">
                    Live mode sends each 6-second chunk to Meta's API after the drone films it, so the feed runs{' '}
                    {hud.delayS >= 1 ? `${hud.delayS.toFixed(0)} s` : 'a few seconds'} behind. Replay shows recorded analysis at real-time speed.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Status strip under the footage, so nothing of ours covers the picture or its own HUD. */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-monitor-2 px-4 py-1.5 font-mono text-[11px] text-monitor-ink">
        <span className="flex items-center gap-2">
          <span className={`h-2 w-2 ${active ? 'beacon bg-[#ff3b30]' : 'bg-monitor-dim'}`} />
          <span className="font-sans font-[680] tracking-[0.04em]">{state.status === 'idle' ? 'STANDBY' : live ? 'LIVE' : 'REPLAY'}</span>
          <span className="num">{clock(hud.time)}</span>
          <span className="num text-monitor-dim">/ {clock(clip.durationS)}</span>
        </span>
        <span className="num">
          <span className="text-monitor-dim">in frame </span>
          <span className={hud.sharks ? 'text-[#ff7a45]' : ''}>
            {hud.sharks} shark{hud.sharks === 1 ? '' : 's'}
          </span>
          {sep} {hud.people} {hud.people === 1 ? 'person' : 'people'}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-monitor-dim">
          {scene && !scene.burnedInHud && (
            <span className="num hidden xl:inline" title="Simulated drone telemetry">
              {Math.abs(scene.center.lat).toFixed(5)}°{scene.center.lat >= 0 ? 'N' : 'S'} {Math.abs(scene.center.lon).toFixed(5)}°{scene.center.lon >= 0 ? 'E' : 'W'} {sep} ALT {altitude?.toFixed(0)} m {sep} HDG{' '}
              {String(Math.round(scene.headingDeg)).padStart(3, '0')}° {sep} sim
            </span>
          )}
          {live && state.status === 'running' && <span className="num text-monitor-ink">analysis {hud.delayS.toFixed(0)} s behind</span>}
          {!live && state.status !== 'idle' && <span>recorded analysis</span>}
          <button type="button" onClick={() => setPrivacy((p) => !p)} className="hover:text-monitor-ink" title="Pixelate people inside their outlines">
            privacy blur <span className={privacy ? 'text-monitor-ink' : ''}>{privacy ? 'on' : 'off'}</span>
          </button>
        </span>
      </div>
    </div>
  );
}
