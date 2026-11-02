import { describe, expect, it } from 'vitest';
import type { TrackSummary } from '../src/shared/events.ts';
import { assessRisk, speciesPhrase, speciesRisk } from '../src/shared/risk.ts';

function shark(overrides: Partial<TrackSummary> & { species?: string; sure?: 'low' | 'medium' | 'high'; meters?: number }): TrackSummary {
  const { species = '', sure = 'medium', meters, ...rest } = overrides;
  return {
    id: 'T1',
    kind: 'animal',
    lifecycle: 'active',
    verdict: 'shark',
    concepts: ['shark'],
    firstFrame: 0,
    lastFrame: 10,
    framesSeen: 10,
    verification: { is_shark: true, label: 'shark', confidence: 0.9, species_guess: species, species_confidence: sure, behavior: '', evidence: [], latencyMs: 0 },
    length: meters === undefined ? undefined : { meters, low: meters * 0.8, high: meters * 1.3, sizeClass: meters < 1.5 ? 'small' : meters <= 3 ? 'medium' : 'large' },
    ...rest,
  };
}

describe('species risk', () => {
  it('groups species by bite record', () => {
    expect(speciesRisk('White shark')).toBe('high');
    expect(speciesRisk('bull shark')).toBe('high');
    expect(speciesRisk('tawny nurse shark')).toBe('low');
    expect(speciesRisk('whale shark')).toBe('low');
    expect(speciesRisk('blacktip reef shark')).toBe('unknown');
    expect(speciesRisk('')).toBe('unknown');
  });

  it('words a species only as firmly as Muse Spark called it', () => {
    expect(speciesPhrase({ species_guess: 'White shark', species_confidence: 'high' })).toBe('white shark');
    expect(speciesPhrase({ species_guess: 'white shark', species_confidence: 'medium' })).toBe('likely white shark');
    expect(speciesPhrase({ species_guess: 'white shark', species_confidence: 'low' })).toBeUndefined();
    expect(speciesPhrase({ species_guess: '', species_confidence: 'high' })).toBeUndefined();
    expect(speciesPhrase(undefined)).toBeUndefined();
  });
});

describe('assessRisk', () => {
  it('only scores confirmed sharks', () => {
    expect(assessRisk({ ...shark({}), verdict: 'uncertain' })).toBeUndefined();
    expect(assessRisk({ ...shark({}), kind: 'person' })).toBeUndefined();
  });

  it('is critical for a large dangerous shark near swimmers, notifying everyone', () => {
    const r = assessRisk(shark({ species: 'tiger shark', meters: 3.4, nearestPersonM: 6, inSwimZone: true }))!;
    expect(r.level).toBe('critical');
    expect(r.recipients).toEqual(['lifeguards', 'beach_management', 'coastal_security']);
    expect(r.reasons.join(' ')).toContain('6.0 m from a person');
  });

  it('caps docile species at a lifeguard warning even right next to people', () => {
    const r = assessRisk(shark({ species: 'nurse shark', sure: 'high', meters: 2.4, nearestPersonM: 1, inSwimZone: true, distanceToShoreM: 20 }))!;
    expect(r.level).toBe('warning');
    expect(r.recipients).toEqual(['lifeguards']);
    expect(r.reasons.at(-1)).toContain('capped');
  });

  it('treats an unidentified medium shark in a swim zone near people as critical', () => {
    const r = assessRisk(shark({ species: 'blacktip reef shark', meters: 1.9, nearestPersonM: 4, inSwimZone: true }))!;
    expect(r.score).toBe(1 + 1 + 4 + 2);
    expect(r.level).toBe('critical');
  });

  it('is an advisory for a shark far from anyone', () => {
    const r = assessRisk(shark({ species: 'whale shark', meters: 6, nearestPersonM: undefined, distanceToShoreM: undefined }))!;
    expect(r.level).toBe('advisory');
    expect(r.recipients).toEqual([]);
  });

  it('does not score size when the outline covers more than one animal', () => {
    const merged = shark({ species: 'lemon shark', meters: 3.4 });
    merged.length!.reliable = false;
    const r = assessRisk(merged)!;
    expect(r.score).toBe(assessRisk(shark({ species: 'lemon shark' }))!.score);
    expect(r.reasons.join(' ')).toContain('size not scored');
  });

  it('scores a dangerous species only as far as Muse Spark is sure of it', () => {
    const at = (sure: 'low' | 'medium' | 'high') => assessRisk(shark({ species: 'white shark', sure, meters: 3.6 }))!;
    // The reef shark that one run called a "white shark" with low confidence counts as unidentified.
    expect(at('low').score).toBe(assessRisk(shark({ species: '', meters: 3.6 }))!.score);
    expect(at('low').reasons[0]).toBe('species not identified with confidence (possibly white shark) (+1)');
    expect(at('medium').score).toBe(at('low').score + 1);
    expect(at('medium').reasons[0]).toContain('likely white shark');
    expect(at('high').score).toBe(at('low').score + 2);
  });

  it('never lowers the risk or caps the alert on an unsure "docile" call', () => {
    // A bull shark misread as a nurse shark, right next to swimmers, must still clear the water.
    for (const sure of ['low', 'medium'] as const) {
      const r = assessRisk(shark({ species: 'nurse shark', sure, meters: 2.4, nearestPersonM: 1, inSwimZone: true, distanceToShoreM: 20 }))!;
      expect(r.level, sure).toBe('critical');
      expect(r.reasons.join(' ')).not.toContain('capped');
    }
  });

  it('logs a shark far offshore with nobody near instead of flagging the beach', () => {
    // The reef clip: a likely hammerhead, 3.5 m, 8.6 km out, no people in sight.
    const far = assessRisk(shark({ species: 'hammerhead shark', meters: 3.5, distanceToShoreM: 8600 }))!;
    expect(far.score).toBe(3);
    expect(far.level).toBe('advisory');
    expect(far.recipients).toEqual([]);
    expect(far.reasons.at(-1)).toBe('capped at advisory: 8.6 km offshore with nobody within 100 m');
    // The same shark near the beach, or offshore beside a swimmer or diver, still raises the flag.
    expect(assessRisk(shark({ species: 'hammerhead shark', meters: 3.5, distanceToShoreM: 400 }))!.level).toBe('warning');
    expect(assessRisk(shark({ species: 'hammerhead shark', meters: 3.5, distanceToShoreM: 8600, nearestPersonM: 20 }))!.level).toBe('warning');
  });

  it('adds a point when the shark is closing on the shore', () => {
    const base = assessRisk(shark({ species: 'lemon shark', meters: 2 }))!;
    const closing = assessRisk(shark({ species: 'lemon shark', meters: 2, shoreApproachMps: 0.4 }))!;
    expect(closing.score).toBe(base.score + 1);
  });
});
