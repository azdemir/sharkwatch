// Simplified agent for the integrated demo: template wording only, no Meta client, no paid Muse Spark session.
import type { BeachAction, RecipientRole } from '../../shared/alerts.ts';
import { BEACH_ACTION, headlineFor, templateMessage, type IncidentFacts } from './templates.ts';
export interface Draft { headline: string; messages: Map<RecipientRole, string>; beachAction: BeachAction; drafter: 'muse-spark' | 'template'; latencyMs?: number; note?: string; }
export interface DraftRequest { facts: IncidentFacts; required: RecipientRole[]; msgType: 'Alert' | 'Update'; }
export function templateDraft(request: DraftRequest, note?: string): Draft {
  return { headline: headlineFor(request.facts), messages: new Map(request.required.map((role) => [role, templateMessage(role, request.facts)])), beachAction: BEACH_ACTION[request.facts.level], drafter: 'template', note };
}
