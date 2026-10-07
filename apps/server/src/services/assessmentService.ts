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

/** Validate in place: changing a signed payload would invalidate its signature. */
function validateMetrics(m: unknown): void {
  if (typeof m !== 'object' || m === null || Array.isArray(m)) throw new HttpError(400, 'metrics missing from signed payload');
  const o = m as Record<string, unknown>;
  for (const key of ['jumpHeightM', 'jumpHeightCiLow', 'jumpHeightCiHigh', 'flightTimeS', 'peakPowerW', 'relativePowerWkg', 'symmetryScore', 'movementQuality', 'confidence', 'effectiveFps', 'countermovementDepth']) {
    if (typeof o[key] !== 'number' || !Number.isFinite(o[key])) throw new HttpError(400, `metrics.${key} must be a finite number`);
  }
  for (const key of ['validReps', 'totalAttempts', 'formAccuracyPercent', 'avgAsymmetryDeg']) {
    if (o[key] !== undefined && (typeof o[key] !== 'number' || !Number.isFinite(o[key]))) throw new HttpError(400, `metrics.${key} must be a finite number`);
  }
  if (!Array.isArray(o.qualityFlags) || o.qualityFlags.some((x) => typeof x !== 'string')) throw new HttpError(400, 'metrics.qualityFlags must be a string array');
}

export function parseEnvelope(body: unknown, athleteId: string): AssessmentEnvelope {
  if (typeof body !== 'object' || body === null) {
    throw new HttpError(400, 'Expected an assessment envelope');
  }
  const o = body as Record<string, unknown>;
  const signed = o.signed as SignedAssessment<AssessmentPayload> | undefined;
  if (!signed || typeof signed !== 'object' || typeof signed.payload !== 'object' || signed.payload === null || Array.isArray(signed.payload)) {
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
  if (typeof payload.test !== 'string' || !payload.test.trim() || payload.test.length > 60) throw new HttpError(400, 'payload.test is required');
  if (typeof payload.capturedAt !== 'string' || !Number.isFinite(Date.parse(payload.capturedAt))) throw new HttpError(400, 'payload.capturedAt must be a valid timestamp');
  validateMetrics(payload.metrics);
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
