// Shared acknowledgement store for serverless deployments.
//
// On a single long-running server (Mac `npm run dev`) the in-memory
// AlertHub is enough: the session, the ack route and the alert stream all
// share one process. On Vercel they do not — each API request can run in
// a different short-lived instance with its own empty hub, so a UI or
// Telegram ack that lands on a different instance than the one that raised
// the alert would otherwise return "Unknown alert" and never reach the UI.
//
// This store bridges that gap with Vercel KV (Upstash Redis REST API, no
// new dependency, plain fetch). It is only active when KV env vars are
// set — Vercel sets KV_REST_API_URL / KV_REST_API_TOKEN automatically
// when a KV database is connected to the project, and UPSTASH_* names
// are accepted as well. When no KV env is present every function returns
// null/false and callers fall back to the in-memory hub exactly as before,
// so Mac local behaviour is unchanged.
//
// Key: sw:ack:<alertId> -> { by, at } (JSON, URL-encoded for the REST API).

export interface SharedAck {
  by: string;
  at: string;
}

function kvConfig(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ''), token };
}

export function ackStoreConfigured(): boolean {
  return kvConfig() !== null;
}

export async function getSharedAck(alertId: string): Promise<SharedAck | null> {
  const kv = kvConfig();
  if (!kv) return null;
  try {
    const res = await fetch(`${kv.url}/get/${encodeURIComponent(`sw:ack:${alertId}`)}`, {
      headers: { Authorization: `Bearer ${kv.token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: string | null };
    if (!json.result) return null;
    const parsed = JSON.parse(json.result) as SharedAck;
    return parsed?.by ? parsed : null;
  } catch {
    return null;
  }
}

// Shared subscribers, for the same Vercel reason as acks, plus one more:
// on Vercel the subscriber file is read-only and per-deploy, so a /start
// processed there can never be saved to the file. Webhook /start saves
// here instead, and broadcast merges this list with the file list
// (deduplicated by chatId), so existing file subscribers like Adam and
// Sema keep getting alerts while new webhook joiners are added without
// a push. When KV is not configured every function below is a no-op
// (null/false) and callers use the file list exactly as before.
//
// Key: sw:subscribers -> TelegramSubscriber[] (JSON).

export interface SharedSubscriber {
  chatId: number;
  name: string;
  joinedAt: string;
  via?: string;
}

export async function getSharedSubscribers(): Promise<SharedSubscriber[] | null> {
  const kv = kvConfig();
  if (!kv) return null;
  try {
    const res = await fetch(`${kv.url}/get/sw%3Asubscribers`, {
      headers: { Authorization: `Bearer ${kv.token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: string | null };
    if (!json.result) return [];
    const parsed = JSON.parse(json.result) as SharedSubscriber[];
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s?.chatId === 'number') : [];
  } catch {
    return null;
  }
}

async function setSharedSubscribers(list: SharedSubscriber[]): Promise<boolean> {
  const kv = kvConfig();
  if (!kv) return false;
  try {
    const res = await fetch(`${kv.url}/set/sw%3Asubscribers/${encodeURIComponent(JSON.stringify(list))}`, {
      headers: { Authorization: `Bearer ${kv.token}` },
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function saveSharedSubscriber(sub: SharedSubscriber): Promise<boolean> {
  const existing = (await getSharedSubscribers()) ?? [];
  const next = existing.some((s) => s.chatId === sub.chatId)
    ? existing.map((s) => (s.chatId === sub.chatId ? sub : s))
    : [...existing, sub];
  return setSharedSubscribers(next);
}

export async function removeSharedSubscriber(chatId: number): Promise<boolean> {
  const existing = await getSharedSubscribers();
  if (!existing) return false;
  return setSharedSubscribers(existing.filter((s) => s.chatId !== chatId));
}

export async function saveSharedAck(alertId: string, by: string): Promise<boolean> {
  const kv = kvConfig();
  if (!kv) return false;
  try {
    const record: SharedAck = { by, at: new Date().toISOString() };
    const res = await fetch(`${kv.url}/set/${encodeURIComponent(`sw:ack:${alertId}`)}/${encodeURIComponent(JSON.stringify(record))}`, {
      headers: { Authorization: `Bearer ${kv.token}` },
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  }
}
