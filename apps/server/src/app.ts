import { createServer, type Server } from 'node:http';
import type { AppConfig } from './config.ts';
import { openDatabase, type Database } from './db.ts';
import { signJwt } from './auth/jwt.ts';
import { authMiddleware, requireRole, requireUser } from './auth/middleware.ts';
import {
  applyCors,
  HttpError,
  json,
  readJsonBody,
  Router,
  type RequestContext,
} from './http/router.ts';
import {
  asObject,
  optionalNumber,
  optionalString,
  requireEmail,
  requireEnum,
  requireNumber,
  requireString,
} from './http/validate.ts';
import {
  getAssessment,
  ingestAssessment,
  listAssessments,
  reverifyAssessment,
} from './services/assessmentService.ts';
import {
  athleteBadges,
  awardBadges,
  computeAthleteStats,
  leaderboard,
  potentialForAthlete,
} from './services/statsService.ts';
import {
  authenticate,
  coachRoster,
  createUser,
  getProfile,
  getUser,
  listUsers,
  upsertProfile,
} from './services/userService.ts';
import {
  listNotifications,
  markAllRead,
  markRead,
  pushNotification,
} from './services/notificationService.ts';
import { generateCoachingBrief } from './services/aiService.ts';
import { BADGE_DEFINITIONS } from '@fitzen/engines';

function ageYears(birthDate: string): number {
  return Math.round(
    ((Date.now() - new Date(birthDate).getTime()) / (365.2425 * 24 * 3600 * 1000)) * 10,
  ) / 10;
}

export interface FitzenApp {
  server: Server;
  db: Database;
}

