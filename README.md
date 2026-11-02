# SharkWatch

Drone shark detection and authority alerts. SharkWatch watches the water
from above, understands what is in it, and gets a confirmed alert to
lifeguards in seconds — before an alarm goes out, not after.

Next.js (App Router) + TypeScript. Cinematic landing page + integrated demo,
one server only.

## How it works

1. **Detect** — Meta SAM 3.1 finds sharks (and people) in drone footage,
   analysed in 6-second chunks at 10 frames per second. A track has to be
   seen in 8 frames before it counts, so a single flash of kelp or glare
   does not become an alert.
2. **Verify** — Muse Spark screens the traced contact: is it a shark, what
   species, how long is it, and how close is the nearest person? Dolphins,
   seals, rays, and kelp are screened out here, before any alert.
3. **Alert** — Confirmed sharks trigger alerts to lifeguards in seconds,
   with an evidence photo, Acknowledge, All clear, and CAP XML. Unacked
   critical alerts escalate after 45 seconds.

Timeline: sighted ~0 s, confirmed ~2 s, alert sent ~5 s.

SharkWatch does not replace lifeguards. It gives them a confirmed sighting,
with evidence, faster than eyes alone.

## What works

- **Landing (`/`)** — scroll-zoom camera dive, Great White / Hammerhead /
  Tiger stages, and the model section.
  - The hero video is a Meta SAM segmented video
    (`public/descent/hero-video.mp4`, yellow SAM outline baked in).
  - A very small segment tag follows the shark and sits at its
    right-bottom corner, showing type and length
    (`components/descent/SegmentTag.tsx`, position track in
    `lib/sam-segment-track.ts`). The tag is precomputed from the video
    itself, so the page makes no model or API call to show it.
- **Why SharkWatch (`/why-sharkwatch`)**, **FAQ (`/faq`)**, **Contact
  (`/contact`)** — what it is, how it installs (software runs on the
  ground, the drone just records or streams — no firmware change), what
  drone it needs, what it costs, and its limits (visibility, night,
  murky water). No subscription price is announced; pilots go via Contact.
- **Demo (`/demo`)** — integrated into this app on one server. Replay
  mode plays recorded patrols with drone feed, timeline, map, beach
  status, alerts, Acknowledge / All clear / CAP XML, and Telegram alerts
  when a bot token is set. Live mode (SAM 3.1 + Muse Spark on new
  footage) needs a Meta Model API key and a local run — see below.
- **APIs** — `GET/POST /api/reports`, `POST /api/detect`,
  `GET /api/health`, `GET /api/telegram`, demo APIs under `/api/clips`,
  `/api/recordings`, `/api/sessions`, `/api/alerts`, uploads under
  `/api/uploads`, and playback under `/media`.

Demo AI note: `lib/detect.ts` is deterministic for demo repeatability.
Replay makes no new Meta API calls — its costs are the recorded costs of
the original Live runs.

## Run it locally (on your Mac)

```bash
cd ~/Desktop/sharkwatch
npm install
npm run dev
# open http://localhost:3000
# demo: http://localhost:3000/demo
```

```bash
npm run build   # production build check
npm run test:e2e  # Playwright tests
```

One server only. No separate Vite or demo server.

## Environment

Set these in `.env` (never commit the file):

- `MODEL_API_KEY` (preferred) or `META_KEY` (fallback) — Meta Model API
  key, for Live detection. Without it, Live is disabled and Replay still
  works.
- `TELEGRAM_BOT_TOKEN` — for Telegram alerts. Without it, the demo works
  as before, with no Telegram broadcast. After a bot is set up, send
  `/start` to the bot to subscribe.

## Deploying / limits

- **Replay works on Vercel.** Uploads and Live detection are local-only
  by design: Vercel's filesystem is read-only, and it has no yt-dlp and
  no long-running server for SAM/Spark sessions. On Vercel,
  `/api/uploads` returns a plain local-only message instead of failing
  with a filesystem error, and the demo shows that note instead of
  Run Live. Check `GET /api/health` — it reports `uploads: false` on
  Vercel, `true` locally.
- Uploads are local-dev only, not Vercel. Demo agencies in Replay are
  simulated.
