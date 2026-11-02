// Moved from sharkwatch-vite/src/shared/risk.ts (import path adjusted for Next.js).
// Deterministic, explainable risk scoring for confirmed sharks. Every point comes with a reason.

import type { TrackSummary, VerificationJson } from './events';

export type RiskLevel = 'advisory' | 'warning' | 'critical';
export type RecipientRole = 'lifeguards' | 'beach_management' | 'coastal_security';

export interface RiskAssessment {
  level: RiskLevel;
  score: number;
  reasons: string[];
  recipients: RecipientRole[];
  recommendation: string;
}

const HIGH_RISK = /\b(white|great white|tiger|bull|oceanic whitetip|mako|great hammerhead)\b/;
const LOW_RISK = /\b(nurse|whale shark|basking|leopard|wobbegong|horn|zebra|epaulette|bamboo)\b/;

export const RECIPIENTS_BY_LEVEL: Record<RiskLevel, RecipientRole[]> = {
  advisory: [],
  warning: ['lifeguards'],
  critical: ['lifeguards', 'beach_management', 'coastal_security'],
};

export const OFFSHORE_M = 1000;

const RECOMMENDATION: Record<RiskLevel, string> = {
  advisory: 'Log the sighting and keep monitoring.',
  warning: 'Lifeguards: watch the area and warn swimmers nearby.',
  critical: 'Clear the water near the sighting and fly the shark warning flag.',
};

export function speciesRisk(speciesGuess: string | undefined): 'high' | 'low' | 'unknown' {
  const s = (speciesGuess ?? '').toLowerCase();
  if (HIGH_RISK.test(s)) return 'high';
  if (LOW_RISK.test(s)) return 'low';
  return 'unknown';
}

type SpeciesCall = Pick<VerificationJson, 'species_guess' | 'species_confidence'> | undefined;

export function speciesPhrase(v: SpeciesCall): string | undefined {
  const guess = v?.species_guess?.trim().toLowerCase();
  if (!guess || guess === 'unknown' || guess === 'shark') return undefined;
  if (v?.species_confidence === 'high') return guess;
  if (v?.species_confidence === 'medium') return `likely ${guess}`;
  return undefined;
}

export function assessRisk(track: TrackSummary): RiskAssessment | undefined {
  if (track.kind !== 'animal' || track.verdict !== 'shark') return undefined;
  const reasons: string[] = [];
  let score = 0;
  const species = track.verification?.species_guess?.trim().toLowerCase();
  const sure = track.verification?.species_confidence;
  const risk = speciesRisk(species);
  const docile = risk === 'low' && sure === 'high';
  if (risk === 'high' && sure === 'high') {
    score += 3;
    reasons.push(`${species} is a species involved in serious bites (+3)`);
  } else if (risk === 'high' && sure === 'medium') {
    score += 2;
    reasons.push(`likely ${species}, a species involved in serious bites (+2)`);
  } else if (docile) {
    score -= 1;
    reasons.push(`${species} is rarely dangerous to people (−1)`);
  } else if (risk === 'low' && sure === 'medium') {
    reasons.push(`likely ${species}, which is rarely dangerous, but not certain enough to lower the risk (0)`);
  } else {
    score += 1;
    reasons.push(`species not identified with confidence${species && risk !== 'unknown' ? ` (possibly ${species})` : ''} (+1)`);
  }
  const size = track.length?.reliable === false ? undefined : track.length?.sizeClass;
  if (track.length?.reliable === false) reasons.push("size not scored: the outline merges more than one animal");
  if (size === 'large') {
    score += 2;
    reasons.push(`large: about ${track.length!.meters.toFixed(1)} m (+2)`);
  } else if (size === 'medium') {
    score += 1;
    reasons.push(`medium: about ${track.length!.meters.toFixed(1)} m (+1)`);
  }
  const near = track.nearestPersonM;
  if (near !== undefined) {
    if (near < 10) { score += 4; reasons.push(`${near.toFixed(1)} m from a person (+4)`); }
    else if (near < 30) { score += 2; reasons.push(`${near.toFixed(0)} m from a person (+2)`); }
    else if (near < 100) { score += 1; reasons.push(`${near.toFixed(0)} m from a person (+1)`); }
  }
  if (track.inSwimZone) { score += 2; reasons.push('inside a designated swim zone (+2)'); }
  if (track.shoreApproachMps !== undefined && track.shoreApproachMps > 0.1) {
    score += 1;
    reasons.push(`heading toward shore at ${track.shoreApproachMps.toFixed(1)} m/s (+1)`);
  }
  if (track.distanceToShoreM !== undefined && track.distanceToShoreM < 50) {
    score += 1;
    reasons.push(`${track.distanceToShoreM.toFixed(0)} m from shore (+1)`);
  }
  let level: RiskLevel = score >= 7 ? 'critical' : score >= 3 ? 'warning' : 'advisory';
  if (level === 'critical' && docile) { level = 'warning'; reasons.push('capped at warning for a low-risk species'); }
  const offshore = track.distanceToShoreM !== undefined && track.distanceToShoreM > OFFSHORE_M && (near === undefined || near >= 100);
  if (offshore && level !== 'advisory') {
    level = 'advisory';
    reasons.push(`capped at advisory: ${(track.distanceToShoreM! / 1000).toFixed(1)} km offshore with nobody within 100 m`);
  }
  return { level, score, reasons, recipients: RECIPIENTS_BY_LEVEL[level], recommendation: RECOMMENDATION[level] };
}
