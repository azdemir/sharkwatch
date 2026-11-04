# Security Policy

## Reporting a vulnerability

If you find a security issue in SharkWatch, do not open a public issue
with the details. Contact the maintainer via the Contact page
(https://sharkwatch.vercel.app/contact) with a description of the issue,
steps to reproduce it, and the version or commit you tested.

## Secrets — what must never be committed

- `.env` — real Telegram bot token, Meta Model API key, Supabase keys.
  `.env.example` at the repo root has blank values only and is the only
  env file that belongs in the repo.
- `data/.cache/telegram.json` — Telegram subscriber names and chat IDs.
- Any other file containing a token, key, or private chat ID.

`.gitignore` covers `.env` and `data/.cache/`, but a file that is
already tracked stays tracked, so check `git status` before every push.
If a secret is ever committed, do not just delete the file in a new
commit — the old commit still contains it. Revoke and replace the
secret first (see below), then purge it from history.

## If a secret leaks

1. Revoke it at the source, immediately:
   - Telegram: @BotFather — revoke the token and create a new one for
     the same bot (subscribers are kept, because the bot is the same).
   - Meta Model API: delete the old key in Meta's dashboard and create
     a new one.
   - Supabase: rotate the service-role key in the Supabase dashboard.
2. Put only the new values in a local `.env` and in Vercel project
   Environment Variables (Production), then redeploy. Never put them
   back in the repo, and never paste them in chat or in an issue.
3. Purge the leaked file from git history (for example with
   `git filter-repo --path <file> --invert-paths`) and force-push.
   Everyone with a clone must re-clone afterwards, because a purge
   rewrites every commit SHA. A purge alone does not revoke a secret —
   step 1 is what makes the old value useless.

## What this repo does and does not protect

- Telegram subscriber chat IDs are personal data. They are stored in
  the shared Supabase store and in the local `data/.cache/` file only,
  never published in the repo on purpose. `GET /api/telegram` returns
  a subscriber count only, never names.
- The demo's Telegram alerts are labelled as a simulated exercise.
  A patrol on the public Vercel demo sends a real Telegram message to
  real subscribers.
- This project makes no accuracy, safety, or lifeguard-replacement
  claims. See the README “Measured in Replay, not a promise” section.