export function createApp(config: AppConfig): FitzenApp {
  const isTest = process.env.NODE_ENV === 'test' || config.supabaseUrl.includes('test');
  const db = openDatabase(config.supabaseUrl, config.supabaseKey, isTest);
  const router = new Router();
  router.use(authMiddleware(config.jwtSecret));

  const issueToken = (user: { id: string; role: 'athlete' | 'coach' | 'admin'; email: string }) =>
    signJwt({ sub: user.id, role: user.role, email: user.email }, config.jwtSecret, config.jwtTtlSeconds);

  // ---- Health & Root --------------------------------------------------------
  router.get('/', () =>
    json(200, {
      message: 'Fitzen Backend API Server',
      status: 'ok',
      webUI: 'http://localhost:5174/',
      healthCheck: '/api/health',
    }),
  );
  router.get('/api/health', () => json(200, { status: 'ok', service: 'fitzen-api', version: '1.0.0' }));

  // ---- Auth ----------------------------------------------------------------
  router.post('/api/auth/register', async (ctx) => {
    const body = asObject(ctx.body);
    const role = body.role === undefined ? 'athlete' : requireEnum(body, 'role', ['athlete', 'coach', 'admin'] as const);

    const user = await createUser(db, {
      email: requireEmail(body, 'email'),
      password: requireString(body, 'password', { min: 8, max: 128 }),
      name: requireString(body, 'name', { min: 1, max: 100 }),
      role,
    });
    await pushNotification(db, user.id, 'welcome', 'Welcome to Fitzen',
      role === 'athlete'
        ? 'Complete your athlete profile, then run your first jump assessment.'
        : 'Your coach account is ready. Athletes can now be assigned to you.');
    return json(201, { user, token: issueToken(user) });
  });

  router.post('/api/auth/login', async (ctx) => {
    const body = asObject(ctx.body);
    const user = await authenticate(db, requireEmail(body, 'email'), requireString(body, 'password', { max: 128 }));
    return json(200, { user, token: issueToken(user) });
  });

  // ---- Current user --------------------------------------------------------
  router.get('/api/me', async (ctx) => {
    const auth = requireUser(ctx);
    const user = await getUser(db, auth.sub);
    if (!user) throw new HttpError(404, 'User not found');
    const profile = await getProfile(db, auth.sub);
    return json(200, { user, profile });
  });

  router.put('/api/me/profile', async (ctx) => {
    const auth = requireUser(ctx);
    const body = asObject(ctx.body);
    const profile = await upsertProfile(db, auth.sub, {
      sex: requireEnum(body, 'sex', ['male', 'female'] as const),
      birthDate: requireString(body, 'birthDate', { min: 8, max: 30 }),
      heightCm: requireNumber(body, 'heightCm', { min: 80, max: 250 }),
      massKg: requireNumber(body, 'massKg', { min: 20, max: 250 }),
      midParentalHeightCm: optionalNumber(body, 'midParentalHeightCm'),
      sport: optionalString(body, 'sport'),
      region: optionalString(body, 'region'),
      coachId: optionalString(body, 'coachId'),
    });
    return json(200, { profile });
  });

  router.get('/api/me/settings', async (ctx) => {
    const auth = requireUser(ctx);
    const row = await db.getSettings(auth.sub);
    return json(200, {
      settings: {
        theme: row ? String(row.theme) : 'system',
        units: row ? String(row.units) : 'metric',
        notificationsEnabled: row ? Number(row.notifications_enabled) === 1 : true,
        leaderboardOptIn: row ? Number(row.leaderboard_opt_in) === 1 : true,
      },
    });
  });

  router.put('/api/me/settings', async (ctx) => {
    const auth = requireUser(ctx);
    const body = asObject(ctx.body);
    const theme = requireEnum(body, 'theme', ['system', 'light', 'dark'] as const);
    const units = requireEnum(body, 'units', ['metric', 'imperial'] as const);
    const notificationsEnabled = body.notificationsEnabled !== false;
    const leaderboardOptIn = body.leaderboardOptIn !== false;

    await db.upsertSettings(auth.sub, {
      theme,
      units,
      notifications_enabled: notificationsEnabled ? 1 : 0,
      leaderboard_opt_in: leaderboardOptIn ? 1 : 0,
    });
    return json(200, { settings: { theme, units, notificationsEnabled, leaderboardOptIn } });
  });

  // ---- Assessments -----------------------------------------------------------
  const ingestAndNotify = async (athleteId: string, envelope: unknown) => {
    const before = await computeAthleteStats(db, athleteId);
    const { record, created } = await ingestAssessment(db, athleteId, envelope);
    let newBadges: string[] = [];
    if (created && record.integrity === 'verified') {
      newBadges = await awardBadges(db, athleteId, before);
      for (const badgeId of newBadges) {
        const def = BADGE_DEFINITIONS.find((b) => b.id === badgeId);
        if (def) {
          await pushNotification(db, athleteId, 'badge', `Badge earned: ${def.name}`, def.description);
        }
      }
      if (record.metrics.jumpHeightM > before.bestJumpHeightM && before.assessmentCount > 0) {
        await pushNotification(db, athleteId, 'pb', 'New personal best!',
          `You jumped ${(record.metrics.jumpHeightM * 100).toFixed(1)} cm — a new record.`);
      }
    }
    if (created && record.integrity === 'tampered') {
      await pushNotification(db, athleteId, 'integrity', 'Assessment failed verification',
        'Your last upload did not pass integrity checks and will not count toward rankings.');
    }
    return { record, created, newBadges };
  };

  router.post('/api/assessments', async (ctx) => {
    const auth = requireRole(ctx, 'athlete');
    const result = await ingestAndNotify(auth.sub, ctx.body);
    return json(result.created ? 201 : 200, result);
  });

  router.get('/api/assessments', async (ctx) => {
    const auth = requireUser(ctx);
    const athleteId = ctx.query.get('athleteId');
    if (athleteId && athleteId !== auth.sub) {
      requireRole(ctx, 'coach', 'admin');
      const assessments = await listAssessments(db, athleteId);
      return json(200, { assessments });
    }
    const assessments = await listAssessments(db, auth.sub);
    return json(200, { assessments });
  });

  router.get('/api/assessments/:id', async (ctx) => {
    const auth = requireUser(ctx);
    const record = await getAssessment(db, ctx.params.id!);
    if (!record) throw new HttpError(404, 'Assessment not found');
    if (record.athleteId !== auth.sub && auth.role === 'athlete') {
      throw new HttpError(403, 'Not your assessment');
    }
    return json(200, { assessment: record });
  });

  router.post('/api/assessments/:id/verify', async (ctx) => {
    requireUser(ctx);
    const result = await reverifyAssessment(db, ctx.params.id!);
    if (!result) throw new HttpError(404, 'Assessment not found');
    return json(200, result);
  });

  // ---- Offline sync -----------------------------------------------------------
  router.post('/api/sync', async (ctx) => {
    const auth = requireRole(ctx, 'athlete');
    const body = asObject(ctx.body);
    const envelopes = body.assessments;
    if (!Array.isArray(envelopes) || envelopes.length > 100) {
      throw new HttpError(400, 'Provide "assessments": an array of at most 100 envelopes');
    }
    const results: Array<{ clientId: string | null; status: string; id?: string; error?: string }> = [];
    for (const envelope of envelopes) {
      const clientId =
        typeof envelope === 'object' && envelope !== null
          ? String(
              ((envelope as Record<string, unknown>).signed as { payload?: { clientId?: string } })
                ?.payload?.clientId ?? '',
            ) || null
          : null;
      try {
        const { record, created } = await ingestAndNotify(auth.sub, envelope);
        results.push({
          clientId,
          status: created ? 'created' : 'duplicate',
          id: record.id,
        });
      } catch (err) {
        results.push({
          clientId,
          status: 'error',
          error: err instanceof HttpError ? err.message : 'Failed to process assessment',
        });
      }
    }
    return json(200, { results, serverTime: new Date().toISOString() });
  });

  // ---- Stats, potential, badges, leaderboard -----------------------------------
  router.get('/api/stats/me', async (ctx) => {
    const auth = requireUser(ctx);
    const stats = await computeAthleteStats(db, auth.sub);
    const profile = await getProfile(db, auth.sub);
    const potential = profile ? await potentialForAthlete(db, profile) : null;
    return json(200, { stats, potential });
  });

  router.get('/api/badges/me', async (ctx) => {
    const auth = requireUser(ctx);
    const badges = await athleteBadges(db, auth.sub);
    return json(200, { badges });
  });

  router.get('/api/leaderboard', async (ctx) => {
    const rawMetric = ctx.query.get('metric');
    const metric = rawMetric === 'power' || rawMetric === 'pushup' || rawMetric === 'squat' || rawMetric === 'jump'
      ? rawMetric
      : undefined;
    const region = ctx.query.get('region') ?? undefined;
    const board = await leaderboard(db, { metric, region });
    return json(200, { leaderboard: board });
  });

  // ---- Notifications ---------------------------------------------------------
  router.get('/api/notifications', async (ctx) => {
    const auth = requireUser(ctx);
    const notifications = await listNotifications(db, auth.sub);
    return json(200, { notifications });
  });

  router.post('/api/notifications/read-all', async (ctx) => {
    const auth = requireUser(ctx);
    const updated = await markAllRead(db, auth.sub);
    return json(200, { updated });
  });

  router.post('/api/notifications/:id/read', async (ctx) => {
    const auth = requireUser(ctx);
    const ok = await markRead(db, auth.sub, ctx.params.id!);
    if (!ok) throw new HttpError(404, 'Notification not found');
    return json(200, { ok: true });
  });

  // ---- AI coaching brief -------------------------------------------------------
  router.get('/api/ai/brief', async (ctx) => {
    const auth = requireUser(ctx);
    const targetId =
      auth.role === 'athlete' ? auth.sub : ctx.query.get('athleteId') ?? auth.sub;
    if (targetId !== auth.sub) requireRole(ctx, 'coach', 'admin');
    const user = await getUser(db, targetId);
    const profile = await getProfile(db, targetId);
    if (!user || !profile) throw new HttpError(404, 'Athlete profile not found');
    const stats = await computeAthleteStats(db, targetId);
    const potential = await potentialForAthlete(db, profile);
    const brief = await generateCoachingBrief({
      athleteName: user.name,
      ageYears: ageYears(profile.birthDate),
      sport: profile.sport,
      stats,
      potential,
    });
    return json(200, { brief });
  });

  // ---- Coach -------------------------------------------------------------------
  router.get('/api/coach/roster', async (ctx) => {
    const auth = requireRole(ctx, 'coach', 'admin');
    const rawRoster = await coachRoster(db, auth.sub);
    const roster = await Promise.all(
      rawRoster.map(async (athlete) => ({
        ...athlete,
        stats: await computeAthleteStats(db, athlete.id),
      }))
    );
    return json(200, { roster });
  });

  router.get('/api/coach/athletes/:id', async (ctx) => {
    requireRole(ctx, 'coach', 'admin');
    const athleteId = ctx.params.id!;
    const user = await getUser(db, athleteId);
    if (!user) throw new HttpError(404, 'Athlete not found');
    const profile = await getProfile(db, athleteId);
    const stats = await computeAthleteStats(db, athleteId);
    const potential = profile ? await potentialForAthlete(db, profile) : null;
    const assessments = await listAssessments(db, athleteId, 25);
    const badges = await athleteBadges(db, athleteId);
    return json(200, {
      user,
      profile,
      stats,
      potential,
      assessments,
      badges,
    });
  });

  // ---- Admin ---------------------------------------------------------------------
  router.get('/api/admin/users', async (ctx) => {
    requireRole(ctx, 'admin');
    const role = ctx.query.get('role');
    const users = await listUsers(db, role === 'athlete' || role === 'coach' || role === 'admin' ? role : undefined);
    return json(200, { users });
  });

  router.get('/api/admin/overview', async (ctx) => {
    requireRole(ctx, 'admin');
    const overview = await db.getAdminOverview();
    return json(200, { overview });
  });

  let currentGeometricThresholds = {
    pushup: { downAngleThreshold: 90.0, upAngleThreshold: 160.0, maxAsymmetryDeg: 15.0, minVisibility: 0.5 },
    squat: { downAngleThreshold: 90.0, upAngleThreshold: 160.0, maxAsymmetryDeg: 15.0, minVisibility: 0.5 },
    jump: { downAngleThreshold: 80.0, upAngleThreshold: 170.0, maxAsymmetryDeg: 15.0, minVisibility: 0.5 },
  };

  router.get('/api/admin/thresholds', (ctx) => {
    requireRole(ctx, 'admin');
    return json(200, { thresholds: currentGeometricThresholds });
  });

  router.put('/api/admin/thresholds', (ctx) => {
    requireRole(ctx, 'admin');
    const body = asObject(ctx.body);
    const exercise = requireString(body, 'exercise');
    const downAngleThreshold = requireNumber(body, 'downAngleThreshold');
    const upAngleThreshold = requireNumber(body, 'upAngleThreshold');
    const maxAsymmetryDeg = requireNumber(body, 'maxAsymmetryDeg');

    currentGeometricThresholds = {
      ...currentGeometricThresholds,
      [exercise]: {
        downAngleThreshold,
        upAngleThreshold,
        maxAsymmetryDeg,
        minVisibility: optionalNumber(body, 'minVisibility') ?? 0.5,
      },
    };

    return json(200, {
      message: `Geometric thresholds updated for exercise: ${exercise}`,
      thresholds: currentGeometricThresholds,
    });
  });

  // ---- HTTP server ------------------------------------------------------------------
  const server = createServer(async (req, res) => {
    const origin = req.headers.origin;
    applyCors(res, origin, config.corsOrigins);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    let reqUrl = req.url ?? '/';
    const parsedUrl = new URL(reqUrl, 'http://localhost');
    let pathname = parsedUrl.pathname;
    if (pathname !== '/' && !pathname.startsWith('/api/') && pathname !== '/api') {
      pathname = '/api' + pathname;
    }
    const fullPath = pathname + parsedUrl.search;

    const ctx: RequestContext = {
      method: req.method ?? 'GET',
      path: fullPath,
      params: {},
      query: parsedUrl.searchParams,
      body: undefined,
      headers: req.headers,
      user: null,
    };
    try {
      if (ctx.method === 'POST' || ctx.method === 'PUT' || ctx.method === 'PATCH') {
        ctx.body = await readJsonBody(req);
      }
      const result = await router.handle(ctx);
      res.writeHead(result.status, { 'Content-Type': 'application/json', ...result.headers });
      res.end(JSON.stringify(result.body));
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      const message = err instanceof HttpError ? err.message : 'Internal server error';
      if (status === 500) console.error('[fitzen-api] unhandled error:', err);
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: message }));
    }
  });

  return { server, db };
}
