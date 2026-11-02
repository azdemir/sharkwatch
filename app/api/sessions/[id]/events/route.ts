import { NextResponse } from 'next/server';
import { getSession } from '@/components/demo/server/sessions';
export const dynamic = 'force-dynamic';
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = getSession(params.id);
  if (!session) return NextResponse.json({ error: 'Unknown session' }, { status: 404 });
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
