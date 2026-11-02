// Meta Model API serves one request per key at a time (measured: three concurrent SAM requests
// finish at ~4, ~8 and ~12 s). Concurrent requests only wait on Meta's side, in an order we don't
// control, so a Live alert could time out behind several SAM chunks. Queuing them here instead lets
// urgent work go first (alert drafting, then verification, then SAM) at no cost to throughput.
// File uploads are not gated; they happen once per chunk per machine.

export type RequestPriority = 'alert' | 'verify' | 'sam';

const RANK: Record<RequestPriority, number> = { alert: 0, verify: 1, sam: 2 };

interface Waiter {
  rank: number;
  seq: number;
  grant: () => void;
}

export class RequestGate {
  private busy = false;
  private seq = 0;
  private waiting: Waiter[] = [];

  /**
   * Runs `fn` alone, after any request already running and any queued request of higher priority
   * (same priority: first come, first served). If `signal` aborts while still queued, rejects with
   * its reason and never runs `fn`.
   */
  async run<T>(priority: RequestPriority, fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.acquire(RANK[priority], signal);
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  /** Requests queued behind the one running (for tests and diagnostics). */
  get queued(): number {
    return this.waiting.length;
  }

  private acquire(rank: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    if (!this.busy) {
      this.busy = true;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        this.waiting = this.waiting.filter((w) => w !== waiter);
        reject(signal!.reason);
      };
      const waiter: Waiter = {
        rank,
        seq: this.seq++,
        grant: () => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        },
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.waiting.push(waiter);
      this.waiting.sort((a, b) => a.rank - b.rank || a.seq - b.seq);
    });
  }

  private release(): void {
    const next = this.waiting.shift();
    if (next) next.grant();
    else this.busy = false;
  }
}

/** Shared by every session on this server, since they all use the same key. */
export const metaGate = new RequestGate();
