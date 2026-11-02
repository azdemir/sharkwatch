// Turns confirmed sharks into alerts for one session. One incident per patrol: the first shark
// that warrants it raises an alert; later sharks join the incident silently unless the risk level
// rises, which sends an escalation. Every recipient's delivery is tracked until acknowledged, a
// critical alert nobody acknowledges is escalated, and the operator closes it with an all-clear.

import { randomUUID } from 'node:crypto';
import { LEVEL_RANK, RECIPIENT_NAMES, type AlertJson, type DeliveryChannel, type RecipientRole } from '../../shared/alerts.ts';
import type { TrackSummary } from '../../shared/events.ts';
import { assessRisk, speciesPhrase, type RiskAssessment } from '../../shared/risk.ts';
import type { EventBus } from '../events/bus.ts';
import type { Draft, DraftRequest } from './agent.ts';
import { headlineFor, summaryFor, telegramHtml, type IncidentFacts } from './templates.ts';

export interface AlertChannel {
  /** Sends to every subscriber; returns how many received it. */
  broadcast(alert: { alertId: string; html: string; photoPath?: string }): Promise<number>;
}

export interface AlertServiceOptions {
  bus: EventBus;
  sessionId: string;
  clipId: string;
  locationName: string;
  /** Absolute directory evidence paths are relative to. */
  sessionDir: string;
  draft: (request: DraftRequest) => Promise<Draft>;
  telegram?: AlertChannel;
  /** Seconds before an unacknowledged critical alert escalates. */
  escalateAfterS?: number;
  /** Notified on every alert change (the global console hub). */
  onChange?: (alert: AlertJson) => void;
}

interface SharkState {
  track: TrackSummary;
  risk: RiskAssessment;
}

export class AlertService {
  private readonly sharks = new Map<string, SharkState>();
  private current?: AlertJson;
  private readonly alerts: AlertJson[] = [];
  private pending: Promise<void> = Promise.resolve();
  private escalation?: ReturnType<typeof setTimeout>;
  private seq = 0;
  private readonly unsubscribe: () => void;

  constructor(private readonly o: AlertServiceOptions) {
    this.unsubscribe = o.bus.subscribe((e) => {
      if (e.type === 'track.updated') this.onTrack(e.track, e.t);
    });
  }

  list(): AlertJson[] {
    return [...this.alerts];
  }

  get(alertId: string): AlertJson | undefined {
    return this.alerts.find((a) => a.id === alertId);
  }

  /** Resolves once queued drafting and dispatch work has finished (tests and shutdown). */
  idle(): Promise<void> {
    return this.pending;
  }

  dispose(): void {
    this.unsubscribe();
    if (this.escalation) clearTimeout(this.escalation);
  }

  private onTrack(track: TrackSummary, t: number): void {
    const risk = assessRisk(track);
    if (!risk) return;
    this.sharks.set(track.id, { track, risk });
    // Serialize: drafting is async, and two sharks confirmed together must not raise two alerts.
    this.pending = this.pending.then(() => this.evaluate(t)).catch((error: Error) => {
      this.o.bus.emit({ type: 'warning', message: `alert dispatch failed: ${error.message}` });
    });
  }

  private worst(): SharkState | undefined {
    let worst: SharkState | undefined;
    for (const s of this.sharks.values()) {
      if (!worst || LEVEL_RANK[s.risk.level] > LEVEL_RANK[worst.risk.level] || (s.risk.level === worst.risk.level && s.risk.score > worst.risk.score)) worst = s;
    }
    return worst;
  }

  private facts(worst: SharkState): IncidentFacts {
    const nearest = Math.min(...[...this.sharks.values()].map((s) => s.track.nearestPersonM ?? Infinity));
    const position = worst.track.position ?? { lat: 0, lon: 0 };
    return {
      level: worst.risk.level,
      sharkCount: this.sharks.size,
      species: speciesPhrase(worst.track.verification),
      // A length measured over merged animals overstates one body; leave it out of the wording.
      lengthM: worst.track.length?.reliable === false ? undefined : worst.track.length?.meters,
      nearestPersonM: Number.isFinite(nearest) ? nearest : undefined,
      inSwimZone: [...this.sharks.values()].some((s) => s.track.inSwimZone),
      distanceToShoreM: worst.track.distanceToShoreM,
      locationName: this.o.locationName,
      lat: position.lat,
      lon: position.lon,
      risk: worst.risk,
    };
  }

  private async evaluate(t: number): Promise<void> {
    const worst = this.worst();
    if (!worst) return;
    const level = worst.risk.level;
    const open = this.current && this.current.status !== 'resolved' ? this.current : undefined;

    if (open) {
      // Keep the incident's numbers current; only a higher level is worth another message.
      if (LEVEL_RANK[level] <= LEVEL_RANK[open.level]) {
        if (open.sharkCount !== this.sharks.size) {
          open.sharkCount = this.sharks.size;
          open.trackIds = [...this.sharks.keys()];
          this.publish(open);
        }
        return;
      }
      await this.raise(worst, t, 'Update', open);
      return;
    }
    await this.raise(worst, t, 'Alert');
  }

