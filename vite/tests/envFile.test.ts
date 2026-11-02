import { describe, expect, it } from 'vitest';
import { cleanPastedValue, maskSecret, readEnvValue, setEnvValues } from '../scripts/lib/env-file.ts';

const example = '# Meta key\nMODEL_API_KEY=\n\n# Telegram\nTELEGRAM_BOT_TOKEN=\nPORT=8787\n';

describe('.env helpers', () => {
  it('sets values in place, keeping comments, order and other settings', () => {
    const out = setEnvValues(example, { MODEL_API_KEY: 'LLM_abc123' });
    expect(out).toBe('# Meta key\nMODEL_API_KEY=LLM_abc123\n\n# Telegram\nTELEGRAM_BOT_TOKEN=\nPORT=8787\n');
    expect(readEnvValue(out, 'MODEL_API_KEY')).toBe('LLM_abc123');
    expect(readEnvValue(out, 'TELEGRAM_BOT_TOKEN')).toBeUndefined();
  });

  it('appends settings the file lacks and can clear one', () => {
    const out = setEnvValues('PORT=9000\n', { MODEL_API_KEY: 'LLM_x', TELEGRAM_BOT_TOKEN: '' });
    expect(out).toBe('PORT=9000\nMODEL_API_KEY=LLM_x\nTELEGRAM_BOT_TOKEN=\n');
    expect(readEnvValue(setEnvValues(out, { MODEL_API_KEY: '' }), 'MODEL_API_KEY')).toBeUndefined();
  });

  it('cleans pasted values and never shows a whole secret', () => {
    expect(cleanPastedValue('  "LLM_abc"  ')).toBe('LLM_abc');
    expect(readEnvValue("MODEL_API_KEY='LLM_q'\r\n", 'MODEL_API_KEY')).toBe('LLM_q');
    expect(maskSecret('LLM_1234567890abcd')).toBe('LLM_…abcd');
    expect(maskSecret('short')).toBe('…');
  });
});
