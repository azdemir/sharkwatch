# Contributing to SharkWatch

Thanks for looking at SharkWatch. This is a small hackathon project, not
a large open-source program, so keep contributions small, focused, and
honest about what was actually tested.

## Quick start

```bash
cp .env.example .env   # then fill in your own keys, never commit .env
npm ci
npm run dev            # http://localhost:3000, demo at /demo
npm run build          # production build check
npm run test:e2e       # Playwright, after `npx playwright install chromium`
```

See `AGENTS.md` for the short rules (Replay vs Live, Meta-only models,
secret rules, Telegram rules) and the README for the full guide.

## What to work on

Good contributions: a bug fix with a test or a clear reproduction, a
clearer error message, documentation that matches the code, or a
performance fix that does not change measured results.

Please do not:

- Add a non-Meta model. Runtime AI in this project is Meta SAM 3.1 +
  Muse Spark only, via the Meta Model API.
- Present recorded Replay numbers as live, pilot, or accuracy results.
- Commit `.env`, `data/.cache/telegram.json`, or any file with a real
  token, key, or subscriber chat ID. Check `git status` before pushing.
- Claim a lifeguard pilot, partner, or deployment that does not exist.
- Start a patrol on the public Vercel demo casually — it sends a real
  Telegram message to real subscribers.

## Pull requests

- One change per pull request, with a specific title and message
  (not “Bug fixes”).
- Say exactly what you tested: Mac local, Vercel, or both, and whether
  it was Replay or Live.
- If you change the demo UI, include a screenshot or a short recording
  of the before/after state.
- If you change an API, update the README API list in the same pull
  request.
- A push to `main` redeploys Vercel automatically, so do not merge
  anything you have not built (`npm run build`) first.

## Code style

- TypeScript, Next.js App Router, Tailwind for styling.
- Keep the demo's honesty labels intact: Replay is simulated, costs
  are recorded, and no accuracy percentage is claimed.
- Keep names exactly as Telegram sends them. Never rename a subscriber
  or acknowledger in code, tests, or examples.
