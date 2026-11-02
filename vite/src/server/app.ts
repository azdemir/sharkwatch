// HTTP API: clips, recordings, sessions (start + live event stream), and media.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { RECIPIENT_NAMES, type RecipientRole } from '../shared/alerts.ts';
import type { ClipInfo } from '../shared/api.ts';
import { capIdentifier, renderCap } from './alerts/cap.ts';
import { alertHub, telegramChannel } from './alerts/hub.ts';
import { config } from './config.ts';
import { DATA_DIR } from './media/chunks.ts';
import {
  getSession,
  listClips,
  listRecordings,
  LiveUnavailableError,
  startLiveSession,
  startReplaySession,
} from './sessions.ts';

const HEARTBEAT_MS = 15_000;

const WEB_DIR = join(process.cwd(), 'dist', 'web');

/**
 * Server-sent events: no compression or proxy buffering, and a heartbeat so idle connections
 * survive hosting proxies. `attach` subscribes and returns its unsubscribe function.
 */
function openEventStream(request: FastifyRequest, reply: FastifyReply, attach: (send: (data: string, id?: number) => void) => () => void): void {
  reply.hijack();
  const res = reply.raw;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': connected\n\n');
  const unsubscribe = attach((data, id) => res.write(`${id === undefined ? '' : `id: ${id}\n`}data: ${data}\n\n`));
  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
  request.raw.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // The built web app (npm run build). In development Vite serves it and proxies /api here.
  const hasWeb = existsSync(join(WEB_DIR, 'index.html'));
  if (hasWeb) await app.register(fastifyStatic, { root: WEB_DIR, prefix: '/', wildcard: false });

  // Only playback copies are served; analysis chunks and raw downloads stay private.
  await app.register(fastifyStatic, {
    root: join(DATA_DIR, 'clips'),
    prefix: '/media/clips/',
    decorateReply: false,
    allowedPath: (path) => /^\/?[\w-]+\/playback\.mp4$/.test(path),
  });

  app.get('/api/health', async () => ({
    ok: true,
    live: Boolean(config.modelApiKey),
    livePasscodeRequired: Boolean(config.livePasscode),
    telegram: Boolean(config.telegramBotToken),
  }));

  app.get('/api/clips', async (): Promise<ClipInfo[]> =>
    listClips().map((m) => ({
      id: m.id,
      title: m.title,
      durationS: m.durationS,
      width: m.width,
      height: m.height,
      fps: m.fps,
      playbackFps: m.playbackFps,
      playbackUrl: `/media/clips/${m.id}/playback.mp4`,
      source: { url: m.source.url, author: m.source.author, license: m.source.license },
      scene: m.scene ?? null,
      demo: m.demo === true,
    })),
  );

  app.get('/api/recordings', async () => listRecordings());

  app.post<{ Body: { mode?: 'live' | 'replay'; clipId?: string; recording?: string; passcode?: string; speed?: number } }>(
    '/api/sessions',
    async (request, reply) => {
      const { mode = 'replay', clipId, recording, passcode, speed } = request.body ?? {};
      try {
        if (mode === 'live') {
          if (!clipId) return reply.code(400).send({ error: 'clipId is required' });
          const s = startLiveSession(clipId, passcode);
          return { sessionId: s.id, mode: s.mode, clipId: s.clipId };
        }
        const rec = recording ?? listRecordings().find((r) => r.clipId === clipId)?.id;
        if (!rec) return reply.code(404).send({ error: `no recording for ${clipId ?? 'that clip'}` });
        const s = startReplaySession(rec, speed && speed > 0 && speed <= 8 ? speed : 1);
        return { sessionId: s.id, mode: s.mode, clipId: s.clipId };
      } catch (error) {
        const code = error instanceof LiveUnavailableError ? 403 : 400;
        return reply.code(code).send({ error: (error as Error).message });
      }
    },
  );

  app.get<{ Params: { id: string } }>('/api/sessions/:id/events', (request, reply) => {
    const session = getSession(request.params.id);
    if (!session) return reply.code(404).send({ error: 'unknown session' });
    // Browsers reconnect dropped streams on their own and send the last id they saw; resume after it.
    const lastSeen = Number(request.headers['last-event-id'] ?? -1);
    openEventStream(request, reply, (send) =>
      session.bus.subscribe((event) => {
        if (event.seq > lastSeen) send(JSON.stringify(event), event.seq);
      }),
    );
  });

  app.get<{ Params: { id: string; file: string } }>('/api/sessions/:id/evidence/:file', async (request, reply) => {
    const session = getSession(request.params.id);
    const file = request.params.file;
    if (!session || !/^[\w-]+\.jpg$/.test(file)) return reply.code(404).send({ error: 'not found' });
    const path = join(session.dir, 'evidence', file);
    if (!existsSync(path)) return reply.code(404).send({ error: 'not found' });
    return reply.type('image/jpeg').send(await import('node:fs/promises').then((fs) => fs.readFile(path)));
  });

  app.post<{ Params: { id: string } }>('/api/sessions/:id/stop', async (request, reply) => {
    const session = getSession(request.params.id);
    if (!session) return reply.code(404).send({ error: 'unknown session' });
    session.abort.abort();
    return { stopped: true };
  });

  // Alerts across all sessions, for the authority consoles.
  app.get('/api/alerts', async () => alertHub.list());

  app.get('/api/alerts/stream', (request, reply) => {
    openEventStream(request, reply, (send) => alertHub.subscribe((alert) => send(JSON.stringify(alert))));
  });

  app.post<{ Params: { id: string }; Body: { role?: RecipientRole; by?: string } }>('/api/alerts/:id/ack', async (request, reply) => {
    const { role, by } = request.body ?? {};
    if (!role || !(role in RECIPIENT_NAMES)) return reply.code(400).send({ error: 'role is required' });
    const alert = alertHub.acknowledge(request.params.id, role, (by ?? '').trim().slice(0, 60) || RECIPIENT_NAMES[role]);
    return alert ?? reply.code(404).send({ error: 'unknown alert' });
  });

  app.post<{ Params: { id: string }; Body: { by?: string } }>('/api/alerts/:id/resolve', async (request, reply) => {
    const alert = await alertHub.resolve(request.params.id, (request.body?.by ?? '').trim().slice(0, 60) || 'Operator');
    return alert ?? reply.code(404).send({ error: 'unknown alert' });
  });

  app.get<{ Params: { id: string }; Querystring: { msgType?: string } }>('/api/alerts/:id/cap.xml', async (request, reply) => {
    const alert = alertHub.list().find((a) => a.id === request.params.id);
    if (!alert) return reply.code(404).send({ error: 'unknown alert' });
    const cancel = request.query.msgType === 'Cancel';
    const xml = cancel
      ? renderCap(alert, { msgType: 'Cancel', sent: alert.resolvedAt ?? new Date().toISOString(), references: { id: capIdentifier(alert), sent: alert.createdAt } })
      : renderCap(alert);
    return reply
      .type('application/xml; charset=utf-8')
      .header('Content-Disposition', `inline; filename="${alert.id}${cancel ? '-all-clear' : ''}.cap.xml"`)
      .send(xml);
  });

  app.get('/api/telegram', async () => {
    const tg = telegramChannel();
    if (!tg) return { enabled: false };
    const username = await tg.botUsername().catch(() => undefined);
    return { enabled: true, username, link: username ? `https://t.me/${username}` : undefined, subscribers: tg.subscribers.length };
  });

  // Client-side routes fall back to the app shell; unknown API and media paths stay 404.
  app.setNotFoundHandler((request, reply) => {
    if (hasWeb && request.method === 'GET' && !/^\/(api|media)\//.test(request.url)) {
      return reply.sendFile('index.html', WEB_DIR);
    }
    return reply.code(404).send({ error: 'not found' });
  });

  return app;
}
