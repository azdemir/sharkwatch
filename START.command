#!/bin/bash
# SharkWatch — double-click this file on your Mac to start it.
# It installs dependencies once, starts the server, and opens your browser.
# Keep this window open while you browse. Close it (Ctrl+C) to stop.
cd "$(dirname "$0")"
echo "SharkWatch starting…"
if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "Node.js was not found on this Mac."
  echo "Install Node 22 (LTS) from https://nodejs.org, then double-click START.command again."
  read -p "Press Enter to close this window."
  exit 1
fi
echo "Node: $(node -v)  npm: $(npm -v)"
if [ ! -d node_modules ]; then
  echo "First run: installing dependencies (this takes a minute)…"
  npm install || { echo "npm install failed — see the error above."; read -p "Press Enter to close."; exit 1; }
fi
PORT=3000
if curl -s -o /dev/null http://localhost:3000/ 2>/dev/null; then
  echo "Port 3000 is already in use — using 3001 instead."
  PORT=3001
fi
echo "Starting server on http://localhost:$PORT …"
npm run dev -- -p "$PORT" > start.log 2>&1 &
SERVER_PID=$!
for i in $(seq 1 60); do
  if curl -s -o /dev/null "http://localhost:$PORT/" 2>/dev/null; then
    break
  fi
  sleep 1
done
echo "Server is up: http://localhost:$PORT"
if [ "$(uname)" = "Darwin" ] && command -v open >/dev/null 2>&1; then
  open "http://localhost:$PORT"
fi
echo "Keep this window open while you browse. Press Ctrl+C to stop."
wait $SERVER_PID
