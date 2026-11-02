import { describe, expect, it } from 'vitest';
import type { TrackSummary } from '../src/shared/events.ts';
import { assessRisk } from '../src/shared/risk.ts';
import { draftWithAgent, type DraftRequest } from '../src/server/alerts/agent.ts';
import { RequestGate } from '../src/server/meta/gate.ts';
import type { IncidentFacts } from '../src/server/alerts/templates.ts';

const risk = assessRisk({
  id: 'T1', kind: 'animal', lifecycle: 'active', verdict: 'shark', concepts: ['shark'], firstFrame: 0, lastFrame: 9, framesSeen: 9,
  verification: { is_shark: true, label: 'shark', confidence: 0.9, species_guess: 'bull shark', species_confidence: 'low', behavior: '', evidence: [], latencyMs: 0 },
  length: { meters: 2.6, low: 2, high: 3.5, sizeClass: 'medium' }, nearestPersonM: 4, inSwimZone: true,
} as TrackSummary)!;

const facts: IncidentFacts = { level: 'critical', sharkCount: 1, species: 'Bull shark', lengthM: 2.6, nearestPersonM: 4, inSwimZone: true, locationName: 'Miami Beach, FL (simulated patrol)', lat: 25.79, lon: -80.12, risk };
const request: DraftRequest = { facts, required: ['lifeguards', 'beach_management', 'coastal_security'], msgType: 'Alert' };

const call = (name: string, args: object) => ({ type: 'function_call', name, call_id: Math.random().toString(36), arguments: JSON.stringify(args) });
const reply = (...output: unknown[]) => async () => ({ output });

describe('alert agent guardrails', () => {
  it('uses the agent messages and action when they are valid', async () => {
    const d = await draftWithAgent(request, {
      create: reply(
        call('dispatch_alert', { recipient: 'lifeguards', headline: 'Bull shark 4 m from swimmers', message: 'Exercise: bull shark ~2.6 m, 4 m from a swimmer in the swim zone at 25.79,-80.12. Clear the water now.' }),
        call('dispatch_alert', { recipient: 'beach_management', headline: 'x', message: 'Exercise: close the swim zone at Miami Beach and post shark warnings; bull shark 4 m from a person.' }),
        call('dispatch_alert', { recipient: 'coastal_security', headline: 'x', message: 'Exercise: bull shark 4 m from a swimmer near 25.79,-80.12; watch offshore and support lifeguards.' }),
        call('set_beach_action', { action: 'close_beach', reason: 'dangerous species in swim zone' }),
        { type: 'message', content: [{ type: 'output_text', text: 'Done.' }] },
      ),
    });
    expect(d.drafter).toBe('muse-spark');
    expect(d.headline).toBe('Bull shark 4 m from swimmers');
    expect(d.messages.get('lifeguards')).toContain('Clear the water now');
    expect(d.beachAction).toBe('close_beach');
    expect(d.note).toBeUndefined();
  });

  it('fills recipients the agent skipped and drops ones it may not add', async () => {
    const d = await draftWithAgent(
      { ...request, required: ['lifeguards', 'beach_management'] },
      {
        create: reply(
          call('dispatch_alert', { recipient: 'lifeguards', headline: 'h', message: 'Exercise: bull shark 4 m from a swimmer; clear the water at 25.79,-80.12 now.' }),
          call('dispatch_alert', { recipient: 'coastal_security', headline: 'h', message: 'Exercise: not required for this alert, so it must be dropped by the server.' }),
        ),
      },
    );
    expect([...d.messages.keys()]).toEqual(['lifeguards', 'beach_management']);
    expect(d.messages.get('beach_management')).toContain('Exercise; simulated.');
    expect(d.note).toContain('template used for beach_management');
    expect(d.note).toContain('"coastal_security" is not required');
  });

  it('never lets the agent weaken the beach action below policy', async () => {
    const d = await draftWithAgent(request, {
      create: reply(
        call('dispatch_alert', { recipient: 'lifeguards', headline: 'h', message: 'Exercise: bull shark 4 m from a swimmer; keep an eye on it from the tower.' }),
        call('set_beach_action', { action: 'monitor', reason: 'probably fine' }),
      ),
    });
    expect(d.beachAction).toBe('clear_water');
    expect(d.note).toContain('below the critical minimum');
  });

  it('falls back to templates on a text-only reply, an error, or a timeout', async () => {
    const textOnly = await draftWithAgent(request, { create: reply({ type: 'message', content: [] }) });
    expect(textOnly.drafter).toBe('template');
    expect(textOnly.note).toContain('without dispatching');

    const failed = await draftWithAgent(request, { create: async () => { throw new Error('500 upstream'); } });
    expect(failed.drafter).toBe('template');
    expect(failed.note).toContain('500 upstream');

    const slow = await draftWithAgent(request, {
      timeoutMs: 30,
      create: (_body, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))),
    });
    expect(slow.drafter).toBe('template');
    expect(slow.note).toContain('did not answer within');
    expect(slow.messages.size).toBe(3);
  });

  it('waits for the running Meta request, then gets the full call time', async () => {
    const gate = new RequestGate();
    let finishSam!: () => void;
    const sam = gate.run('sam', () => new Promise<void>((resolve) => (finishSam = resolve)));
    setTimeout(() => finishSam(), 1100);
    const d = await draftWithAgent(request, {
      gate,
      queueMs: 5_000,
      timeoutMs: 300,
      create: async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return { output: [call('dispatch_alert', { recipient: 'lifeguards', headline: 'h', message: 'Exercise: bull shark 4 m from a swimmer at 25.79,-80.12. Clear the water now.' })] };
      },
    });
    await sam;
    expect(d.drafter).toBe('muse-spark');
    expect(d.latencyMs).toBeLessThan(1000);
    expect(d.note).toMatch(/queued 1\.\d s behind video analysis/);
  });

  it('sends templates when the API stays busy past the queue limit', async () => {
    const gate = new RequestGate();
    let finishSam!: () => void;
    const sam = gate.run('sam', () => new Promise<void>((resolve) => (finishSam = resolve)));
    let called = false;
    const d = await draftWithAgent(request, { gate, queueMs: 30, create: async () => { called = true; return { output: [] }; } });
    expect(d.drafter).toBe('template');
    expect(d.note).toContain('still busy with video analysis');
    expect(d.messages.size).toBe(3);
    finishSam();
    await sam;
    expect(called).toBe(false);
  });

  it('does not call the model when nobody needs to be told', async () => {
    let called = false;
    const d = await draftWithAgent({ ...request, required: [] }, { create: async () => { called = true; return { output: [] }; } });
    expect(called).toBe(false);
    expect(d.messages.size).toBe(0);
  });
});
