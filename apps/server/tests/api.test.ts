import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import {
  analyzeJump,
  appendAuditEntry,
  generateAssessmentKeyPair,
  signAssessment,
  simulateJump,
  type AssessmentKeyPair,
  type AuditEntry,
} from '@fitzen/engines';
import { createApp, type FitzenApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';

let app: FitzenApp;
let baseUrl: string;

beforeAll(async () => {
  const config = loadConfig({ port: 0, supabaseUrl: 'https://test.supabase.co' });
  app = createApp(config);
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const address = app.server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    app.server.close((err) => (err ? reject(err) : resolve())),
  );
});

async function api(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

/** Build a genuine signed assessment envelope via the real pipeline. */
async function buildEnvelope(
  athleteId: string,
  keys: AssessmentKeyPair,
  clientId: string,
  jumpHeightM = 0.45,
) {
  const frames = simulateJump({ jumpHeightM, athleteHeightCm: 175, fps: 30, seed: 5 });
  const analysis = analyzeJump(frames, { heightCm: 175, massKg: 68 });
  if (!analysis.ok) throw new Error('simulated jump failed analysis');
  const m = analysis.metrics;
  const payload = {
    clientId,
    athleteId,
    test: 'vertical_jump',
    capturedAt: new Date().toISOString(),
    metrics: {
      jumpHeightM: m.jumpHeight.value,
      jumpHeightCiLow: m.jumpHeight.ci95[0],
      jumpHeightCiHigh: m.jumpHeight.ci95[1],
      flightTimeS: m.flightTime.value,
      peakPowerW: m.peakPowerW,
      relativePowerWkg: m.relativePowerWkg,
      symmetryScore: m.symmetryScore,
      movementQuality: m.movementQuality,
      confidence: m.confidence,
      effectiveFps: m.effectiveFps,
      countermovementDepth: m.countermovementDepth,
      qualityFlags: m.qualityFlags,
    },
  };
  const signed = await signAssessment(payload, keys);
  let trail: AuditEntry[] = [];
  trail = await appendAuditEntry(trail, 'captured', { frames: frames.length });
  trail = await appendAuditEntry(trail, 'signed', { hash: signed.payloadHash });
  return { signed, auditTrail: trail };
}

describe('Fitzen API', () => {
  let athleteToken = '';
  let athleteId = '';
  let keys: AssessmentKeyPair;

  it('registers an athlete and returns a token', async () => {
    const { status, json } = await api('POST', '/api/auth/register', {
      email: 'test@example.com',
      password: 'super-secret-1',
      name: 'Test Athlete',
    });
    expect(status).toBe(201);
    expect(json.token).toBeTruthy();
    expect(json.user.role).toBe('athlete');
    athleteToken = json.token;
    athleteId = json.user.id;
    keys = await generateAssessmentKeyPair();
  });

  it('rejects duplicate registration', async () => {
    const { status } = await api('POST', '/api/auth/register', {
      email: 'test@example.com',
      password: 'super-secret-1',
      name: 'Dup',
    });
    expect(status).toBe(409);
  });

  it('rejects login with a wrong password', async () => {
    const { status } = await api('POST', '/api/auth/login', {
      email: 'test@example.com',
      password: 'wrong-password',
    });
    expect(status).toBe(401);
  });

  it('logs in with correct credentials', async () => {
    const { status, json } = await api('POST', '/api/auth/login', {
      email: 'test@example.com',
      password: 'super-secret-1',
    });
    expect(status).toBe(200);
    expect(json.token).toBeTruthy();
  });

  it('requires auth for protected routes', async () => {
    const { status } = await api('GET', '/api/me');
    expect(status).toBe(401);
  });

  it('saves an athlete profile', async () => {
    const { status, json } = await api('PUT', '/api/me/profile', {
      sex: 'male',
      birthDate: '2010-06-15',
      heightCm: 175,
      massKg: 68,
      sport: 'Basketball',
      region: 'Test Region',
    }, athleteToken);
    expect(status).toBe(200);
    expect(json.profile.heightCm).toBe(175);
  });

  it('accepts a genuinely signed assessment and verifies it', async () => {
    const envelope = await buildEnvelope(athleteId, keys, 'client-001');
    const { status, json } = await api('POST', '/api/assessments', envelope, athleteToken);
    expect(status).toBe(201);
    expect(json.record.integrity).toBe('verified');
    expect(json.record.metrics.jumpHeightM).toBeGreaterThan(0.3);
    expect(json.newBadges).toContain('first-jump');
  });

  it('is idempotent on duplicate clientId (offline sync retry)', async () => {
    const envelope = await buildEnvelope(athleteId, keys, 'client-001');
    const { status, json } = await api('POST', '/api/assessments', envelope, athleteToken);
    expect(status).toBe(200);
    expect(json.created).toBe(false);
  });

  it('flags a tampered assessment (edited after signing)', async () => {
    const envelope = await buildEnvelope(athleteId, keys, 'client-tampered');
    // Attacker edits the jump height after signing.
    (envelope.signed.payload.metrics as { jumpHeightM: number }).jumpHeightM = 1.2;
    const { status, json } = await api('POST', '/api/assessments', envelope, athleteToken);
    expect(status).toBe(201);
    expect(json.record.integrity).toBe('tampered');
    expect(json.record.integrityReasons.length).toBeGreaterThan(0);
  });

  it('excludes tampered assessments from the leaderboard', async () => {
    const { json } = await api('GET', '/api/leaderboard', undefined, athleteToken);
    const me = json.leaderboard.find((e: { athleteId: string }) => e.athleteId === athleteId);
    expect(me).toBeTruthy();
    // Tampered 1.2m jump must not be the ranked best.
    expect(me.bestJumpHeightM).toBeLessThan(1.0);
  });

  it('rejects an assessment claiming another athlete id', async () => {
    const envelope = await buildEnvelope('usr_someone-else', keys, 'client-foreign');
    const { status } = await api('POST', '/api/assessments', envelope, athleteToken);
    expect(status).toBe(403);
  });

  it('batch-syncs offline assessments idempotently', async () => {
    const a = await buildEnvelope(athleteId, keys, 'offline-1', 0.4);
    const b = await buildEnvelope(athleteId, keys, 'offline-2', 0.48);
    const { status, json } = await api('POST', '/api/sync', { assessments: [a, b, a] }, athleteToken);
    expect(status).toBe(200);
    expect(json.results.map((r: { status: string }) => r.status)).toEqual([
      'created', 'created', 'duplicate',
    ]);
  });

  it('returns stats and an explainable potential score', async () => {
    const { status, json } = await api('GET', '/api/stats/me', undefined, athleteToken);
    expect(status).toBe(200);
    expect(json.stats.assessmentCount).toBeGreaterThanOrEqual(3);
    expect(json.potential.potentialScore).toBeGreaterThan(0);
    expect(json.potential.insights.length).toBeGreaterThan(0);
  });

  it('re-verifies a stored assessment on demand', async () => {
    const list = await api('GET', '/api/assessments', undefined, athleteToken);
    const id = list.json.assessments[0].id;
    const { status, json } = await api('POST', `/api/assessments/${id}/verify`, {}, athleteToken);
    expect(status).toBe(200);
    expect(['verified', 'tampered']).toContain(json.integrity);
  });

  it('serves badges with progress', async () => {
    const { json } = await api('GET', '/api/badges/me', undefined, athleteToken);
    const first = json.badges.find((b: { id: string }) => b.id === 'first-jump');
    expect(first.earned).toBe(true);
  });

  it('delivers notifications (welcome + badge)', async () => {
    const { json } = await api('GET', '/api/notifications', undefined, athleteToken);
    expect(json.notifications.length).toBeGreaterThanOrEqual(2);
    const kinds = json.notifications.map((n: { kind: string }) => n.kind);
    expect(kinds).toContain('badge');
  });

  it('produces an AI coaching brief (deterministic fallback offline)', async () => {
    const { status, json } = await api('GET', '/api/ai/brief', undefined, athleteToken);
    expect(status).toBe(200);
    expect(['claude', 'deterministic']).toContain(json.brief.source);
    expect(json.brief.brief.length).toBeGreaterThan(40);
    expect(json.brief.focusAreas.length).toBeGreaterThan(0);
  });

  it('enforces role boundaries (athlete cannot access admin)', async () => {
    const { status } = await api('GET', '/api/admin/overview', undefined, athleteToken);
    expect(status).toBe(403);
  });

  it('updates settings and respects leaderboard opt-out', async () => {
    const upd = await api('PUT', '/api/me/settings', {
      theme: 'dark', units: 'metric', notificationsEnabled: true, leaderboardOptIn: false,
    }, athleteToken);
    expect(upd.status).toBe(200);
    const { json } = await api('GET', '/api/leaderboard', undefined, athleteToken);
    const me = json.leaderboard.find((e: { athleteId: string }) => e.athleteId === athleteId);
    expect(me).toBeUndefined();
    // Restore for later tests.
    await api('PUT', '/api/me/settings', {
      theme: 'dark', units: 'metric', notificationsEnabled: true, leaderboardOptIn: true,
    }, athleteToken);
  });

  it('registers a coach who can view an athlete summary', async () => {
    const reg = await api('POST', '/api/auth/register', {
      email: 'coach@example.com', password: 'coach-secret-1', name: 'Coach T', role: 'coach',
    });
    expect(reg.status).toBe(201);
    const coachToken = reg.json.token;
    const { status, json } = await api('GET', `/api/coach/athletes/${athleteId}`, undefined, coachToken);
    expect(status).toBe(200);
    expect(json.stats.assessmentCount).toBeGreaterThan(0);
    expect(json.assessments.length).toBeGreaterThan(0);
  });

  it('allows admin to query and calibrate geometric exercise thresholds', async () => {
    // Register Admin
    const regAdmin = await api('POST', '/api/auth/register', {
      email: 'admin_test@example.com', password: 'admin-secret-1', name: 'Admin Test', role: 'admin',
    });
    const adminToken = regAdmin.json.token;

    // 1. GET thresholds
    const getRes = await api('GET', '/api/admin/thresholds', undefined, adminToken);
    expect(getRes.status).toBe(200);
    expect(getRes.json.thresholds.pushup.downAngleThreshold).toBe(90);

    // 2. PUT updated thresholds for pushup (downAngleThreshold = 85, maxAsymmetry = 12)
    const putRes = await api('PUT', '/api/admin/thresholds', {
      exercise: 'pushup',
      downAngleThreshold: 85,
      upAngleThreshold: 165,
      maxAsymmetryDeg: 12,
    }, adminToken);
    expect(putRes.status).toBe(200);
    expect(putRes.json.thresholds.pushup.downAngleThreshold).toBe(85);
    expect(putRes.json.thresholds.pushup.maxAsymmetryDeg).toBe(12);
  });
});

