// Moved from sharkwatch-vite/src/server/alerts/cap.ts (import path adjusted for Next.js).
// CAP 1.2 (OASIS Common Alerting Protocol) rendering, the format emergency systems such as US IPAWS
// exchange. Every message is marked status=Exercise with an exercise note: nothing here is real.

import type { AlertJson } from './alerts';

const SENDER = 'sharkwatch@exercise.invalid';
const SEVERITY = { advisory: 'Minor', warning: 'Moderate', critical: 'Severe' } as const;
const URGENCY = { advisory: 'Expected', warning: 'Immediate', critical: 'Immediate' } as const;
const RESPONSE = { monitor: 'Monitor', warn_swimmers: 'Prepare', clear_water: 'Evacuate', close_beach: 'Avoid' } as const;

export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function capTime(iso: string): string {
  return iso.replace(/\.\d{3}Z$/, 'Z').replace(/Z$/, '+00:00');
}

export interface CapOptions {
  references?: { id: string; sent: string };
  msgType?: 'Alert' | 'Update' | 'Cancel' | 'Ack';
  sent?: string;
}

export function capIdentifier(alert: AlertJson, suffix = ''): string {
  return `sharkwatch-${alert.sessionId}-${alert.id}${suffix}`;
}

export function renderCap(alert: AlertJson, options: CapOptions = {}): string {
  const msgType = options.msgType ?? alert.msgType;
  const sent = capTime(options.sent ?? alert.createdAt);
  const suffix = msgType === 'Alert' || msgType === alert.msgType ? '' : `-${msgType.toLowerCase()}`;
  const references = options.references ? `${SENDER},${options.references.id},${capTime(options.references.sent)}` : undefined;
  const t = (tag: string, value: string | number) => `<${tag}>${escapeXml(String(value))}</${tag}>`;
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">',
    `  ${t('identifier', capIdentifier(alert, suffix))}`,
    `  ${t('sender', SENDER)}`,
    `  ${t('sent', sent)}`,
    `  ${t('status', 'Exercise')}`,
    `  ${t('msgType', msgType)}`,
    `  ${t('scope', 'Restricted')}`,
    `  ${t('restriction', 'Simulated exercise for beach safety authorities; not a real alert')}`,
    `  ${t('note', 'EXERCISE: SharkWatch hackathon demo. Authorities, telemetry and locations are simulated.')}`,
    ...(references ? [`  ${t('references', references)}`] : []),
    '  <info>',
    `    ${t('language', 'en-US')}`,
    `    ${t('category', 'Safety')}`,
    `    ${t('event', 'Shark sighting')}`,
    `    ${t('responseType', msgType === 'Cancel' ? 'AllClear' : RESPONSE[alert.beachAction])}`,
    `    ${t('urgency', msgType === 'Cancel' ? 'Past' : URGENCY[alert.level])}`,
    `    ${t('severity', msgType === 'Cancel' ? 'Minor' : SEVERITY[alert.level])}`,
    `    ${t('certainty', 'Observed')}`,
    `    ${t('senderName', 'SharkWatch drone patrol (simulated)')}`,
    `    ${t('headline', alert.headline.slice(0, 160))}`,
    `    ${t('description', alert.summary)}`,
    `    ${t('instruction', alert.recommendation)}`,
    '    <parameter>',
    `      ${t('valueName', 'SharkCount')}`,
    `      ${t('value', alert.sharkCount)}`,
    '    </parameter>',
    '    <area>',
    `      ${t('areaDesc', alert.location.name)}`,
    `      ${t('circle', `${alert.location.lat.toFixed(5)},${alert.location.lon.toFixed(5)} 0.2`)}`,
    '    </area>',
    '  </info>',
    '</alert>',
  ];
  return `${lines.join('\n')}\n`;
}
