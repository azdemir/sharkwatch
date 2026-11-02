// Rewrites recorded sessions with simplified mask outlines (recordings made before the pipeline
// simplified them are ~10× larger). Usage: npm run compact:recordings [-- <session dir>…]
// With no arguments, compacts every curated recording in data/sessions/golden/.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SessionEvent } from '../src/shared/events.ts';
import { simplifyMaskPath } from '../src/shared/maskPath.ts';
import { GOLDEN_DIR } from '../src/server/sessions.ts';

const dirs = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(GOLDEN_DIR).map((d) => join(GOLDEN_DIR, d)).filter((d) => existsSync(join(d, 'events.jsonl')));

for (const dir of dirs) {
  const path = join(dir, 'events.jsonl');
  const before = readFileSync(path, 'utf8');
  const after = before
    .trim()
    .split('\n')
    .map((line) => {
      const event = JSON.parse(line) as SessionEvent;
      if (event.type === 'frames') {
        for (const f of event.frames) for (const o of f.objects) if (o.maskPath) o.maskPath = simplifyMaskPath(o.maskPath);
      }
      return JSON.stringify(event);
    })
    .join('\n');
  writeFileSync(path, `${after}\n`);
  console.log(`${dir}: ${(before.length / 1e6).toFixed(1)} MB → ${(after.length / 1e6).toFixed(1)} MB`);
}
