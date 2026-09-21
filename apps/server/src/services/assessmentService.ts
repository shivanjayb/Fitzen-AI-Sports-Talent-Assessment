import {
  detectTampering,
  type AuditEntry,
  type SignedAssessment,
} from '@fitzen/engines';
import type { Database } from '../db.ts';
import { HttpError } from '../http/router.ts';
import { newId } from '../util/id.ts';
import type {
  AssessmentEnvelope,
  AssessmentPayload,
  AssessmentRecord,
  Integrity,
  SignedMetrics,
} from '../domain/types.ts';

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : NaN;
}

function coerceMetrics(m: unknown): SignedMetrics {
  if (typeof m !== 'object' || m === null) {
    throw new HttpError(400, 'metrics missing from signed payload');
  }
  const o = m as Record<string, unknown>;
  return {
    jumpHeightM: num(o.jumpHeightM) || 0,
    jumpHeightCiLow: num(o.jumpHeightCiLow) || 0,
    jumpHeightCiHigh: num(o.jumpHeightCiHigh) || 0,
    flightTimeS: num(o.flightTimeS) || 0,
    peakPowerW: num(o.peakPowerW) || 0,
    relativePowerWkg: num(o.relativePowerWkg) || 0,
    symmetryScore: num(o.symmetryScore) || 0,
    movementQuality: num(o.movementQuality) || 0,
    confidence: num(o.confidence) || 0,
    effectiveFps: num(o.effectiveFps) || 30,
    countermovementDepth: num(o.countermovementDepth) || 0,
    qualityFlags: Array.isArray(o.qualityFlags)
      ? o.qualityFlags.filter((x): x is string => typeof x === 'string')
      : [],
    validReps: typeof o.validReps === 'number' ? o.validReps : undefined,
    totalAttempts: typeof o.totalAttempts === 'number' ? o.totalAttempts : undefined,
    formAccuracyPercent: typeof o.formAccuracyPercent === 'number' ? o.formAccuracyPercent : undefined,
    avgAsymmetryDeg: typeof o.avgAsymmetryDeg === 'number' ? o.avgAsymmetryDeg : undefined,
  };
}

export function parseEnvelope(body: unknown, athleteId: string): AssessmentEnvelope {
  if (typeof body !== 'object' || body === null) {
    throw new HttpError(400, 'Expected an assessment envelope');
  }
  const o = body as Record<string, unknown>;
  const signed = o.signed as SignedAssessment<AssessmentPayload> | undefined;
  if (!signed || typeof signed !== 'object' || typeof signed.payload !== 'object') {
    throw new HttpError(400, 'Envelope is missing the signed payload');
  }
  if (typeof signed.signature !== 'string' || typeof signed.payloadHash !== 'string') {
    throw new HttpError(400, 'Signed payload is missing signature or hash');
  }
  const payload = signed.payload;
  if (typeof payload.clientId !== 'string' || payload.clientId.length < 8) {
    throw new HttpError(400, 'payload.clientId is required');
  }
  if (payload.athleteId !== athleteId) {
    throw new HttpError(403, 'Assessment athleteId does not match the authenticated athlete');
  }
  coerceMetrics(payload.metrics);
  const auditTrail = Array.isArray(o.auditTrail) ? (o.auditTrail as AuditEntry[]) : [];
  return { signed, auditTrail };
}

export async function evaluateIntegrity(
  envelope: AssessmentEnvelope,
): Promise<{ integrity: Integrity; reasons: string[] }> {
  const report = await detectTampering(
    envelope.signed as unknown as SignedAssessment<Record<string, unknown>>,
    envelope.auditTrail,
  );
  if (report.tampered) {
    return { integrity: 'tampered', reasons: report.reasons };
  }
  return { integrity: 'verified', reasons: [] };
}

interface UpsertResult {
  record: AssessmentRecord;
  created: boolean;
}

export async function ingestAssessment(
  db: Database,
  athleteId: string,
  body: unknown,
): Promise<UpsertResult> {
  const envelope = parseEnvelope(body, athleteId);
  const payload = envelope.signed.payload;

  const existing = await db.findAssessmentByClient(athleteId, payload.clientId);
  if (existing) {
    const record = await getAssessment(db, existing.id);
    return { record: record!, created: false };
  }

  const { integrity, reasons } = await evaluateIntegrity(envelope);
  const metrics = payload.metrics;
  const id = newId('asm');
  const createdAt = new Date().toISOString();

  await db.insertAssessment({
    id,
    client_id: payload.clientId,
    athlete_id: athleteId,
    test: payload.test,
    captured_at: payload.capturedAt,
    created_at: createdAt,
    jump_height_m: metrics.jumpHeightM,
    jump_height_ci_low: metrics.jumpHeightCiLow,
    jump_height_ci_high: metrics.jumpHeightCiHigh,
    flight_time_s: metrics.flightTimeS,
    peak_power_w: metrics.peakPowerW,
    relative_power_wkg: metrics.relativePowerWkg,
    symmetry_score: metrics.symmetryScore,
    movement_quality: metrics.movementQuality,
    confidence: metrics.confidence,
    metrics_json: typeof metrics === 'string' ? metrics : JSON.stringify(metrics),
    envelope_json: typeof envelope === 'string' ? envelope : JSON.stringify(envelope),
    integrity,
    integrity_reasons_json: JSON.stringify(reasons),
  });

  const record = await getAssessment(db, id);
  return { record: record!, created: true };
}

function rowToRecord(row: Record<string, unknown>): AssessmentRecord {
  const envRaw = row.envelope_json;
  const envelope = typeof envRaw === 'string' ? JSON.parse(envRaw) : envRaw as AssessmentEnvelope;
  const metRaw = row.metrics_json;
  const metrics = typeof metRaw === 'string' ? JSON.parse(metRaw) : metRaw as SignedMetrics;
  const reasRaw = row.integrity_reasons_json;
  const reasons = typeof reasRaw === 'string' ? JSON.parse(reasRaw) : (reasRaw as string[]) || [];

  return {
    id: String(row.id),
    clientId: String(row.client_id),
    athleteId: String(row.athlete_id),
    test: String(row.test),
    capturedAt: String(row.captured_at),
    createdAt: String(row.created_at),
    metrics,
    integrity: String(row.integrity) as Integrity,
    integrityReasons: reasons,
    keyFingerprint: envelope?.signed?.keyFingerprint ?? 'unknown',
  };
}

export async function getAssessment(db: Database, id: string): Promise<AssessmentRecord | null> {
  const row = await db.getAssessment(id);
  return row ? rowToRecord(row) : null;
}

export async function listAssessments(db: Database, athleteId: string, limit = 100): Promise<AssessmentRecord[]> {
  const rows = await db.listAssessments(athleteId, limit);
  return rows.map(rowToRecord);
}

export async function reverifyAssessment(
  db: Database,
  id: string,
): Promise<{ integrity: Integrity; reasons: string[]; auditValid: boolean } | null> {
  const row = await db.getAssessment(id);
  if (!row) return null;
  const record = rowToRecord(row);
  const envRaw = row.envelope_json;
  const envelope = typeof envRaw === 'string' ? JSON.parse(envRaw) : envRaw as AssessmentEnvelope;
  const report = await detectTampering(
    envelope.signed as unknown as SignedAssessment<Record<string, unknown>>,
    envelope.auditTrail,
  );
  const integrity: Integrity = report.tampered ? 'tampered' : 'verified';
  await db.updateAssessmentIntegrity(id, integrity, report.reasons);
  return {
    integrity,
    reasons: report.reasons,
    auditValid: report.audit?.valid ?? true,
  };
}
