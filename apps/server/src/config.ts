import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', '..', '..', 'data');

function devSecret(): string {
  const secretPath = join(dataDir, '.dev-jwt-secret');
  try {
    const existing = readFileSync(secretPath, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch { /* first run */ }
  const fresh = randomBytes(32).toString('hex');
  try {
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(secretPath, fresh, { mode: 0o600 });
  } catch { /* fall back to per-process secret */ }
  return fresh;
}

export interface AppConfig {
  port: number;
  host: string;
  jwtSecret: string;
  jwtTtlSeconds: number;
  supabaseUrl: string;
  supabaseKey: string;
  corsOrigins: string[];
}

function envOr(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.length > 0 ? v : fallback;
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const jwtSecret = overrides.jwtSecret ?? process.env.FITZEN_JWT_SECRET;
  if (process.env.NODE_ENV === 'production' && (!jwtSecret || jwtSecret.length < 32)) {
    throw new Error('FITZEN_JWT_SECRET must contain at least 32 characters in production.');
  }
  // Legacy persistence is server-only; never fall back to an embedded project or a client anon key.
  const isTest = process.env.NODE_ENV === 'test';
  const supabaseUrl = overrides.supabaseUrl ?? process.env.SUPABASE_URL ?? (isTest ? 'https://test.supabase.invalid' : '');
  const supabaseKey = overrides.supabaseKey ?? process.env.SUPABASE_SECRET_KEY ?? (isTest ? 'test-only-key' : '');
  if (!supabaseUrl || !supabaseKey) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY must be configured for the legacy server.');

  return {
    port: Number(envOr('FITZEN_PORT', '4000')),
    host: envOr('FITZEN_HOST', '0.0.0.0'),
    jwtSecret: jwtSecret ?? (isTest ? randomBytes(32).toString('hex') : devSecret()),
    jwtTtlSeconds: Number(envOr('FITZEN_JWT_TTL', String(60 * 60 * 24 * 7))),
    supabaseUrl,
    supabaseKey,
    corsOrigins: envOr('FITZEN_CORS_ORIGINS', 'http://localhost:5173,http://localhost:4173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    ...overrides,
  };
}
