// Alerts sent to the (simulated) authorities. Plain JSON so they stream to consoles and recordings.

import type { RecipientRole, RiskAssessment, RiskLevel } from './risk.ts';

export type { RecipientRole, RiskLevel } from './risk.ts';

export type DeliveryChannel = 'console' | 'telegram';
export type DeliveryStatus = 'sent' | 'delivered' | 'acknowledged';

export interface RecipientDelivery {
  role: RecipientRole;
  /** Display name, always marked as simulated. */
  name: string;
  channels: DeliveryChannel[];
  message: string;
  status: DeliveryStatus;
  deliveredAt?: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
}

/** Overall state of an alert, from the operator's point of view. */
export type AlertStatus = 'sent' | 'acknowledged' | 'escalated' | 'resolved';

export type BeachAction = 'monitor' | 'warn_swimmers' | 'clear_water' | 'close_beach';

export interface AlertJson {
  id: string;
  /** Increments on every change, so a stale copy never overwrites a newer one. */
  version: number;
  sessionId: string;
  clipId: string;
  level: RiskLevel;
  /** CAP message type: a new incident, an escalation of one, or the all-clear. */
  msgType: 'Alert' | 'Update' | 'Cancel';
  headline: string;
  summary: string;
  recommendation: string;
  beachAction: BeachAction;
  /** Risk of the most dangerous shark in the incident. */
  risk: RiskAssessment;
  sharkCount: number;
  trackIds: string[];
  location: { lat: number; lon: number; name: string };
  /** Evidence image path relative to the session directory. */
  evidence?: string;
  drafter: 'muse-spark' | 'template';
  agentLatencyMs?: number;
  /** Why the template was used, when it was. */
  draftNote?: string;
  recipients: RecipientDelivery[];
  status: AlertStatus;
  createdAt: string;
  /** Session time (s) when the alert was raised. */
  sessionT: number;
  escalatedAt?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  telegramDelivered?: number;
}

export const RECIPIENT_NAMES: Record<RecipientRole, string> = {
  lifeguards: 'Lifeguard Dispatch (simulated)',
  beach_management: 'Beach Management Office (simulated)',
  coastal_security: 'Coastal Security Watch (simulated)',
};

export const LEVEL_RANK: Record<RiskLevel, number> = { advisory: 0, warning: 1, critical: 2 };
