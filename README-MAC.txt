SharkWatch — real git repo, develop branch — Mac run

THIS PACKAGE IS DIFFERENT FROM THE EARLIER ZIPS
The earlier zips were file-only exports with no .git folder, so git on your
Mac could not see any branch at all. This one IS a git repo: it contains
.git, and develop is checked out.

CHECK THE BRANCH (in Terminal, inside this folder)
  git branch
  git log --oneline -1
You should see: * develop, plus master, sharkwatch-cinematic-rebuild,
sharkwatch-from-scratch. Current commit: 5f3d03f.

EASIEST RUN
1. Unzip this package into its own folder (not straight onto Desktop).
2. Double-click START.command. It installs dependencies on first run,
   starts the server, and opens http://localhost:3000 in your browser.
3. Keep the Terminal window open while you browse. Ctrl+C stops it.

IF IT DOESN'T OPEN
- "Node was not found": install Node 22 (LTS) from https://nodejs.org,
  then double-click START.command again.
- "Port 3000 is already in use": the script automatically switches to
  http://localhost:3001 — use that address instead.
- Still stuck: open start.log in this folder and send its last lines
  to Muse, plus what node -v prints in Terminal.

MANUAL WAY (same result)
  cd <this folder>
  git checkout develop
  npm install
  npm run dev
  open http://localhost:3000

Pages: / (The Descent)  /detect  /report  /alerts  /dashboard
No GitHub remote is set in this repo — it is local only.
