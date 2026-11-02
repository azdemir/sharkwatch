import { describe, expect, it } from 'vitest';
import { RequestGate } from '../src/server/meta/gate.ts';

/** A request that runs until `finish()` is called. */
function held() {
  let finish!: () => void;
  const done = new Promise<void>((resolve) => (finish = resolve));
  return { done, finish };
}

describe('RequestGate', () => {
  it('runs one request at a time, urgent work first, same priority in arrival order', async () => {
    const gate = new RequestGate();
    const order: string[] = [];
    const first = held();
    const running = gate.run('sam', () => first.done);
    const queued = [
      gate.run('sam', async () => void order.push('sam chunk 2')),
      gate.run('verify', async () => void order.push('verify')),
      gate.run('sam', async () => void order.push('sam chunk 3')),
      gate.run('alert', async () => void order.push('alert')),
    ];
    expect(gate.queued).toBe(4);
    expect(order).toEqual([]);
    first.finish();
    await Promise.all([running, ...queued]);
    expect(order).toEqual(['alert', 'verify', 'sam chunk 2', 'sam chunk 3']);
    expect(gate.queued).toBe(0);
  });

  it('moves on after a request fails', async () => {
    const gate = new RequestGate();
    await expect(gate.run('sam', async () => { throw new Error('500'); })).rejects.toThrow('500');
    await expect(gate.run('verify', async () => 'ok')).resolves.toBe('ok');
  });

  it('drops a queued request whose signal aborts, without running it', async () => {
    const gate = new RequestGate();
    const first = held();
    const running = gate.run('sam', () => first.done);
    const controller = new AbortController();
    let ran = false;
    const waiting = gate.run('alert', async () => { ran = true; }, controller.signal);
    controller.abort(new Error('gave up'));
    await expect(waiting).rejects.toThrow('gave up');
    expect(gate.queued).toBe(0);
    first.finish();
    await running;
    expect(ran).toBe(false);
  });
});
