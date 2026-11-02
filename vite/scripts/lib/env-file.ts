// Reads and updates .env files without disturbing their comments, order or other settings.

/** The value of `name` in a .env text (unquoted), or undefined when unset or empty. */
export function readEnvValue(text: string, name: string): string | undefined {
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (match?.[1] !== name) continue;
    const value = unquote(match[2]!.trim());
    return value ? value : undefined;
  }
  return undefined;
}

/**
 * Sets each `name=value` in a .env text: replaces the first assignment of a name in place and
 * appends names it doesn't have. Every other line is kept as it was.
 */
export function setEnvValues(text: string, values: Record<string, string>): string {
  const lines = text.split(/\r?\n/);
  const pending = new Map(Object.entries(values));
  const out = lines.map((line) => {
    const name = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
    if (!name || !pending.has(name)) return line;
    const value = pending.get(name)!;
    pending.delete(name);
    return `${name}=${value}`;
  });
  while (out.length && out.at(-1) === '') out.pop();
  for (const [name, value] of pending) out.push(`${name}=${value}`);
  return `${out.join('\n')}\n`;
}

/** Strips whitespace and one layer of matching quotes from a pasted value. */
export function cleanPastedValue(raw: string): string {
  return unquote(raw.trim()).trim();
}

/** Shows only enough of a secret to recognise it: `LLM_…a1b2`. */
export function maskSecret(secret: string): string {
  if (secret.length <= 8) return '…';
  return `${secret.slice(0, 4)}…${secret.slice(-4)}`;
}

function unquote(value: string): string {
  const first = value[0];
  return value.length >= 2 && (first === '"' || first === "'") && value.at(-1) === first ? value.slice(1, -1) : value;
}
