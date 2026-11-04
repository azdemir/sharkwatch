# SharkWatch

Drone shark detection and authority alerts. SharkWatch watches the water
from above, understands what is in it, and gets a confirmed alert to
lifeguards in seconds — before an alarm goes out, not after.

**Live:** https://sharkwatch.vercel.app
**Demo:** https://sharkwatch.vercel.app/demo
**Local:** http://localhost:3000 (demo: http://localhost:3000/demo)

Built for the **Meta Global AI Developer Hackathon 2026** See "Meta models" below for
exactly which Meta models this project uses, and which hackathon models
it does not.

## The problem

From shore, a shark is almost invisible: a dark shape under glare, chop,
and kelp, watched by tired human eyes. When someone does spot it, the
warning still has to travel person to person before anyone acts. The gap
SharkWatch closes is warning time — seen, named, and acted on in seconds,
with evidence, instead of minutes later by word of mouth.

SharkWatch does not replace lifeguards, and it does not make the ocean
risk-free. It gives lifeguards a confirmed sighting, with an evidence
photo, faster than eyes alone.

## What we do

### 1. Detect — Meta SAM 3.1

Drone footage is analysed in 6-second chunks at 10 frames per second.
Meta SAM 3.1 segments sharks (and people) in each frame. A track has to
be seen in 8 frames before it counts, so a single flash of kelp, glare,
or a wave does not become an alert.

### 2. Verify — Muse Spark

Muse Spark screens every traced contact: is it a shark, what species,
how long is it, and how close is the nearest person? Dolphins, seals,
rays, and kelp are screened out here, before any alert is sent.

### 3. Alert — in seconds, with evidence

Confirmed sharks trigger alerts to lifeguards with:

- an evidence photo of the detection,
- Acknowledge and All clear actions,
- CAP XML (Common Alerting Protocol) for authority systems,
- escalation after 45 seconds if a critical alert is unacknowledged,
- Telegram broadcast when a bot token is set (see below).

Timeline: sighted ~0 s, confirmed ~2 s, alert sent ~5 s.

### The pages

- **Landing (`/`)** — cinematic scroll: a Meta SAM segmented hero video
  (`public/descent/hero-video.mp4`, yellow SAM outline baked in), with a
  very small segment tag that follows the shark and sits at its
  right-bottom corner, showing type and length
  (`components/descent/SegmentTag.tsx`, position track in
  `lib/sam-segment-track.ts`). The tag is precomputed from the video
  itself, so the landing page makes no model or API call to show it.
  Note: the tag's type and length are visual estimates from the video,
  not measured detection values — the hero video carries no scale or
  species label. Then Great White / Hammerhead / Tiger stages, the
  timeline and modes, and the footer. Every logo (nav and footer, on
every page) links back to `/`.
- **Why SharkWatch (`/why-sharkwatch`)** — why warning time matters,
  with ISAF (Florida Museum of Natural History) bite statistics, and
  what SharkWatch does and does not do.
- **FAQ (`/faq`)** — 8 straightforward questions: what SharkWatch is,
  how it works, drone install, what drone to use, existing footage,
  alert speed, what happens when a shark is found, and trying it
  without a drone.
- **Contact (`/contact`)** — pilot enquiries. The form opens the
  visitor's email client addressed to the contact email on the page;
  there is no backend inbox yet.
- **About (`/about`)** and **Map (`/map`)** — project background and a
  map view.
- **Demo (`/demo`)** — the integrated demo, one server, no separate
  Vite or demo server. See below.

### Demo: Replay and Live

- **Replay (works everywhere, including Vercel)** — plays recorded
  patrols with a drone feed, timeline, map, beach status, alerts,
  Acknowledge / All clear / CAP XML, and Telegram alerts when a bot
  token is set. Replay makes no new Meta API calls — its costs are the
  recorded costs of the original Live runs.
- **Live (local only)** — SAM 3.1 + Muse Spark on a clip, run locally
  with a Meta Model API key (see Environment below). There is no
  upload or YouTube import in the demo UI: Live runs on a clip already
  in the project. On Vercel, Live is hidden and replaced with a plain
  local-only note, because Vercel's filesystem is read-only and it has
  no long-running server for SAM/Spark sessions. `GET /api/health`
  reports `live: false` on Vercel.

