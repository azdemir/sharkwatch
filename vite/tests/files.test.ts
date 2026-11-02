import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A cached id from another Meta account must not be reused: the current key gets a 404 and the
// file is uploaded again under the current account.
const retrieve = vi.fn();
const upload = vi.fn();
vi.mock('../src/server/meta/client.ts', () => ({
  metaClient: () => ({ files: { retrieve } }),
  uploadFile: (path: string) => upload(path),
}));

describe('ensureUploaded', () => {
  let dir: string;
  let previousCwd: string;

  beforeEach(() => {
    previousCwd = process.cwd();
    dir = mkdtempSync(join(tmpdir(), 'sharkwatch-files-'));
    process.chdir(dir);
    writeFileSync(join(dir, 'chunk.mp4'), 'fake video bytes');
    retrieve.mockReset();
    upload.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    process.chdir(previousCwd);
    rmSync(dir, { recursive: true, force: true });
  });

  it('uploads once, then reuses the cached id while the account can see it', async () => {
    upload.mockResolvedValueOnce('file-1');
    retrieve.mockResolvedValue({ id: 'file-1' });
    const { ensureUploaded } = await import('../src/server/meta/files.ts');

    expect(await ensureUploaded(join(dir, 'chunk.mp4'))).toBe('file-1');
    vi.resetModules();
    const fresh = await import('../src/server/meta/files.ts');
    expect(await fresh.ensureUploaded(join(dir, 'chunk.mp4'))).toBe('file-1');
    expect(upload).toHaveBeenCalledTimes(1);
    expect(retrieve).toHaveBeenCalledTimes(1);
  });

  it('re-uploads when the cached id belongs to another account', async () => {
    upload.mockResolvedValueOnce('file-from-my-account').mockResolvedValueOnce('file-from-friends-account');
    const { ensureUploaded } = await import('../src/server/meta/files.ts');
    await ensureUploaded(join(dir, 'chunk.mp4'));

    // Same cache file, different key: the old id is invisible to the new account.
    vi.resetModules();
    retrieve.mockRejectedValueOnce(Object.assign(new Error('not found'), { status: 404 }));
    const asFriend = await import('../src/server/meta/files.ts');
    expect(await asFriend.ensureUploaded(join(dir, 'chunk.mp4'))).toBe('file-from-friends-account');
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it('surfaces errors other than not-found instead of silently re-uploading', async () => {
    upload.mockResolvedValueOnce('file-1');
    const { ensureUploaded } = await import('../src/server/meta/files.ts');
    await ensureUploaded(join(dir, 'chunk.mp4'));

    vi.resetModules();
    retrieve.mockRejectedValueOnce(Object.assign(new Error('rate limited'), { status: 429 }));
    const again = await import('../src/server/meta/files.ts');
    await expect(again.ensureUploaded(join(dir, 'chunk.mp4'))).rejects.toThrow('rate limited');
    expect(upload).toHaveBeenCalledTimes(1);
  });
});
