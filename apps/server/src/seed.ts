import {
  analyzeJump,
  appendAuditEntry,
  generateAssessmentKeyPair,
  signAssessment,
  simulateJump,
  type AuditEntry,
} from '@fitzen/engines';
import { loadConfig } from './config.ts';
import { openDatabase } from './db.ts';
import { createUser, findUserByEmail, upsertProfile } from './services/userService.ts';
import { ingestAssessment } from './services/assessmentService.ts';
import { awardBadges, computeAthleteStats } from './services/statsService.ts';
import { pushNotification } from './services/notificationService.ts';
import type { AssessmentPayload, SignedMetrics } from './domain/types.ts';

const config = loadConfig();
const db = openDatabase(config.supabaseUrl, config.supabaseKey, true);

interface SeedAthlete {
  email: string;
  name: string;
  sex: 'male' | 'female';
  birthDate: string;
  heightCm: number;
  massKg: number;
  sport: string;
  region: string;
  baseJump: number;
  sessions: number;
}

const ATHLETES: SeedAthlete[] = [
  { email: 'arjun@fitzen.demo', name: 'Arjun Mehta', sex: 'male', birthDate: '2010-03-14', heightCm: 168, massKg: 56, sport: 'Basketball', region: 'Maharashtra', baseJump: 0.42, sessions: 9 },
  { email: 'priya@fitzen.demo', name: 'Priya Sharma', sex: 'female', birthDate: '2011-07-22', heightCm: 158, massKg: 48, sport: 'Volleyball', region: 'Karnataka', baseJump: 0.35, sessions: 7 },
  { email: 'kabir@fitzen.demo', name: 'Kabir Singh', sex: 'male', birthDate: '2008-11-02', heightCm: 179, massKg: 70, sport: 'Athletics', region: 'Punjab', baseJump: 0.55, sessions: 11 },
  { email: 'ananya@fitzen.demo', name: 'Ananya Rao', sex: 'female', birthDate: '2009-05-18', heightCm: 165, massKg: 54, sport: 'Long Jump', region: 'Telangana', baseJump: 0.44, sessions: 8 },
  { email: 'dev@fitzen.demo', name: 'Dev Patel', sex: 'male', birthDate: '2012-01-30', heightCm: 152, massKg: 42, sport: 'Football', region: 'Gujarat', baseJump: 0.30, sessions: 5 },
  { email: 'ishita@fitzen.demo', name: 'Ishita Verma', sex: 'female', birthDate: '2010-09-09', heightCm: 161, massKg: 51, sport: 'Basketball', region: 'Maharashtra', baseJump: 0.38, sessions: 6 },
];

const PASSWORD = 'fitzen-demo-2026';

async function ensureUser(email: string, name: string, role: 'athlete' | 'coach' | 'admin') {
  const existing = await findUserByEmail(db, email);
  if (existing) return { id: existing.id, created: false };
  const user = await createUser(db, { email, password: PASSWORD, name, role });
  return { id: user.id, created: true };
}

async function seedAthlete(seed: SeedAthlete, coachId: string): Promise<void> {
  const { id: athleteId, created } = await ensureUser(seed.email, seed.name, 'athlete');
  if (!created) {
    console.log(`  = ${seed.name} already exists, skipping`);
    return;
  }
  await upsertProfile(db, athleteId, {
    sex: seed.sex,
    birthDate: seed.birthDate,
    heightCm: seed.heightCm,
    massKg: seed.massKg,
    sport: seed.sport,
    region: seed.region,
    coachId,
  });

  const keys = await generateAssessmentKeyPair();
  const before = await computeAthleteStats(db, athleteId);

  for (let session = 0; session < seed.sessions; session++) {
    const daysAgo = (seed.sessions - session) * 4 + (session % 3);
    const capturedAt = new Date(Date.now() - daysAgo * 24 * 3600 * 1000).toISOString();
    const trueHeight = seed.baseJump + session * 0.006 + ((session * 7919) % 10) * 0.003 - 0.012;

    const frames = simulateJump({
      jumpHeightM: Math.max(0.15, trueHeight),
      athleteHeightCm: seed.heightCm,
      fps: 30,
      asymmetry: 0.05 + ((session * 31) % 5) * 0.03,
      seed: session * 101 + seed.heightCm,
    });
    const analysis = analyzeJump(frames, { heightCm: seed.heightCm, massKg: seed.massKg });
    if (!analysis.ok) {
      console.warn(`  ! session ${session} for ${seed.name} failed analysis: ${analysis.reason}`);
      continue;
    }
    const m = analysis.metrics;
    const metrics: SignedMetrics = {
      jumpHeightM: Math.round(m.jumpHeight.value * 1000) / 1000,
      jumpHeightCiLow: Math.round(m.jumpHeight.ci95[0] * 1000) / 1000,
      jumpHeightCiHigh: Math.round(m.jumpHeight.ci95[1] * 1000) / 1000,
      flightTimeS: Math.round(m.flightTime.value * 1000) / 1000,
      peakPowerW: m.peakPowerW,
      relativePowerWkg: m.relativePowerWkg,
      symmetryScore: m.symmetryScore,
      movementQuality: m.movementQuality,
      confidence: m.confidence,
      effectiveFps: m.effectiveFps,
      countermovementDepth: m.countermovementDepth,
      qualityFlags: m.qualityFlags,
    };
    const payload: AssessmentPayload = {
      clientId: `seed-${athleteId}-${session}`,
      athleteId,
      test: 'vertical_jump',
      capturedAt,
      metrics,
    };
    const signed = await signAssessment(payload, keys, capturedAt);
    let trail: AuditEntry[] = [];
    trail = await appendAuditEntry(trail, 'captured', { frames: frames.length, fps: 30 }, capturedAt);
    trail = await appendAuditEntry(trail, 'analyzed', { jumpHeightM: metrics.jumpHeightM }, capturedAt);
    trail = await appendAuditEntry(trail, 'signed', { keyFingerprint: signed.keyFingerprint }, capturedAt);

    await ingestAssessment(db, athleteId, { signed, auditTrail: trail });
  }

  const earned = await awardBadges(db, athleteId, before);
  await pushNotification(db, athleteId, 'welcome', 'Welcome to Fitzen',
    'Your training history has been imported. Run a new assessment to keep the streak going.');
  console.log(`  + ${seed.name}: ${seed.sessions} sessions, ${earned.length} badges`);
}

async function main() {
  console.log('Seeding Fitzen demo data…');
  await ensureUser('admin@fitzen.demo', 'Fitzen Admin', 'admin');
  const coach = await ensureUser('coach@fitzen.demo', 'Coach Meera Nair', 'coach');
  for (const athlete of ATHLETES) {
    await seedAthlete(athlete, coach.id);
  }
  console.log('\nDemo accounts (password for all: ' + PASSWORD + ')');
  console.log('  athlete: arjun@fitzen.demo   coach: coach@fitzen.demo   admin: admin@fitzen.demo');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
