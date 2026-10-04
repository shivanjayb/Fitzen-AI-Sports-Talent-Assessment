import { HttpError } from './router.ts';

/** Tiny runtime validators — enough to keep the API honest without a schema lib. */

export function asObject(v: unknown): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new HttpError(400, 'Expected a JSON object body');
  }
  return v as Record<string, unknown>;
}

export function requireString(obj: Record<string, unknown>, key: string, opts: { max?: number; min?: number } = {}): string {
  const v = obj[key];
  if (typeof v !== 'string') throw new HttpError(400, `Field "${key}" must be a string`);
  const trimmed = v.trim();
  if (opts.min !== undefined && trimmed.length < opts.min) {
    throw new HttpError(400, `Field "${key}" must be at least ${opts.min} characters`);
  }
  if (opts.max !== undefined && trimmed.length > opts.max) {
    throw new HttpError(400, `Field "${key}" must be at most ${opts.max} characters`);
  }
  return trimmed;
}

export function optionalString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string') throw new HttpError(400, `Field "${key}" must be a string`);
  return v.trim();
}

export function requireNumber(obj: Record<string, unknown>, key: string, opts: { min?: number; max?: number } = {}): number {
  const v = obj[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new HttpError(400, `Field "${key}" must be a finite number`);
  }
  if (opts.min !== undefined && v < opts.min) throw new HttpError(400, `Field "${key}" must be ≥ ${opts.min}`);
  if (opts.max !== undefined && v > opts.max) throw new HttpError(400, `Field "${key}" must be ≤ ${opts.max}`);
  return v;
}

export function optionalNumber(obj: Record<string, unknown>, key: string): number | undefined {
  const v = obj[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new HttpError(400, `Field "${key}" must be a finite number`);
  }
  return v;
}

export function requireEnum<T extends string>(
  obj: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T {
  const v = obj[key];
  if (typeof v !== 'string' || !allowed.includes(v as T)) {
    throw new HttpError(400, `Field "${key}" must be one of: ${allowed.join(', ')}`);
  }
  return v as T;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function requireEmail(obj: Record<string, unknown>, key: string): string {
  const v = requireString(obj, key, { max: 254 }).toLowerCase();
  if (!EMAIL_RE.test(v)) throw new HttpError(400, 'A valid email address is required');
  return v;
}
