// Moved from sharkwatch-vite/src/shared/alerts.ts (import path adjusted for Next.js).
// Alerts sent to the (simulated) authorities. Plain JSON so they stream to consoles and recordings.

import type { RecipientRole, RiskAssessment, RiskLevel } from './risk';

export type { RecipientRole, RiskLevel } from './risk';

export type DeliveryChannel = 'console' | 'telegram';
export type DeliveryStatus = 'sent' | 'delivered' | 'acknowledged';

export interface RecipientDelivery {
  role: RecipientRole;
  name: string;
  channels: DeliveryChannel[];
  message: string;
  status: DeliveryStatus;
  deliveredAt?: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
}

export type AlertStatus = 'sent' | 'acknowledged' | 'escalated' | 'resolved';
export type BeachAction = 'monitor' | 'warn_swimmers' | 'clear_water' | 'close_beach';

export interface AlertJson {
  id: string;
  version: number;
  sessionId: string;
  clipId: string;
  level: RiskLevel;
  msgType: 'Alert' | 'Update' | 'Cancel';
  headline: string;
  summary: string;
  recommendation: string;
  beachAction: BeachAction;
  risk: RiskAssessment;
  sharkCount: number;
  trackIds: string[];
  location: { lat: number; lon: number; name: string };
  evidence?: string;
  drafter: 'muse-spark' | 'template';
  agentLatencyMs?: number;
  draftNote?: string;
  recipients: RecipientDelivery[];
  status: AlertStatus;
  createdAt: string;
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
