import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AlertJson } from '../src/shared/alerts.ts';
import type { TrackSummary } from '../src/shared/events.ts';
import { templateDraft } from '../src/server/alerts/agent.ts';
import { AlertService, type AlertChannel } from '../src/server/alerts/service.ts';
import { EventBus } from '../src/server/events/bus.ts';

function shark(id: string, species: string, nearestPersonM: number | undefined, extra: Partial<TrackSummary> = {}): TrackSummary {
  return {
    id, kind: 'animal', lifecycle: 'active', verdict: 'shark', concepts: ['shark'], firstFrame: 0, lastFrame: 20, framesSeen: 20,
    verification: { is_shark: true, label: 'shark', confidence: 0.9, species_guess: species, species_confidence: 'high', behavior: '', evidence: [], latencyMs: 0 },
    length: { meters: 2, low: 1.6, high: 2.7, sizeClass: 'medium' }, nearestPersonM, position: { lat: 25.79, lon: -80.126 }, evidence: `evidence/${id}.jpg`,
    ...extra,
  };
}

class FakeTelegram implements AlertChannel {
  readonly sent: { alertId: string; html: string; photoPath?: string }[] = [];
  async broadcast(alert: { alertId: string; html: string; photoPath?: string }) {
    this.sent.push(alert);
    return 2;
  }
}

function setup(escalateAfterS = 45) {
  const bus = new EventBus('s1');
  const telegram = new FakeTelegram();
  const changes: AlertJson[] = [];
  const service = new AlertService({
    bus, sessionId: 's1', clipId: 'clip-b-swimmer', locationName: 'Miami Beach, FL (simulated patrol)', sessionDir: '/tmp/s1',
    draft: async (r) => templateDraft(r), telegram, escalateAfterS, onChange: (a) => changes.push(a),
  });
  const update = async (track: TrackSummary, t = 1) => {
    bus.emit({ type: 'track.updated', track }, t);
    await service.idle();
  };
  return { bus, telegram, service, changes, update };
}

afterEach(() => vi.useRealTimers());

describe('AlertService', () => {
  it('raises one lifeguard warning for docile sharks near swimmers, however many there are', async () => {
    const { service, telegram, update } = setup();
    await update(shark('T1', 'nurse shark', 1.2, { inSwimZone: true }));
    await update(shark('T2', 'nurse shark', 2.0));
    await update(shark('T3', 'tawny nurse shark', 0.8));
    const alerts = service.list();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ level: 'warning', msgType: 'Alert', sharkCount: 3, beachAction: 'warn_swimmers', drafter: 'template' });
    expect(alerts[0]!.recipients.map((r) => [r.role, r.status, r.channels.join('+')])).toEqual([['lifeguards', 'delivered', 'console+telegram']]);
    expect(telegram.sent).toHaveLength(1);
    expect(telegram.sent[0]!.photoPath).toBe('/tmp/s1/evidence/T1.jpg');
    expect(alerts[0]!.telegramDelivered).toBe(2);
  });

  it('escalates to critical when a dangerous shark joins, superseding the warning', async () => {
    const { service, telegram, update } = setup();
    await update(shark('T1', 'nurse shark', 1.2));
    await update(shark('T9', 'tiger shark', 5, { inSwimZone: true, length: { meters: 3.5, low: 2.8, high: 4.6, sizeClass: 'large' } }));
    const [first, second] = service.list();
    expect(first!.status).toBe('resolved');
    expect(first!.resolvedBy).toContain(second!.id);
    expect(second).toMatchObject({ level: 'critical', msgType: 'Update', beachAction: 'clear_water' });
    expect(second!.headline).toMatch(/^Escalated: CRITICAL/);
    expect(second!.recipients.map((r) => r.role)).toEqual(['lifeguards', 'beach_management', 'coastal_security']);
    expect(telegram.sent).toHaveLength(2);
  });

  it('words the species in the alert only as firmly as Muse Spark called it', async () => {
    const said = async (sure: 'low' | 'medium') => {
      const { service, update } = setup();
      const t = shark('T1', 'white shark', undefined);
      await update({ ...t, verification: { ...t.verification!, species_confidence: sure } });
      return service.list()[0]!.summary;
    };
    expect(await said('medium')).toMatch(/^Likely white shark, about 2.0 m confirmed by drone/);
    expect(await said('low')).toMatch(/^Shark, about 2.0 m confirmed by drone/);
  });

  it('logs an advisory without notifying anyone', async () => {
    const { service, telegram, update } = setup();
    await update(shark('T1', 'whale shark', undefined, { length: { meters: 6, low: 5, high: 8, sizeClass: 'large' } }));
    expect(service.list()[0]).toMatchObject({ level: 'advisory', recipients: [] });
    expect(telegram.sent).toHaveLength(0);
  });

  it('ignores animals that are not confirmed sharks', async () => {
    const { service, update } = setup();
    await update({ ...shark('T1', 'tiger shark', 2), verdict: 'uncertain' });
    await update({ ...shark('T2', '', 2), verdict: 'not_shark' });
    expect(service.list()).toHaveLength(0);
  });

  it('records acknowledgements and stops the escalation timer', async () => {
    vi.useFakeTimers();
    const { service, telegram, update } = setup(30);
    await update(shark('T9', 'bull shark', 3, { inSwimZone: true }));
    const alert = service.list()[0]!;
    service.acknowledge(alert.id, 'lifeguards', 'Dana');
    vi.advanceTimersByTime(60_000);
    const after = service.get(alert.id)!;
    expect(after.status).toBe('acknowledged');
    expect(after.recipients.find((r) => r.role === 'lifeguards')).toMatchObject({ status: 'acknowledged', acknowledgedBy: 'Dana' });
    expect(telegram.sent).toHaveLength(1);
  });

  it('escalates a critical alert nobody acknowledges', async () => {
    vi.useFakeTimers();
    const { service, telegram, update } = setup(30);
    await update(shark('T9', 'bull shark', 3, { inSwimZone: true }));
    await vi.advanceTimersByTimeAsync(31_000);
    expect(service.list()[0]!.status).toBe('escalated');
    expect(telegram.sent.at(-1)!.html).toContain('NO ACKNOWLEDGEMENT:');
  });

  it('sends an all-clear when the operator resolves, and stays resolved', async () => {
    const { service, telegram, update, changes } = setup();
    await update(shark('T1', 'nurse shark', 1));
    const alert = service.list()[0]!;
    await service.resolve(alert.id, 'Operator');
    expect(service.get(alert.id)).toMatchObject({ status: 'resolved', resolvedBy: 'Operator' });
    expect(telegram.sent.at(-1)!.html).toContain('All clear');
    // Acknowledging a resolved alert changes nothing.
    service.acknowledge(alert.id, 'lifeguards', 'late');
    expect(service.get(alert.id)!.recipients[0]!.status).toBe('delivered');
    expect(changes.at(-1)!.status).toBe('resolved');
  });

  it('starts a new incident for a shark that appears after the all-clear', async () => {
    const { service, update } = setup();
    await update(shark('T1', 'nurse shark', 1));
    await service.resolve(service.list()[0]!.id, 'Operator');
    await update(shark('T2', 'nurse shark', 1.5));
    expect(service.list().map((a) => [a.msgType, a.status])).toEqual([
      ['Alert', 'resolved'],
      ['Alert', 'sent'],
    ]);
  });
});
