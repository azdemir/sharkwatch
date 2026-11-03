// Shared ack / subscriber store for Vercel.
//
// Why this exists: on Vercel every API request can land on a different
// short-lived instance, each with its own empty in-memory hub. An ack
// recorded in one instance is invisible to the instance serving the UI
// poll, so the UI never shows '{by} acknowledged'. The fix is to keep
// the ack record outside the instances, in a database all of them read.
//
// Store priority (first configured store wins, per process):
//   1. Supabase (Postgres, via its REST / PostgREST API, plain fetch,
//      no new dependency). Tables: sharkwatch_acks, sharkwatch_subscribers,
//      sharkwatch_resolved (All clear, same pattern as acks).
//      See supabase/ack-store.sql — run it once in the Supabase SQL Editor
//      before this store can record anything.
//   2. Vercel KV (Upstash Redis REST) — the original store, kept as a
//      fallback so a KV-only deployment keeps working.
// If neither is configured, every function returns null/false and the
// callers fall back to the in-memory hub (Mac local behaviour, unchanged).
//
// Supabase env vars (server-side only, never commit them):
//   SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY  (preferred — bypasses row-level security)
//   SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY
//     (fallback only — works only if the tables' row-level security
//      allows the anon role, or RLS is off on those tables)
// A .env file on the Mac is local only: it never reaches Vercel and is
// never pushed. Vercel reads only the env vars set in the Vercel
// project settings (the Supabase Marketplace integration sets these
// automatically when it is connected to the project). After changing
// env vars, restart the dev server locally and redeploy on Vercel.

export interface SharedAck {
  by: string;
  at: string;
}

// Resolved state uses the same shape as an ack: who cleared it, and when.
export type SharedResolved = SharedAck;

export interface SharedSubscriber {
  chatId: number;
  name: string;
  joinedAt: string;
  via?: string;
}

// ---------------------------------------------------------------------------
// Supabase (primary)
// ---------------------------------------------------------------------------

interface SupabaseConfig {
  url: string;
  key: string;
}

function supabaseConfig(): SupabaseConfig | null {
  const url = (
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  )?.trim().replace(/\/$/, '');
  // Service role first; anon only as a fallback (see header comment).
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  if (!url || !key) return null;
  return { url, key };
}

function supabaseHeaders(cfg: SupabaseConfig): Record<string, string> {
  return {
    apikey: cfg.key,
    Authorization: `Bearer ${cfg.key}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

async function supabaseGetAck(alertId: string): Promise<SharedAck | null> {
  const cfg = supabaseConfig();
  if (!cfg) return null;
  try {
    const res = await fetch(
      `${cfg.url}/rest/v1/sharkwatch_acks?alert_id=eq.${encodeURIComponent(alertId)}&select=by,at`,
      { headers: supabaseHeaders(cfg), cache: 'no-store' },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ by?: unknown; at?: unknown }>;
    const row = Array.isArray(rows) ? rows[0] : undefined;
    if (!row || typeof row.by !== 'string' || !row.by) return null;
    return {
      by: row.by,
      at: typeof row.at === 'string' && row.at ? row.at : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function supabaseSaveAck(alertId: string, by: string): Promise<boolean> {
  const cfg = supabaseConfig();
  if (!cfg) return false;
  try {
    const res = await fetch(`${cfg.url}/rest/v1/sharkwatch_acks?on_conflict=alert_id`, {
      method: 'POST',
      headers: {
        ...supabaseHeaders(cfg),
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify({
        alert_id: alertId,
        by,
        at: new Date().toISOString(),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function supabaseGetResolved(alertId: string): Promise<SharedResolved | null> {
  const cfg = supabaseConfig();
  if (!cfg) return null;
  try {
    const res = await fetch(
      `${cfg.url}/rest/v1/sharkwatch_resolved?alert_id=eq.${encodeURIComponent(alertId)}&select=by,at`,
      { headers: supabaseHeaders(cfg), cache: 'no-store' },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ by?: unknown; at?: unknown }>;
    const row = Array.isArray(rows) ? rows[0] : undefined;
    if (!row || typeof row.by !== 'string' || !row.by) return null;
    return {
      by: row.by,
      at: typeof row.at === 'string' && row.at ? row.at : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function supabaseSaveResolved(alertId: string, by: string): Promise<boolean> {
  const cfg = supabaseConfig();
  if (!cfg) return false;
  try {
    const res = await fetch(`${cfg.url}/rest/v1/sharkwatch_resolved?on_conflict=alert_id`, {
      method: 'POST',
      headers: {
        ...supabaseHeaders(cfg),
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify({
        alert_id: alertId,
        by,
        at: new Date().toISOString(),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function supabaseGetSubscribers(): Promise<SharedSubscriber[] | null> {
  const cfg = supabaseConfig();
  if (!cfg) return null;
  try {
    const res = await fetch(
      `${cfg.url}/rest/v1/sharkwatch_subscribers?select=chat_id,name,joined_at,via&order=chat_id`,
      { headers: supabaseHeaders(cfg), cache: 'no-store' },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{
      chat_id?: unknown;
      name?: unknown;
      joined_at?: unknown;
      via?: unknown;
    }>;
    if (!Array.isArray(rows)) return null;
    const out: SharedSubscriber[] = [];
    for (const row of rows) {
      if (typeof row.chat_id !== 'number' || typeof row.name !== 'string') continue;
      out.push({
        chatId: row.chat_id,
        name: row.name,
        joinedAt:
          typeof row.joined_at === 'string' && row.joined_at
            ? row.joined_at
            : new Date().toISOString(),
        via: typeof row.via === 'string' ? row.via : undefined,
      });
    }
    return out;
  } catch {
    return null;
  }
}

async function supabaseSaveSubscriber(sub: SharedSubscriber): Promise<boolean> {
  const cfg = supabaseConfig();
  if (!cfg) return false;
  try {
    const res = await fetch(
      `${cfg.url}/rest/v1/sharkwatch_subscribers?on_conflict=chat_id`,
      {
        method: 'POST',
        headers: {
          ...supabaseHeaders(cfg),
          Prefer: 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify({
          chat_id: sub.chatId,
          name: sub.name,
          joined_at: sub.joinedAt,
          via: sub.via ?? null,
        }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

async function supabaseRemoveSubscriber(chatId: number): Promise<boolean> {
  const cfg = supabaseConfig();
  if (!cfg) return false;
  try {
    const res = await fetch(
      `${cfg.url}/rest/v1/sharkwatch_subscribers?chat_id=eq.${chatId}`,
      { method: 'DELETE', headers: supabaseHeaders(cfg) },
    );
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Vercel KV / Upstash (fallback, unchanged behaviour)
// ---------------------------------------------------------------------------

interface KvConfig {
  url: string;
  token: string;
}

function kvConfig(): KvConfig | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

async function kvGet(key: string): Promise<unknown> {
  const cfg = kvConfig();
  if (!cfg) return null;
  try {
    const res = await fetch(`${cfg.url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: unknown };
    return json.result ?? null;
  } catch {
    return null;
  }
}

