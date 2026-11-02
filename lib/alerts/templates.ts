// Moved from sharkwatch-vite/src/server/alerts/templates.ts (import paths adjusted for Next.js).
// Deterministic alert wording: used when there is no Meta key, when the Muse Spark agent times out,
// or for any recipient the agent leaves out. Built only from measured facts.

import { RECIPIENT_NAMES, type BeachAction, type RecipientRole, type RiskLevel } from './alerts';
import type { RiskAssessment } from './risk';

export interface IncidentFacts {
  level: RiskLevel;
  sharkCount: number;
  species?: string;
  lengthM?: number;
  nearestPersonM?: number;
  inSwimZone: boolean;
  distanceToShoreM?: number;
  locationName: string;
  lat: number;
  lon: number;
  risk: RiskAssessment;
}

export const BEACH_ACTION: Record<RiskLevel, BeachAction> = {
  advisory: 'monitor',
  warning: 'warn_swimmers',
  critical: 'clear_water',
};

const LEVEL_WORD: Record<RiskLevel, string> = { advisory: 'Advisory', warning: 'Warning', critical: 'CRITICAL' };
const m = (v: number) => (v < 10 ? v.toFixed(1) : v.toFixed(0));

export function describeSharks(f: IncidentFacts): string {
  const what = f.species ? f.species.toLowerCase() : 'shark';
  const size = f.lengthM !== undefined ? `, about ${m(f.lengthM)} m` : '';
  return f.sharkCount > 1 ? `${f.sharkCount} sharks (largest risk: ${what}${size})` : `${what}${size}`;
}

export function headlineFor(f: IncidentFacts): string {
  const near = f.nearestPersonM !== undefined && f.nearestPersonM < 30 ? ' near swimmers' : f.inSwimZone ? ' in swim zone' : '';
  return `${LEVEL_WORD[f.level]}: shark${f.sharkCount > 1 ? 's' : ''}${near} at ${f.locationName.replace(/ \(simulated.*\)$/, '')}`;
}

export function summaryFor(f: IncidentFacts): string {
  const parts = [`${capitalise(describeSharks(f))} confirmed by drone`];
  if (f.nearestPersonM !== undefined) parts.push(`${m(f.nearestPersonM)} m from the nearest person`);
  if (f.inSwimZone) parts.push('inside the swim zone');
  if (f.distanceToShoreM !== undefined) parts.push(`${f.distanceToShoreM >= 1000 ? `${(f.distanceToShoreM / 1000).toFixed(1)} km` : `${m(f.distanceToShoreM)} m`} from shore`);
  return `${parts.join(', ')}.`;
}

const ROLE_ASK: Record<RecipientRole, (f: IncidentFacts) => string> = {
  lifeguards: (f) =>
    f.level === 'critical' ? 'Clear swimmers from the water near the sighting now and raise the shark flag.' : 'Watch the area and warn swimmers nearby to stay alert.',
  beach_management: (f) => (f.level === 'critical' ? 'Prepare to close the water and post shark warnings at entrances.' : 'Be ready to post shark warnings.'),
  coastal_security: () => 'Keep watch offshore and stand by to support lifeguards.',
};

export function templateMessage(role: RecipientRole, f: IncidentFacts): string {
  return `${summaryFor(f)} ${ROLE_ASK[role](f)} Location ${f.lat.toFixed(5)}, ${f.lon.toFixed(5)}. Exercise; simulated.`;
}

export function recipientName(role: RecipientRole): string {
  return RECIPIENT_NAMES[role];
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function telegramHtml(o: {
  level: RiskLevel;
  headline: string;
  message: string;
  recommendation: string;
  recipients: RecipientRole[];
  lat: number;
  lon: number;
  prefix?: string;
}): string {
  const icon = o.level === 'critical' ? '🚨' : o.level === 'warning' ? '⚠️' : 'ℹ️';
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return [
    `${icon} <b>${esc(o.prefix ? `${o.prefix} ` : '')}${esc(o.headline)}</b>`,
    esc(o.message),
    `<b>Action:</b> ${esc(o.recommendation)}`,
    `<b>To:</b> ${o.recipients.map((r) => esc(RECIPIENT_NAMES[r])).join(', ')}`,
    `📍 <a href="https://www.openstreetmap.org/?mlat=${o.lat.toFixed(5)}&amp;mlon=${o.lon.toFixed(5)}#map=18/${o.lat.toFixed(5)}/${o.lon.toFixed(5)}">${o.lat.toFixed(5)}, ${o.lon.toFixed(5)}</a>`,
    '<i>SharkWatch exercise: simulated alert, not a real emergency.</i>',
  ].join('\n');
}
