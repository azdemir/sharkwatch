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
- **FAQ (`/faq`)** — how it installs to a drone, what drone to use, how
  much it costs, and its limits.
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
- **Live (local only)** — SAM 3.1 + Muse Spark on new footage:
  paste a YouTube link or upload a clip, and the demo runs detection
  on it. Live needs a Meta Model API key and a local run (see
  Environment below). On Vercel, Live is hidden and replaced with a
  plain local-only note, because Vercel's filesystem is read-only,
  it has no yt-dlp, and it has no long-running server for SAM/Spark
  sessions. `GET /api/health` reports `uploads: false` on Vercel and
  `true` locally.

Demo agencies in Replay are simulated. No real agency is contacted.

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

## Tech used

| Layer | What |
| --- | --- |
| App | Next.js 14.2.18 (App Router), React 18.3.1, TypeScript 5.5.4 |
| Styling | Tailwind CSS 4.1.0 (`@tailwindcss/postcss`), plus `app/globals.css` for the landing page and `app/demo/demo.css` for the demo |
| Maps | Leaflet 1.9.4 + react-leaflet 4.2.1 (demo map, coast framing, distance to shore) |
| Meta Model API | OpenAI SDK 4.104.0 — the Meta Model API is OpenAI-compatible, so the same client is used with `baseURL https://api.meta.ai/v1` (see `components/demo/server/meta/client.ts`) |
| Segmentation parsing | `@meta-sam/parser` |
| Video | ffmpeg-static + ffprobe-static (chunking, probing), sharp (evidence crops), qrcode (Telegram QR) |
| Tests | Playwright (`npm run test:e2e`) |
| Hosting | Vercel (https://sharkwatch.vercel.app). One server only — no separate Vite or demo server. |
| Alerts | Telegram Bot API (long-polling, see `lib/telegram-server.ts`), CAP XML |

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

### Mentioned for the hackathon, not used by SharkWatch

The hackathon's model list, as described in hackathon summaries (third-
party guides, not the official Meta rules page — check the official
page before citing this in a submission), also names:

- **Muse Wonder** — Meta's frontier model, listed alongside Spark for general reasoning and text.
- **Muse Image** — image generation.
- **Muse Voice Transcribe** — speech-to-text.
- **Muse Glimmer** — an open-weights model named in the same lists.
- **Meta open-weights models** — the wider open-weights family available through the Model API and partner credits (Baseten, Modal, Fireworks).
- **Muse Code** — Meta's agentic coding tool, not a model in the app, but part of the hackathon tooling.

SharkWatch does not use Wonder, Image, Voice Transcribe, Glimmer, or
Muse Code in the app itself. Claiming otherwise would be wrong: the
app's AI is SAM 3.1 for segmentation and Muse Spark for verification,
and nothing else at runtime.

## APIs

- `GET/POST /api/reports` — reports (new reports broadcast to Telegram when configured)
- `POST /api/detect` — detection endpoint
- `GET /api/health` — health, including `live` (false on Vercel, even with a key set) and `uploads` (false on Vercel) and Telegram status
- `GET /api/telegram` — Telegram status (configured, bot username, subscribers); `POST` sends a test broadcast
- Demo APIs: `GET /api/clips`, `GET /api/recordings`, `GET/POST /api/sessions`, `GET /api/sessions/[id]/events` (SSE), `POST /api/sessions/[id]/stop`, `GET /api/sessions/[id]/evidence/[file]`, `GET /api/alerts`, `GET /api/alerts/stream` (SSE), `POST /api/alerts/[id]/ack`, `POST /api/alerts/[id]/resolve`, `GET /api/alerts/[id]/cap.xml`
- `POST /api/uploads` — local only; returns a plain local-only message (501) on Vercel
- `GET /media/[...path]` — playback (playback.mp4 only)

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

- `MODEL_API_KEY` (preferred) or `META_KEY` (fallback) — Meta Model API key, for Live detection. Without it, Live is disabled and Replay still works.
- `TELEGRAM_BOT_TOKEN` — for Telegram alerts. Without it, the demo works as before, with no Telegram broadcast. After a bot is set up, send `/start` to the bot to subscribe (bot: @SharkDetectionBot).

## Deploying / limits

- **Replay works on Vercel** (https://sharkwatch.vercel.app). Uploads and Live detection are local-only by design: Vercel's filesystem is read-only, and it has no yt-dlp and no long-running server for SAM/Spark sessions. On Vercel, `/api/uploads` returns a plain local-only message instead of failing with a filesystem error, and the demo shows that note instead of Run Live.
- Uploads are local-dev only, not Vercel. Demo agencies in Replay are simulated.
- The demo's Telegram QR line and subscriber count depend on the bot token being set on the deployment and on users sending `/start`.
