import type { AlertJson, RecipientRole } from '../../shared/alerts.ts';
import type { ClipInfo, HealthInfo, RecordingInfo, StartedSession } from '../../shared/api.ts';

export interface TelegramInfo {
  enabled: boolean;
  username?: string;
  link?: string;
  subscribers?: number;
}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  return body;
}

export const api = {
  health: () => fetch('/api/health').then((r) => json<HealthInfo>(r)),
  clips: () => fetch('/api/clips').then((r) => json<ClipInfo[]>(r)),
  recordings: () => fetch('/api/recordings').then((r) => json<RecordingInfo[]>(r)),
  start: (body: { mode: 'live' | 'replay'; clipId?: string; recording?: string; passcode?: string; speed?: number }) =>
    fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) =>
      json<StartedSession>(r),
    ),
  stop: (sessionId: string) => fetch(`/api/sessions/${sessionId}/stop`, { method: 'POST' }).then((r) => json<{ stopped: boolean }>(r)),
  eventsUrl: (sessionId: string) => `/api/sessions/${sessionId}/events`,
  alertsStreamUrl: () => '/api/alerts/stream',
  acknowledge: (alertId: string, role: RecipientRole, by: string) =>
    fetch(`/api/alerts/${alertId}/ack`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role, by }) }).then((r) => json<AlertJson>(r)),
  resolve: (alertId: string, by = 'Operator') =>
    fetch(`/api/alerts/${alertId}/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ by }) }).then((r) => json<AlertJson>(r)),
  capUrl: (alertId: string, cancel = false) => `/api/alerts/${alertId}/cap.xml${cancel ? '?msgType=Cancel' : ''}`,
  telegram: () => fetch('/api/telegram').then((r) => json<TelegramInfo>(r)),
  evidenceUrl: (sessionId: string, evidencePath: string) => `/api/sessions/${sessionId}/${evidencePath}`,
};