Demo agencies in Replay are simulated. No real agency is contacted.

### Telegram and acknowledgement

Telegram is how a confirmed alert reaches a phone, not just the demo
page. The bot is **@SharkDetectionBot** (https://t.me/SharkDetectionBot).

- **Subscribe / unsubscribe:** send `/start` to the bot to subscribe,
  `/stop` to unsubscribe. `GET /api/telegram` reports whether the bot
  is configured, the bot username, and how many subscribers there are.
- **What is sent:** when an alert is raised, it goes to console and to
  Telegram at the same time. The demo shows “On N phones via Telegram”
  when it has been delivered there. A test broadcast can be sent with
  `POST /api/telegram`.
- **How Telegram works, locally vs on Vercel:** locally, the server
  long-polls Telegram in the same process as the demo. On Vercel there
  is no long-running process, so Telegram is handled by a webhook
  (`/api/telegram/webhook`, set up once via
  `/api/telegram/set-webhook`), and acks, subscribers, and All clear
  records are kept in a shared Supabase store
  (`sharkwatch_acks`, `sharkwatch_subscribers`, `sharkwatch_resolved` —
  see `supabase/ack-store.sql`), not in any one instance's memory.
  The demo polls `GET /api/alerts/[id]/ack-status` every 4 seconds, so
  a Telegram ack still shows in the UI even if the instance that raised
  the alert is long gone.

Who acknowledged an alert is shown by name, and the name is never
renamed by SharkWatch:

- **Acknowledged by a Telegram user:** tap Acknowledge in the Telegram
  message. The Telegram button flips to “✅ Acknowledged by {name}”,
  and the demo shows “✓ {name} acknowledged”. The name is the
  Telegram user's full name (first + last, falling back to their
  username). A tap by Aziz shows as Aziz, not as anyone else.
- **Acknowledged by an operator, on the demo page:** click Acknowledge
  in `/demo`. The demo page has no name input, so this is recorded as
  **Operator**, and the demo shows “✓ Operator acknowledged”.
- **All clear:** click All clear in `/demo`. This resolves the alert.
  It is recorded as given by Operator by default. On Vercel, All clear
  uses the same shared store as Acknowledge, so it does not fail with
  “Unknown alert” just because a different instance handles the request
  — unless no shared store is configured at all, in which case that
  error is real.

A Telegram ack counts as the lifeguards recipient acknowledging: it
marks that recipient acknowledged in the demo, and hides the demo
Acknowledge button for that alert. Acknowledgement does not resolve an
alert — All clear is still needed for that.

### Install, honestly

SharkWatch is software that runs on the ground. The drone just records
or streams — no firmware change, no model endorsed, no tested drone
list claimed. What a drone needs is a stable gimbal, 720p or better
video, and an MP4 file or a live feed, plus the local drone rules for
where it flies.

### Cost, honestly

- Replay: $0 in new Meta API calls.
- Live: Meta API cost per patrol only (drone hardware is separate and
  is not sold by SharkWatch). No subscription price is announced;
  pilots go via Contact.
- No accuracy percentage is claimed. Length is approximate, and
  visibility limits apply at night, in murky water, and in bad weather.

### Measured in Replay, not a promise

These numbers come from the recorded runs themselves, not from a live
deployment. Replay makes no new API calls, so its cost is the recorded
cost of the original Live run. There are 5 recorded patrols in Replay.

- **Capistrano Beach, 19.1 s:** 191 frames at 10 fps. Shark first seen
  at frame 34. Muse Spark verification 5,087 ms, at 85% confidence,
  white-shark species guess at low species confidence, evidence length
  about 2.6 m. Recorded cost: $0.005.
- **Screened out, not alerted:** in the same Capistrano run, a person
  track was seen for only 2 frames, then dropped by the 8-frame rule.
  It never became an alert. A flash does not become an alarm. This is
  the demo's negative case — no dolphin or kelp clip is claimed, because
  no such verified recording exists in the golden set.
