# SHARKWATCH — MVP

Next.js (App Router) + TypeScript. Cinematic landing page + a working shark-detection and reporting product.

## What works end-to-end
- **Landing (`/`)** — infinite ocean, scroll-zoom camera dive, gigantic floating Great White / Hammerhead / Tiger, live-feed viewfinder. Now wired to the real API: the landing report form POSTs to `/api/reports`.
- **Detect (`/detect`)** — upload drone video or a still, or try a sample. Demo AI in `lib/detect.ts` returns species, confidence, bounding box, size, direction and a recommended action. “Alert authorities from this detection” saves it as a report.
- **Report (`/report`)** — species, beach, exact location, size, distance to swimmers, notes → POST `/api/reports` → reference like `SW-4821-2026`.
- **Alerts (`/alerts`)** — live list from the API, beach status (OPEN / WARNING / CLOSED), schematic map pins, filter by status.
- **Authority dashboard (`/dashboard`)** — totals, verify / dispatch / clear / false-alarm (PATCH `/api/reports/[id]`), and a broadcast log.
- **APIs** — `GET/POST /api/reports`, `PATCH /api/reports/[id]`, `POST /api/detect`. Reports persist to `data/reports.json` (seeded with 4 examples, git-ignored).

Demo AI note: `lib/detect.ts` is deterministic for demo repeatability. Swap it for a trained vision model in production; pages and APIs already use its `Detection` shape.

## Run it locally (on your Mac)
```bash
cd sharkwatch
npm install
npm run dev
# open http://localhost:3000
```

## 2-minute demo script
1. Open `/` and scroll — ocean deepens, sharks float past.
2. Go to `/detect` → “Try sample: Great White” → watch the box + result → “Alert authorities from this detection”.
3. Go to `/alerts` — your new alert is at the top, beach status flips to WARNING/CLOSED.
4. Go to `/dashboard` → “Dispatch lifeguards” on that report → back to `/alerts`, status is now DISPATCHED.
5. Go to `/report` and file a public sighting — it appears in Alerts and Dashboard too.

## Production build
```bash
npm run build
npm start
# open http://localhost:3000
```
