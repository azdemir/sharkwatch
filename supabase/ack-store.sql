-- SharkWatch shared ack / subscriber store — Supabase tables.
--
-- Run ONCE in Supabase Dashboard -> SQL Editor -> New query, then Run.
-- This creates the two tables lib/ack-store.ts reads and writes via
-- Supabase's REST API (PostgREST). No code change is needed after this.
--
-- If your editor only runs one statement at a time, run the first
-- CREATE TABLE on its own, then the second one on its own.
--
-- "by" and "at" are quoted below because they are also SQL words;
-- unquoted, some editors reject them. Quoting does not change the
-- column names the API sees: they are still by and at.
--
-- The server routes use the service role key, which bypasses row-level
-- security, so no policies are required here. If you turn RLS on for
-- these tables later, you must add a policy for service_role, or the
-- server writes will fail silently (the store functions return false).
--
-- Names are stored exactly as Telegram sends them. Nothing in this
-- file or in lib/ack-store.ts renames a subscriber: a tap by Aziz is
-- recorded as Aziz, not as anyone else.

create table if not exists public.sharkwatch_acks (
  alert_id text primary key,
  "by" text not null,
  "at" timestamptz not null default now()
);

create table if not exists public.sharkwatch_subscribers (
  chat_id bigint primary key,
  name text not null,
  joined_at timestamptz not null default now(),
  via text
);
