// Meta Files API uploads, cached per machine. Uploaded files belong to the Meta account (team) that
// uploaded them, so file ids are never committed: each checkout uploads with its own key on first use,
// and a cached id that the current key can't see is re-uploaded.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { metaClient, uploadFile } from './client.ts';

const CACHE_PATH = join(process.cwd(), 'data', '.cache', 'meta-files.json');

type Cache = Record<string, { fileId: string; uploadedAt: string }>;

function readCache(): Cache {
  return existsSync(CACHE_PATH) ? (JSON.parse(readFileSync(CACHE_PATH, 'utf8')) as Cache) : {};
}

function writeCache(cache: Cache): void {
  mkdirSync(dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`);
}

export function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Ids confirmed visible to the current key in this process, so each is checked at most once. */
const verified = new Set<string>();

async function visibleToCurrentKey(fileId: string): Promise<boolean> {
  if (verified.has(fileId)) return true;
  try {
    await metaClient().files.retrieve(fileId);
    verified.add(fileId);
    return true;
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 404 || status === 403) return false;
    throw error;
  }
}

/** Returns a Meta file id for the local file, uploading it if this account doesn't have it yet. */
export async function ensureUploaded(path: string): Promise<string> {
  const hash = sha256File(path);
  const cache = readCache();
  const cached = cache[hash];
  if (cached && (await visibleToCurrentKey(cached.fileId))) return cached.fileId;

  const fileId = await uploadFile(path);
  verified.add(fileId);
  writeCache({ ...readCache(), [hash]: { fileId, uploadedAt: new Date().toISOString() } });
  return fileId;
}
