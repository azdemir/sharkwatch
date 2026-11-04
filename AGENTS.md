# AGENTS.md — SharkWatch

Short notes for humans and agents working in this repo. The README is the
full guide; this file is the quick start and the hard rules.

## Run it

```bash
cp .env.example .env   # then fill in your own keys, never commit .env
npm ci
npm run dev            # http://localhost:3000, demo at /demo
npm run build          # production build check
npm run test:e2e       # Playwright, after `npx playwright install chromium`
```

One server only (Next.js). `vite/` is the retired pre-Next demo, kept for
history, not used by the current app.

## Replay vs Live (do not mix them up)

- **Replay** works everywhere, including Vercel. It replays recorded
  patrols in `data/sessions/golden/` and makes no new Meta API calls.
  Its costs are the recorded costs of the original Live runs.
- **Live** is local only. It needs a Meta Model API key and runs
  SAM 3.1 + Muse Spark on a clip already in the project. On Vercel,
  `GET /api/health` reports `live: false` and uploads return 501.
- Demo agencies in Replay are simulated. No real agency is contacted.
- Never present recorded Replay numbers as live, pilot, or accuracy
  results. There are 5 recorded patrols in Replay.

## Models — Meta only

- Runtime AI is Meta SAM 3.1 (segmentation) + Muse Spark
  (verification), via the Meta Model API, in Live mode only.
- Do not use any non-Meta model, even for generation, in this project.
- Muse Wonder, Muse Image, and Muse Code were used during development
  only, never at runtime.

## Secrets and data — hard rules

- Never commit `.env`. `.env.example` has blank values only.
- Never commit `data/.cache/telegram.json` (subscriber names and chat
  IDs) or any file with a real token or key. `.gitignore` already
  covers `.env` and `data/.cache/` — but a file that is already tracked
  stays tracked, so check `git status` before every push.
- Server-side keys (`SUPABASE_SERVICE_ROLE_KEY`, bot token, Meta key)
  go in a local `.env` on the Mac and in Vercel project Environment
  Variables (Production) on Vercel — never in the repo, never in chat.
- Vercel acks, subscribers, and All clear records live in the shared
  Supabase store (`supabase/ack-store.sql`), not in one instance's
  memory. See the README Tech used table.

## Telegram

- Bot: @SharkDetectionBot. `/start` subscribes, `/stop` unsubscribes.
- A patrol on the public Vercel demo sends a real Telegram message to
  real subscribers, labelled as a simulated exercise. Do not start a
  Vercel patrol casually, and do not start a second one to “retest” a
  failed first click without checking whether the first one already
  sent an alert.
- Names are shown exactly as Telegram sends them. Never rename a
  subscriber or acknowledger.

## Before pushing

- `git status` — `.env` and `data/.cache/telegram.json` must not be
  listed. If they are, stop and untrack them with `git rm --cached`
  (which keeps the local file) — do not delete the local file.
- Use a specific commit message, not “Bug fixes”.
- A push to `main` redeploys Vercel automatically.
