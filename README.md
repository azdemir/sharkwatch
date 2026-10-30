# SHARKWATCH — Shark Detection Landing Page

Next.js (App Router) + TypeScript. Cinematic, almost no boxes/cards, nearly full-screen scenes.

## What it does
- **Infinite ocean background** — fixed gradient from surface turquoise to deep black, animated light rays, rising bubbles, drifting waves. It deepens as you scroll (`--depth` CSS var driven by scroll progress).
- **Camera zoom on scroll** — every `.scene` scales/fades by distance from viewport centre, so scrolling feels like the camera diving through scenes.
- **Gigantic floating shark types** — Great White, Hammerhead and Tiger, each as a full-screen scene with 17vw type and a huge AI-generated floating image (`public/sharks/*.webp`).
- **Drone footage scene** — simulated live viewfinder with REC HUD, scanline, and a single AI reticle (not a card) at 98.2% confidence.
- **Report to authorities** — full-screen report flow (not a card/modal box): pick species, location, notes, send → get a reference like `SW-4821-2026`.

## Run it
```bash
cd sharkwatch-landing
npm install
npm run dev
# open http://localhost:3000
```

Production build:
```bash
npm run build
npm start
```

## Structure
- `app/layout.tsx` — metadata + shell
- `app/page.tsx` — all scenes, scroll-zoom logic, report flow
- `app/globals.css` — ocean, waves, bubbles, float, viewfinder, giant type
- `public/sharks/` — AI-generated shark images
