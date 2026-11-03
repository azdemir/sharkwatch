// Simplified AlertHub for the integrated demo.
import type { AlertJson, RecipientRole } from '../../shared/alerts.ts';
import type { AlertService } from './service.ts';
type Listener = (alert: AlertJson) => void;
const MAX_KEPT = 200;
export class AlertHub {
  private readonly services = new Map<string, AlertService>();
  private readonly latest = new Map<string, AlertJson>();
  private readonly listeners = new Set<Listener>();
  register(sessionId: string, service: AlertService): void { this.services.set(sessionId, service); }
  publish(alert: AlertJson): void {
    this.latest.delete(alert.id);
    this.latest.set(alert.id, alert);
    while (this.latest.size > MAX_KEPT) this.latest.delete(this.latest.keys().next().value!);
    for (const listener of this.listeners) listener(alert);
  }
  list(): AlertJson[] { return [...this.latest.values()]; }
  subscribe(listener: Listener, { replay = true } = {}): () => void {
    if (replay) for (const alert of this.latest.values()) listener(alert);
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  serviceFor(alertId: string): AlertService | undefined {
    const sessionId = this.latest.get(alertId)?.sessionId;
    return sessionId ? this.services.get(sessionId) : undefined;
  }
  acknowledge(alertId: string, role: RecipientRole, by: string): AlertJson | undefined {
    return this.serviceFor(alertId)?.acknowledge(alertId, role, by);
  }
  resolve(alertId: string, by: string): Promise<AlertJson | undefined> {
    return this.serviceFor(alertId)?.resolve(alertId, by) ?? Promise.resolve(undefined);
  }
}
// One shared hub for the whole server process, kept on globalThis like the
// session map and the Telegram channel. A plain module-level `new AlertHub()`
// does not survive a dev-server reload the way those do: after a reload the
// ack route and the alert stream can end up with a fresh, empty hub while
// the running session's AlertService still publishes to the old one. That
// is exactly "Unknown alert" from the UI button and a Telegram ack that
// never reaches the UI, even though the patrol's own event stream still
// shows the alert itself.
const g = globalThis as unknown as { __sharkwatchAlertHub?: AlertHub };
if (!g.__sharkwatchAlertHub) g.__sharkwatchAlertHub = new AlertHub();
export const alertHub = g.__sharkwatchAlertHub;
