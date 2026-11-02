import { describe, expect, it } from 'vitest';
import type { AlertJson } from '../src/shared/alerts.ts';
import { assessRisk } from '../src/shared/risk.ts';
import { capTime, renderCap } from '../src/server/alerts/cap.ts';
import { headlineFor, summaryFor, telegramHtml, templateMessage, type IncidentFacts } from '../src/server/alerts/templates.ts';
import type { TrackSummary } from '../src/shared/events.ts';

const track = {
  id: 'T3', kind: 'animal', lifecycle: 'active', verdict: 'shark', concepts: ['shark'], firstFrame: 0, lastFrame: 40, framesSeen: 40,
  verification: { is_shark: true, label: 'shark', confidence: 0.94, species_guess: 'tiger shark', species_confidence: 'medium', behavior: '', evidence: [], latencyMs: 0 },
  length: { meters: 3.4, low: 2.7, high: 4.5, sizeClass: 'large' }, nearestPersonM: 6.2, inSwimZone: true, distanceToShoreM: 24,
} as TrackSummary;
const risk = assessRisk(track)!;

const facts: IncidentFacts = {
  level: risk.level, sharkCount: 2, species: 'Tiger shark', lengthM: 3.4, nearestPersonM: 6.2, inSwimZone: true, distanceToShoreM: 24,
  locationName: 'Miami Beach, FL (simulated patrol)', lat: 25.790696, lon: -80.126474, risk,
};

const alert: AlertJson = {
  id: 'A1', version: 1, sessionId: 'clip-g-live-x', clipId: 'clip-g-capistrano', level: 'critical', msgType: 'Alert',
  headline: headlineFor(facts), summary: summaryFor(facts), recommendation: risk.recommendation, beachAction: 'clear_water', risk,
  sharkCount: 2, trackIds: ['T3', 'T5'], location: { lat: facts.lat, lon: facts.lon, name: facts.locationName },
  drafter: 'template', recipients: [], status: 'sent', createdAt: '2026-10-31T14:02:03.123Z', sessionT: 12.4,
};

describe('alert wording', () => {
  it('builds headlines and summaries from measured facts only', () => {
    expect(headlineFor(facts)).toBe('CRITICAL: sharks near swimmers at Miami Beach, FL');
    expect(summaryFor(facts)).toBe('2 sharks (largest risk: tiger shark, about 3.4 m) confirmed by drone, 6.2 m from the nearest person, inside the swim zone, 24 m from shore.');
    expect(templateMessage('lifeguards', facts)).toContain('Clear swimmers from the water');
    expect(templateMessage('coastal_security', facts)).toContain('Exercise; simulated.');
  });

  it('escapes Telegram HTML and always marks the exercise', () => {
    const html = telegramHtml({ level: 'critical', headline: 'A <b>&', message: 'm', recommendation: 'r', recipients: ['lifeguards'], lat: 1, lon: 2 });
    expect(html).toContain('A &lt;b&gt;&amp;');
    expect(html).toContain('simulated alert, not a real emergency');
  });
});

describe('CAP 1.2', () => {
  const xml = renderCap(alert);

  it('has the required alert elements, in schema order, marked as an exercise', () => {
    const order = ['identifier', 'sender', 'sent', 'status', 'msgType', 'scope', 'restriction', 'note', 'info'];
    const positions = order.map((tag) => xml.indexOf(`<${tag}>`));
    expect(positions.every((p) => p > 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(xml).toContain('xmlns="urn:oasis:names:tc:emergency:cap:1.2"');
    expect(xml).toContain('<status>Exercise</status>');
    expect(xml).toContain('<severity>Severe</severity>');
    expect(xml).toContain('<responseType>Evacuate</responseType>');
    expect(xml).toContain('<circle>25.79070,-80.12647 0.2</circle>');
  });

  it('uses CAP timestamps and references the original on the all-clear', () => {
    expect(capTime('2026-10-31T14:02:03.123Z')).toBe('2026-10-31T14:02:03+00:00');
    const cancel = renderCap(alert, { msgType: 'Cancel', sent: '2026-10-31T14:10:00.000Z', references: { id: 'sharkwatch-clip-g-live-x-A1', sent: alert.createdAt } });
    expect(cancel).toContain('<msgType>Cancel</msgType>');
    expect(cancel).toContain('<references>sharkwatch@exercise.invalid,sharkwatch-clip-g-live-x-A1,2026-10-31T14:02:03+00:00</references>');
    expect(cancel).toContain('<responseType>AllClear</responseType>');
    expect(cancel).toContain('<identifier>sharkwatch-clip-g-live-x-A1-cancel</identifier>');
  });

  it('escapes text content', () => {
    expect(renderCap({ ...alert, summary: 'Rays & <sharks>' })).toContain('<description>Rays &amp; &lt;sharks&gt;</description>');
  });
});