- **Cost, recorded:** Capistrano $0.005, swimmer clip (clip-b) $0.042.
  That range is for those two runs only, not a price for every beach,
  and not a subscription. Replay itself costs $0 in new calls.
- **What this does not prove:** no lifeguard has piloted SharkWatch on
  a real beach yet, no accuracy percentage is claimed, and Replay
  agencies and locations are simulated.
- **Pilot ask:** one beach, one lifeguard contact, permission to run
  Replay on that beach's own drone footage, then a Telegram alert test.
  No partner is claimed until one says yes.

### Hackathon submission

- **Track:** Indie, Meta Global AI Developer Hackathon 2026.
- **Live site:** https://sharkwatch.vercel.app
- **Demo:** https://sharkwatch.vercel.app/demo (Replay only on Vercel;
  Live is local only — see Demo above).
- **Demo video (3 minutes):** the unlisted YouTube link is in the
  hackathon submission form.
- **Models used at runtime:** SAM 3.1 for segmentation, Muse Spark for
  verification, both via the Meta Model API in Live mode only. Replay
  uses recorded results and makes no new calls.
- **What judges should test first:** open /demo, leave it on the
  default Capistrano clip in Replay, press Start patrol, watch SAM
  tracing, then the Spark card, then the Telegram alert, Acknowledge,
  and All clear. Then read the Screened out note above — that is the
  false-alarm control.

## Tech used