async function kvSet(key: string, value: unknown): Promise<boolean> {
  const cfg = kvConfig();
  if (!cfg) return false;
  try {
    const res = await fetch(`${cfg.url}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(value),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function kvGetAck(alertId: string): Promise<SharedAck | null> {
  const raw = await kvGet(`sw:ack:${alertId}`);
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as { by?: unknown; at?: unknown };
  if (typeof rec.by !== 'string') return null;
  return {
    by: rec.by,
    at: typeof rec.at === 'string' ? rec.at : new Date().toISOString(),
  };
}

async function kvSaveAck(alertId: string, by: string): Promise<boolean> {
  return kvSet(`sw:ack:${alertId}`, { by, at: new Date().toISOString() });
}

async function kvGetResolved(alertId: string): Promise<SharedResolved | null> {
  const raw = await kvGet(`sw:resolved:${alertId}`);
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as { by?: unknown; at?: unknown };
  if (typeof rec.by !== 'string') return null;
  return {
    by: rec.by,
    at: typeof rec.at === 'string' ? rec.at : new Date().toISOString(),
  };
}

async function kvSaveResolved(alertId: string, by: string): Promise<boolean> {
  return kvSet(`sw:resolved:${alertId}`, { by, at: new Date().toISOString() });
}

async function kvGetSubscribers(): Promise<SharedSubscriber[] | null> {
  const raw = await kvGet('sw:subscribers');
  if (raw == null) return null;
  if (!Array.isArray(raw)) return [];
  return raw as SharedSubscriber[];
}

async function kvSetSubscribers(list: SharedSubscriber[]): Promise<boolean> {
  return kvSet('sw:subscribers', list);
}

// ---------------------------------------------------------------------------
// Public API — unchanged names, so no caller changes are needed.
// Supabase first when configured, otherwise KV, otherwise null/false.
// ---------------------------------------------------------------------------

export function ackStoreConfigured(): boolean {
  return supabaseConfig() !== null || kvConfig() !== null;
}

export function ackStoreKind(): 'supabase' | 'kv' | null {
  if (supabaseConfig() !== null) return 'supabase';
  if (kvConfig() !== null) return 'kv';
  return null;
}

export async function getSharedAck(alertId: string): Promise<SharedAck | null> {
  if (supabaseConfig() !== null) return supabaseGetAck(alertId);
  return kvGetAck(alertId);
}

export async function saveSharedAck(alertId: string, by: string): Promise<boolean> {
  if (supabaseConfig() !== null) return supabaseSaveAck(alertId, by);
  return kvSaveAck(alertId, by);
}

export async function getSharedResolved(alertId: string): Promise<SharedResolved | null> {
  if (supabaseConfig() !== null) return supabaseGetResolved(alertId);
  return kvGetResolved(alertId);
}

export async function saveSharedResolved(alertId: string, by: string): Promise<boolean> {
  if (supabaseConfig() !== null) return supabaseSaveResolved(alertId, by);
  return kvSaveResolved(alertId, by);
}

export async function getSharedSubscribers(): Promise<SharedSubscriber[] | null> {
  if (supabaseConfig() !== null) return supabaseGetSubscribers();
  return kvGetSubscribers();
}

export async function saveSharedSubscriber(sub: SharedSubscriber): Promise<boolean> {
  if (supabaseConfig() !== null) return supabaseSaveSubscriber(sub);
  const existing = (await kvGetSubscribers()) ?? [];
  const next = existing.filter((s) => s.chatId !== sub.chatId);
  next.push(sub);
  return kvSetSubscribers(next);
}

export async function removeSharedSubscriber(chatId: number): Promise<boolean> {
  if (supabaseConfig() !== null) return supabaseRemoveSubscriber(chatId);
  const existing = (await kvGetSubscribers()) ?? [];
  const next = existing.filter((s) => s.chatId !== chatId);
  return kvSetSubscribers(next);
}
