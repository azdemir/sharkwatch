import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import { EventBus } from '@/components/demo/server/events/bus';
import { createStatelessReplayAlertService, getSession, listRecordings, replaySchedule, SESSIONS_DIR } from '@/components/demo/server/sessions';
import type { SessionEvent } from '@/components/demo/shared/events';
export const dynamic = 'force-dynamic';
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = getSession(params.id);
  if (session) {
    const lastSeen = Number(req.headers.get('last-event-id') ?? -1);
    const encoder = new TextEncoder();
    let unsubscribe: (() => void) | undefined;
    const stream = new ReadableStream({
      start(controller) {
        const send = (event: { seq: number }) => { if (event.seq <= lastSeen) return; controller.enqueue(encoder.encode(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`)); };
        unsubscribe = session.bus.subscribe(send);
        const heartbeat = setInterval(() => { try { controller.enqueue(encoder.encode(': heartbeat\n\n')); } catch { clearInterval(heartbeat); } }, 15000);
        req.signal.addEventListener('abort', () => { clearInterval(heartbeat); unsubscribe?.(); });
      },
      cancel() { unsubscribe?.(); },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' } });
  }
  // Stateless Replay fallback / primary path on Vercel (2026-11-04 fix):
  // the in-memory session is missing because POST and SSE landed on
  // different serverless instances. Instead of 404 'Unknown session'
  // (which closed the stream and showed 'Patrol ended with an error'
  // every time), stream the recording from disk on this instance.
  // Session ids are '<clipId>-replay-<ts>', so the clip is derivable
  // from the id alone, and evidence already resolves the same way.
  const clipId = params.id.replace(/-(replay|live)-[0-9a-z]+$/, '');
  if (!clipId || clipId === params.id) return NextResponse.json({ error: 'Unknown session' }, { status: 404 });
  const recording = listRecordings().find((r) => r.clipId === clipId);
  if (!recording) return NextResponse.json({ error: 'Unknown session' }, { status: 404 });
  const dir = join(SESSIONS_DIR, recording.id);
  const eventsPath = join(dir, 'events.jsonl');
  if (!existsSync(eventsPath)) return NextResponse.json({ error: 'Unknown session' }, { status: 404 });
  const recorded = readFileSync(eventsPath, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line) as SessionEvent).filter((e) => e.type !== 'alert.updated');
  const started = recorded[0];
  if (started?.type !== 'session.started') return NextResponse.json({ error: 'Unknown session' }, { status: 404 });
  const lastSeen = Number(req.headers.get('last-event-id') ?? -1);
  const recordedCost = (recorded.find((e) => e.type === 'session.ended') as { costUsd?: number } | undefined)?.costUsd ?? 0;
  const scheduled = replaySchedule(recorded, started.fps);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const bus = new EventBus(params.id);
      // Alert service on this instance only: template draft, no new API
      // calls. Telegram only on the first connection; a reconnect
      // (last-event-id present) must not send a duplicate message.
      createStatelessReplayAlertService(bus, params.id, clipId, dir, lastSeen < 0);
      let aborted = false;
      req.signal.addEventListener('abort', () => { aborted = true; });
      const send = (event: SessionEvent) => { if (event.seq <= lastSeen) return; try { controller.enqueue(encoder.encode(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`)); } catch { aborted = true; } };
      bus.subscribe(send);
      const heartbeat = setInterval(() => { try { controller.enqueue(encoder.encode(': heartbeat\n\n')); } catch { clearInterval(heartbeat); } }, 15000);
      const t0 = performance.now();
      try {
        for (const { event, atS } of scheduled) {
          const due = atS - (performance.now() - t0) / 1000;
          if (due > 0) await new Promise((r) => setTimeout(r, due * 1000));
          if (aborted) break;
          const { sessionId: _sid, seq: _seq, t: _t, ...body } = event;
          if (body.type === 'session.started') bus.emit({ ...body, mode: 'replay' });
          else if (body.type === 'chunk.timing') bus.emit({ ...body, costUsd: recordedCost });
          else bus.emit(body);
          // AlertService emits alert.updated asynchronously (draft is
          // async); give it a tick so the alert follows its track
          // promptly instead of lagging a whole chunk behind.
          await new Promise((r) => setTimeout(r, 0));
        }
      } catch {
        // Client disconnected; ending the stream is fine.
      }
      clearInterval(heartbeat);
      // Do NOT close the controller after session.ended: the client
      // keeps this stream open for acknowledgements, exactly like the
      // in-memory path. Closing it would make EventSource reconnect
      // and restart the patrol from the beginning.
    },
    cancel() {},
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' } });
}
