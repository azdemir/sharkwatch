import { startTelegram } from './alerts/hub.ts';
import { buildApp } from './app.ts';
import { config } from './config.ts';

// `--port` wins over PORT so the dev API keeps its own port when a launcher sets PORT for the
// web dev server; hosting platforms set PORT for `npm start`.
const flag = process.argv.indexOf('--port');
const port = flag >= 0 ? Number(process.argv[flag + 1]) : config.port;

// Telegram polling belongs to the running server only (never to tests building the app).
const telegram = startTelegram();
const app = await buildApp();
try {
  await app.listen({ port, host: '0.0.0.0' });
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error;
  // Most often a copy of SharkWatch still running in another terminal.
  console.error(
    `\nPort ${port} is already in use, probably by another copy of SharkWatch that is still running.\n` +
      `Stop it (Ctrl+C in its terminal), or find what holds the port: \`lsof -i :${port}\` on macOS/Linux, ` +
      `\`netstat -ano | findstr :${port}\` on Windows.\n`,
  );
  process.exit(1);
}
console.log(
  `SharkWatch server on http://localhost:${port} (${config.modelApiKey ? 'Live + Replay' : 'Replay only: no MODEL_API_KEY'}; Telegram ${telegram ? 'on' : 'off'})`,
);
