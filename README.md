# SHARKWATCH

Next.js (App Router) + TypeScript. Cinematic landing page + integrated demo.

## What works
- **Landing (`/`)** — scroll-zoom camera dive, Great White / Hammerhead / Tiger stages, model section.
- **Demo (`/demo`)** — integrated into this app on one server, Replay only. Five recorded patrols, drone feed, timeline, map, beach status, alerts with Acknowledge / All clear / CAP XML, and Telegram alerts when a bot token is set in `.env`.
- **APIs** — `GET/POST /api/reports`, `POST /api/detect`, demo APIs under `/api/clips`, `/api/recordings`, `/api/sessions`, `/api/alerts`, `/api/health`, `/api/telegram`, and playback under `/media`.

Demo AI note: `lib/detect.ts` is deterministic for demo repeatability.

## Run it locally (on your Mac)
```bash
cd ~/Desktop/sharkwatch
npm install
npm run dev
# open http://localhost:3000
# demo: http://localhost:3000/demo
```

One server only. No separate Vite or demo server.
