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
  const jwtSecret = process.env.FITZEN_JWT_SECRET;
  if (!jwtSecret && process.env.NODE_ENV === 'production') {
    throw new Error('FITZEN_JWT_SECRET must be set in production.');
  }
  const supabaseUrl = envOr(
    'SUPABASE_URL',
    envOr('VITE_SUPABASE_URL', 'https://hfcodbbwiidrehbjwhmg.supabase.co')
  );
  const supabaseKey = envOr(
    'SUPABASE_SECRET_KEY',
    envOr(
      'SUPABASE_ANON_KEY',
      envOr(
        'VITE_SUPABASE_ANON_KEY',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmY29kYmJ3aWlkcmVoYmp3aG1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NTYzODUsImV4cCI6MjEwNTEzMjM4NX0.3x4ykChTmPJJT1n3HymIrwdg95TOGbaOTIqwd5nlkbY'
      )
    )
  );

  return {
    port: Number(envOr('FITZEN_PORT', '4000')),
    host: envOr('FITZEN_HOST', '0.0.0.0'),
    jwtSecret: jwtSecret ?? devSecret(),
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