| Layer | What |
| --- | --- |
| App | Next.js 14.2.35 (App Router), React 18.3.1, TypeScript 5.5.4 |
| Styling | Tailwind CSS 4.1.0 (`@tailwindcss/postcss`), plus `app/globals.css` for the landing page and `app/demo/demo.css` for the demo |
| Maps | Leaflet 1.9.4 + react-leaflet 4.2.1 (demo map, coast framing, distance to shore) |
| Meta Model API | OpenAI SDK 4.104.0 — the Meta Model API is OpenAI-compatible, so the same client is used with `baseURL https://api.meta.ai/v1` (see `components/demo/server/meta/client.ts`) |
| Segmentation parsing | `@meta-sam/parser` |
| Video | ffmpeg-static + ffprobe-static (chunking, probing), sharp (evidence crops), qrcode (Telegram QR) |
| Tests | Playwright (`npm run test:e2e`) |
| Hosting | Vercel (https://sharkwatch.vercel.app). One server only — no separate Vite or demo server. |
| Alerts | Telegram Bot API (long-polling locally, webhook on Vercel, see `lib/telegram-server.ts` and `lib/ack-store.ts`), CAP XML |
| Shared store | Supabase (Postgres via PostgREST, tables `sharkwatch_acks`, `sharkwatch_subscribers`, `sharkwatch_resolved` — see `supabase/ack-store.sql`) |
| Meta Muse | Muse Spark (runtime verification) and SAM 3.1 (segmentation) via the Meta Model API; Muse Wonder and Muse Code used during development only — see “Meta models” below |
| Meta SAM 3.1 | Segmentation of sharks and people in drone frames — see `components/demo/server/meta/sam.ts` |
| Muse Spark | Verification of traced contacts: shark or not, species, length, nearest person — see `components/demo/server/meta/spark.ts` |

Project layout (the parts that matter):

```
app/                    pages: /, /demo, /why-sharkwatch, /faq, /contact, /about, /map
app/api/                reports, detect, health, telegram, uploads, demo APIs, media
components/descent/     DiveStage, SegmentTag (landing page)
components/demo/        web (App, DroneFeed, MapPanel, Timeline, TrackPanel, EventLog)
                        shared (api, events, risk, geo)
                        server (sessions, uploads, alerts, meta)
lib/                    descent, sam-segment-track, telegram, telegram-server, types, detect
public/descent/         hero-video.mp4, hero-aerial.jpg, great-white/hammerhead/tiger.jpg
public/                 sharkwatch-logo.svg, favicon.svg
vite/                   retired pre-Next demo, kept for history, not used by the current app
```

## Meta models

### Used by SharkWatch (in code, via the Meta Model API)

| Model | Model ID in code | Role in SharkWatch |
| --- | --- | --- |
| **SAM 3.1** | `sam-3.1` (`components/demo/server/meta/sam.ts`) | Segments sharks and people in drone frames. Also the source of the yellow outline baked into the landing hero video. |
| **Muse Spark** | `muse-spark-1.3` (`components/demo/server/meta/spark.ts`) | Verifies traced contacts: shark or not, species, length, nearest person. Screens out dolphins, seals, rays, and kelp. |

Both are called through the Meta Model API only in Live mode. Replay
uses recorded results and makes no new calls. `lib/detect.ts` is
deterministic for demo repeatability.

### Mentioned for the hackathon, not used at runtime by SharkWatch

The hackathon's model list also names:

- **Muse Wonder** — Meta's frontier model, listed alongside Spark for general reasoning and text. Used during development: most of SharkWatch was built with Muse Wonder assistance.
- **Muse Image** — image generation. Used during development for generating images.
- **Muse Voice Transcribe** — speech-to-text. Not used.
- **Muse Glimmer** — an open-weights model named in the same lists. Not used.
- **Muse Code** — Meta's agentic coding tool, not a model in the app, but part of the hackathon tooling. Used during development.

Development use is not runtime use: Wonder, Image, and Muse Code
helped build SharkWatch, but none of them runs in the app itself.
Claiming runtime use would be wrong: the app's AI is SAM 3.1 for
segmentation and Muse Spark for verification, and nothing else at
runtime.

## APIs

- `GET/POST /api/reports` — reports (new reports broadcast to Telegram when configured)
- `POST /api/detect` — detection endpoint
- `GET /api/health` — health, including `live` (false on Vercel, even with a key set) and `uploads` (false on Vercel) and Telegram status
- `GET /api/telegram` — Telegram status (configured, bot username, subscribers); `POST` sends a test broadcast
- Demo APIs: `GET /api/clips`, `GET /api/recordings`, `GET/POST /api/sessions`, `GET /api/sessions/[id]/events` (SSE), `POST /api/sessions/[id]/stop`, `GET /api/sessions/[id]/evidence/[file]`, `GET /api/alerts`, `GET /api/alerts/stream` (SSE), `POST /api/alerts/[id]/ack`, `GET /api/alerts/[id]/ack-status` (acknowledged + resolved, from the shared store), `POST /api/alerts/[id]/resolve`, `GET /api/alerts/[id]/cap.xml`
- `POST /api/uploads` — local only; returns a plain local-only message (501) on Vercel
- `GET /media/[...path]` — playback (playback.mp4 only)

## Run it locally

```bash
git clone https://github.com/azdemir/sharkwatch.git
cd sharkwatch
cp .env.example .env   # then fill in your own keys, never commit .env
npm ci
npm run dev
# open http://localhost:3000
# demo: http://localhost:3000/demo
```

```bash
npm run build   # production build check
npx playwright install chromium   # browsers are not installed by npm ci
npm run test:e2e  # Playwright tests
```

One server only. No separate Vite or demo server.

## Environment

Set these in `.env` (never commit the file). `.env.example` at the repo root lists the same names with blank values only — copy it, do not edit it with real keys:

- `MODEL_API_KEY` (preferred) or `META_KEY` (fallback) — Meta Model API key, for Live detection. Without it, Live is disabled and Replay still works.
- `TELEGRAM_BOT_TOKEN` — for Telegram alerts. Without it, the demo works as before, with no Telegram broadcast. After a bot is set up, send `/start` to the bot to subscribe (bot: @SharkDetectionBot).
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (optional, Vercel) — shared store for acks, subscribers and All clear, so they survive across Vercel instances. Without it, Vercel falls back to KV if configured, otherwise to the in-memory store, and acks can be lost between instances. Run `supabase/ack-store.sql` once to create the tables.

## Deploying / limits

- **Replay works on Vercel** (https://sharkwatch.vercel.app). Live detection is local-only by design: Vercel's filesystem is read-only and it has no long-running server for SAM/Spark sessions. On Vercel, `/api/uploads` returns a plain local-only message instead of failing with a filesystem error, and the demo shows a Replay-only note.
- Demo agencies in Replay are simulated.
- The demo's Telegram QR line and subscriber count depend on the bot token being set on the deployment and on users sending `/start`.