  private async raise(worst: SharkState, t: number, msgType: 'Alert' | 'Update', previous?: AlertJson): Promise<void> {
    const facts = this.facts(worst);
    const required = worst.risk.recipients;
    const draft = await this.o.draft({ facts, required, msgType });
    const now = new Date().toISOString();
    const channelsFor = (role: RecipientRole): DeliveryChannel[] => (role === 'lifeguards' && this.o.telegram ? ['console', 'telegram'] : ['console']);

    const alert: AlertJson = {
      id: `A${++this.seq}-${randomUUID().slice(0, 4)}`,
      version: 0,
      sessionId: this.o.sessionId,
      clipId: this.o.clipId,
      level: facts.level,
      msgType,
      // Headlines stay deterministic (level, what, where); the agent writes the per-recipient messages.
      headline: `${msgType === 'Update' ? 'Escalated: ' : ''}${headlineFor(facts)}`,
      summary: summaryFor(facts),
      recommendation: worst.risk.recommendation,
      beachAction: draft.beachAction,
      risk: worst.risk,
      sharkCount: facts.sharkCount,
      trackIds: [...this.sharks.keys()],
      location: { lat: facts.lat, lon: facts.lon, name: facts.locationName },
      evidence: worst.track.evidence,
      drafter: draft.drafter,
      agentLatencyMs: draft.latencyMs,
      draftNote: draft.note,
      // In-app consoles receive it the moment it is published.
      recipients: required.map((role) => ({
        role,
        name: RECIPIENT_NAMES[role],
        channels: channelsFor(role),
        message: draft.messages.get(role) ?? '',
        status: 'delivered',
        deliveredAt: now,
      })),
      status: 'sent',
      createdAt: now,
      sessionT: t,
    };
    if (previous) {
      previous.status = 'resolved';
      previous.resolvedAt = now;
      previous.resolvedBy = `superseded by ${alert.id}`;
      this.publish(previous);
    }
    this.current = alert;
    this.alerts.push(alert);
    this.publish(alert);

    if (alert.recipients.length === 0) return; // no recipients (should not happen now
    // that advisory also goes to lifeguards): nothing to send anywhere
    await this.sendTelegram(alert);
    this.armEscalation(alert);
  }

  private async sendTelegram(alert: AlertJson, prefix?: string): Promise<void> {
    if (!this.o.telegram) return;
    const lifeguards = alert.recipients.find((r) => r.role === 'lifeguards') ?? alert.recipients[0]!;
    const delivered = await this.o.telegram.broadcast({
      alertId: alert.id,
      html: telegramHtml({
        level: alert.level,
        headline: alert.headline,
        message: lifeguards.message,
        recommendation: alert.recommendation,
        recipients: alert.recipients.map((r) => r.role),
        lat: alert.location.lat,
        lon: alert.location.lon,
        prefix,
      }),
      photoPath: alert.evidence ? `${this.o.sessionDir}/${alert.evidence}` : undefined,
    });
    alert.telegramDelivered = (alert.telegramDelivered ?? 0) + delivered;
    this.publish(alert);
  }

  private armEscalation(alert: AlertJson): void {
    if (this.escalation) clearTimeout(this.escalation);
    if (alert.level !== 'critical') return;
    this.escalation = setTimeout(() => {
      if (alert.status !== 'sent') return;
      alert.status = 'escalated';
      alert.escalatedAt = new Date().toISOString();
      this.publish(alert);
      void this.sendTelegram(alert, 'NO ACKNOWLEDGEMENT:');
    }, (this.o.escalateAfterS ?? 45) * 1000);
  }

  /** A recipient confirms they are responding (from a console or Telegram). */
  acknowledge(alertId: string, role: RecipientRole, by: string): AlertJson | undefined {
    const alert = this.get(alertId);
    const recipient = alert?.recipients.find((r) => r.role === role);
    if (!alert || !recipient || alert.status === 'resolved') return alert;
    if (recipient.status !== 'acknowledged') {
      recipient.status = 'acknowledged';
      recipient.acknowledgedAt = new Date().toISOString();
      recipient.acknowledgedBy = by;
    }
    if (alert.status === 'sent' || alert.status === 'escalated') alert.status = 'acknowledged';
    if (this.escalation && alert === this.current) clearTimeout(this.escalation);
    this.publish(alert);
    return alert;
  }

  /** The operator stands the incident down; recipients get an all-clear. */
  async resolve(alertId: string, by: string): Promise<AlertJson | undefined> {
    const alert = this.get(alertId);
    if (!alert || alert.status === 'resolved') return alert;
    alert.status = 'resolved';
    alert.resolvedAt = new Date().toISOString();
    alert.resolvedBy = by;
    if (this.escalation) clearTimeout(this.escalation);
    this.publish(alert);
    if (this.o.telegram && alert.recipients.length) {
      await this.o.telegram.broadcast({
        alertId: `${alert.id}-clear`,
        html: `✅ <b>All clear</b> at ${alert.location.name.replace(/&/g, '&amp;').replace(/</g, '&lt;')}\nIncident ${alert.id} stood down by ${by.replace(/</g, '&lt;')}.\n<i>SharkWatch exercise: simulated alert.</i>`,
      });
    }
    return alert;
  }

  private publish(alert: AlertJson): void {
    alert.version++;
    const copy = structuredClone(alert);
    this.o.bus.emit({ type: 'alert.updated', alert: copy });
    this.o.onChange?.(copy);
  }
}

