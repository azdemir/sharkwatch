// Per-session event stream. Late subscribers get the full history first, so a browser that joins
// mid-session (or a replay) sees exactly what a live viewer saw.

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SessionEvent, SessionEventBody } from '../../shared/events.ts';

type Listener = (event: SessionEvent) => void;

export class EventBus {
  readonly history: SessionEvent[] = [];
  private readonly listeners = new Set<Listener>();
  private readonly startedAt = performance.now();
  private seq = 0;

  constructor(readonly sessionId: string) {}

  emit(body: SessionEventBody, t?: number): SessionEvent {
    const event = {
      ...body,
      sessionId: this.sessionId,
      seq: this.seq++,
      t: t ?? Math.round(performance.now() - this.startedAt) / 1000,
    } as SessionEvent;
    this.history.push(event);
    for (const listener of this.listeners) listener(event);
    return event;
  }

  subscribe(listener: Listener, { replayHistory = true } = {}): () => void {
    if (replayHistory) for (const event of this.history) listener(event);
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get ended(): boolean {
    return this.history.at(-1)?.type === 'session.ended';
  }
}

/** Appends every event to a JSONL file; the file is a complete, replayable record of the session. */
export function recordTo(bus: EventBus, path: string): () => void {
  mkdirSync(dirname(path), { recursive: true });
  return bus.subscribe((event) => appendFileSync(path, `${JSON.stringify(event)}\n`));
}
