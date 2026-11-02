import { alertHub } from '@/components/demo/server/alerts/hub';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  const stream = new ReadableStream({
    start(controller) {
      unsubscribe = alertHub.subscribe((alert) => { controller.enqueue(encoder.encode(`data: ${JSON.stringify(alert)}\n\n`)); });
      const heartbeat = setInterval(() => { try { controller.enqueue(encoder.encode(': heartbeat\n\n')); } catch { clearInterval(heartbeat); } }, 15000);
      req.signal.addEventListener('abort', () => { clearInterval(heartbeat); unsubscribe?.(); });
    },
    cancel() { unsubscribe?.(); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' } });
}
