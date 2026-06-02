/**
 * Gets the Anthropic API key.
 * Falls back to reading .env directly because a system-level ANTHROPIC_API_KEY=''
 * can override the .env file value in process.env.
 */
import fs   from 'fs';
import path from 'path';

let _cached = null;

export function getAnthropicKey() {
  if (_cached) return _cached;

  // Try system env first (non-empty)
  const sysKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (sysKey) { _cached = sysKey; return _cached; }

  // Fallback: read directly from .env file
  try {
    const envFile = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
    const match   = envFile.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    const fileKey = match?.[1]?.trim();
    if (fileKey) { _cached = fileKey; return _cached; }
  } catch {}

  return null;
}
