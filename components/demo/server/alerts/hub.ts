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
export const alertHub = new AlertHub();
