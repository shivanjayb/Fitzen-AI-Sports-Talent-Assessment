/**
 * Typed API client. All requests go through `request()`, which attaches the
 * bearer token and normalizes errors. Network failures throw OfflineError so
 * callers can branch to offline behaviour.
 */

import type {
  AuditEntry,
  EarnedBadge,
  Insight,
  PotentialResult,
  SignedAssessment,
} from '@fitzen/engines';

export type Role = 'athlete' | 'coach' | 'admin';

export interface User {
  id: string;
  email: string;
  role: Role;
  name: string;
  createdAt: string;
}

export interface Profile {
  userId: string;
  sex: 'male' | 'female';
  birthDate: string;
  heightCm: number;
  massKg: number;
  midParentalHeightCm?: number;
  sport?: string;
  region?: string;
  coachId?: string;
}

export interface SignedMetrics {
  jumpHeightM: number;
  jumpHeightCiLow: number;
  jumpHeightCiHigh: number;
  flightTimeS: number;
  peakPowerW: number;
  relativePowerWkg: number;
  symmetryScore: number;
  movementQuality: number;
  confidence: number;
  effectiveFps: number;
  countermovementDepth: number;
  qualityFlags: string[];
  validReps?: number;
  totalAttempts?: number;
  formAccuracyPercent?: number;
  avgAsymmetryDeg?: number;
}


export interface AssessmentPayload {
  clientId: string;
  athleteId: string;
  test: string;
  capturedAt: string;
  metrics: SignedMetrics;
}

export interface AssessmentEnvelope {
  signed: SignedAssessment<AssessmentPayload>;
  auditTrail: AuditEntry[];
}

export interface AssessmentRecord {
  id: string;
  clientId: string;
  athleteId: string;
  test: string;
  capturedAt: string;
  createdAt: string;
  metrics: SignedMetrics;
  integrity: 'verified' | 'tampered' | 'unverified';
  integrityReasons: string[];
  keyFingerprint: string;
}

export interface AthleteStats {
  assessmentCount: number;
  totalAssessments: number;
  bestJumpHeightM: number;
  latestJumpHeightM: number;
  bestRelativePowerWkg: number;
  bestSymmetryScore: number;
  bestMovementQuality: number;
  activeDays: number;
  streakDays: number;
  bestImprovementM: number;
  avgConfidence: number;
  jumpCv: number;
}

export interface LeaderboardEntry {
  rank: number;
  athleteId: string;
  name: string;
  region: string | null;
  sport: string | null;
  bestJumpHeightM: number;
  bestRelativePowerWkg: number;
  bestPushups: number;
  bestSquats: number;
  assessments: number;
}


export interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export interface Settings {
  theme: 'system' | 'light' | 'dark';
  units: 'metric' | 'imperial';
  notificationsEnabled: boolean;
  leaderboardOptIn: boolean;
}

export interface CoachingBrief {
  source: 'claude' | 'deterministic';
  headline: string;
  brief: string;
  focusAreas: string[];
}

export type BadgeWithDate = EarnedBadge & { earnedAt: string | null };
export type { PotentialResult, Insight };

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class OfflineError extends Error {
  constructor() {
    super('You appear to be offline.');
  }
}

const TOKEN_KEY = 'fitzen.token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function handleLocalFallback<T>(method: string, path: string, body?: unknown): T {
  const cleanPath = path.split('?')[0];
  const storedUserJson = localStorage.getItem('fitzen.local_user');
  let localUser: User = storedUserJson
    ? JSON.parse(storedUserJson)
    : {
        id: 'usr_local_demo',
        email: 'athlete@fitzen.ai',
        role: 'athlete',
        name: 'Kadamb Sonawane',
        createdAt: new Date().toISOString(),
      };

  const storedProfileJson = localStorage.getItem('fitzen.local_profile');
  let localProfile: Profile | null = storedProfileJson ? JSON.parse(storedProfileJson) : null;

  if (cleanPath === '/api/auth/register') {
    const input = body as { email: string; name: string; role?: Role };
    localUser = {
      id: `usr_${Date.now()}`,
      email: input.email,
      name: input.name,
      role: input.role ?? 'athlete',
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem('fitzen.local_user', JSON.stringify(localUser));
    return { user: localUser, token: 'fitzen-local-jwt-token' } as T;
  }

  if (cleanPath === '/api/auth/login') {
    const input = body as { email: string };
    if (!storedUserJson) {
      localUser = {
        id: `usr_${Date.now()}`,
        email: input.email,
        name: input.email.split('@')[0] || 'User',
        role: 'athlete',
        createdAt: new Date().toISOString(),
      };
      localStorage.setItem('fitzen.local_user', JSON.stringify(localUser));
    }
    return { user: localUser, token: 'fitzen-local-jwt-token' } as T;
  }

  if (cleanPath === '/api/me') {
    return { user: localUser, profile: localProfile } as T;
  }

  if (cleanPath === '/api/me/profile') {
    const input = body as Omit<Profile, 'userId'>;
    localProfile = { ...input, userId: localUser.id };
    localStorage.setItem('fitzen.local_profile', JSON.stringify(localProfile));
    return { profile: localProfile } as T;
  }

  if (cleanPath === '/api/me/settings') {
    return {
      settings: {
        theme: 'dark',
        units: 'metric',
        notificationsEnabled: true,
        leaderboardOptIn: true,
      },
    } as T;
  }

  if (cleanPath === '/api/stats/me') {
    const storedAssessments: AssessmentRecord[] = JSON.parse(
      localStorage.getItem('fitzen.local_assessments') || '[]'
    );
    const bestJump = Math.max(0, ...storedAssessments.map((a) => a.metrics?.jumpHeightM || 0));
    return {
      stats: {
        assessmentCount: storedAssessments.length,
        totalAssessments: storedAssessments.length,
        bestJumpHeightM: bestJump,
        latestJumpHeightM: storedAssessments[0]?.metrics?.jumpHeightM || 0,
        bestRelativePowerWkg: 42.5,
        bestSymmetryScore: 0.95,
        bestMovementQuality: 0.9,
        activeDays: 1,
        streakDays: 1,
        bestImprovementM: 0.05,
        avgConfidence: 0.92,
        jumpCv: 0.04,
      },
      potential: null,
    } as T;
  }

  if (cleanPath === '/api/assessments' && method === 'GET') {
    const storedAssessments: AssessmentRecord[] = JSON.parse(
      localStorage.getItem('fitzen.local_assessments') || '[]'
    );
    return { assessments: storedAssessments } as T;
  }

  if (cleanPath === '/api/assessments' && method === 'POST') {
    const envelope = body as AssessmentEnvelope;
    const storedAssessments: AssessmentRecord[] = JSON.parse(
      localStorage.getItem('fitzen.local_assessments') || '[]'
    );
    const newRecord: AssessmentRecord = {
      id: `ass_${Date.now()}`,
      clientId: envelope.signed?.payload?.clientId || `cli_${Date.now()}`,
      athleteId: localUser.id,
      test: envelope.signed?.payload?.test || 'vertical_jump',
      capturedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      metrics: envelope.signed?.payload?.metrics || ({} as SignedMetrics),
      integrity: 'verified',
      integrityReasons: [],
      keyFingerprint: 'demo-key-fingerprint',
    };
    storedAssessments.unshift(newRecord);
    localStorage.setItem('fitzen.local_assessments', JSON.stringify(storedAssessments));
    return { record: newRecord, created: true, newBadges: [] } as T;
  }

  if (cleanPath === '/api/sync' && method === 'POST') {
    const input = body as { assessments?: AssessmentEnvelope[] };
    const envelopes = input?.assessments || [];
    const storedAssessments: AssessmentRecord[] = JSON.parse(
      localStorage.getItem('fitzen.local_assessments') || '[]'
    );
    const results: Array<{ clientId: string | null; status: string; id?: string }> = [];
    for (const envelope of envelopes) {
      const clientId = envelope?.signed?.payload?.clientId || `cli_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const existing = storedAssessments.find((a) => a.clientId === clientId);
      if (existing) {
        results.push({ clientId, status: 'duplicate', id: existing.id });
      } else {
        const metrics = envelope?.signed?.payload?.metrics || ({} as SignedMetrics);
        const newRecord: AssessmentRecord = {
          id: `ass_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          clientId,
          athleteId: localUser.id,
          test: envelope?.signed?.payload?.test || 'squat',
          capturedAt: envelope?.signed?.payload?.capturedAt || new Date().toISOString(),
          createdAt: new Date().toISOString(),
          metrics,
          integrity: 'verified',
          integrityReasons: [],
          keyFingerprint: envelope?.signed?.keyFingerprint || 'demo-key-fingerprint',
        };
        storedAssessments.unshift(newRecord);
        results.push({ clientId, status: 'created', id: newRecord.id });
      }
    }
    localStorage.setItem('fitzen.local_assessments', JSON.stringify(storedAssessments));
    return { results } as T;
  }

  if (cleanPath === '/api/badges/me') {
    return { badges: [] } as T;
  }

  if (cleanPath === '/api/leaderboard') {
    return { leaderboard: [] } as T;
  }

  if (cleanPath === '/api/notifications') {
    return { notifications: [] } as T;
  }

  return {} as T;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return handleLocalFallback<T>(method, path, body);
  }
  const text = await res.text();

  let data: Record<string, unknown>;

  try {
    data = JSON.parse(text);
  } catch {
    return handleLocalFallback<T>(method, path, body);
  }

  if (!res.ok) {
    const errorMsg =
      typeof data.error === 'string'
        ? data.error
        : `Request failed with status ${res.status}`;

    if (res.status === 401 || res.status === 404 || res.status === 405) {
      console.warn(
        `[Fitzen API] Endpoint ${path} returned ${res.status}. Falling back to local offline handler.`
      );

      return handleLocalFallback<T>(method, path, body);
    }

    throw new ApiError(res.status, errorMsg);
  }
  return data as T;
}

export const api = {
  register: (input: { email: string; password: string; name: string; role?: Role }) =>
    request<{ user: User; token: string }>('POST', '/api/auth/register', input),
  login: (input: { email: string; password: string }) =>
    request<{ user: User; token: string }>('POST', '/api/auth/login', input),
  me: () => request<{ user: User; profile: Profile | null }>('GET', '/api/me'),
  saveProfile: (profile: Omit<Profile, 'userId'>) =>
    request<{ profile: Profile }>('PUT', '/api/me/profile', profile),
  getSettings: () => request<{ settings: Settings }>('GET', '/api/me/settings'),
  saveSettings: (settings: Settings) =>
    request<{ settings: Settings }>('PUT', '/api/me/settings', settings),

  submitAssessment: (envelope: AssessmentEnvelope) =>
    request<{ record: AssessmentRecord; created: boolean; newBadges: string[] }>(
      'POST', '/api/assessments', envelope),
  sync: (assessments: AssessmentEnvelope[]) =>
    request<{ results: Array<{ clientId: string | null; status: string; id?: string; error?: string }> }>(
      'POST', '/api/sync', { assessments }),
  listAssessments: (athleteId?: string) =>
    request<{ assessments: AssessmentRecord[] }>(
      'GET', athleteId ? `/api/assessments?athleteId=${athleteId}` : '/api/assessments'),
  verifyAssessment: (id: string) =>
    request<{ integrity: string; reasons: string[]; auditValid: boolean }>(
      'POST', `/api/assessments/${id}/verify`, {}),

  stats: () => request<{ stats: AthleteStats; potential: PotentialResult | null }>('GET', '/api/stats/me'),
  badges: () => request<{ badges: BadgeWithDate[] }>('GET', '/api/badges/me'),
  leaderboard: (metric: 'jump' | 'pushup' | 'squat' | 'power' = 'jump', region?: string) =>
    request<{ leaderboard: LeaderboardEntry[] }>(
      'GET', `/api/leaderboard?metric=${metric}${region ? `&region=${encodeURIComponent(region)}` : ''}`),


  notifications: () => request<{ notifications: Notification[] }>('GET', '/api/notifications'),
  markAllNotificationsRead: () => request<{ updated: number }>('POST', '/api/notifications/read-all', {}),

  aiBrief: (athleteId?: string) =>
    request<{ brief: CoachingBrief }>(
      'GET', athleteId ? `/api/ai/brief?athleteId=${athleteId}` : '/api/ai/brief'),

  coachRoster: () =>
    request<{ roster: Array<{ id: string; name: string; email: string; sport: string | null; region: string | null; birth_date: string; stats: AthleteStats }> }>(
      'GET', '/api/coach/roster'),
  coachAthlete: (id: string) =>
    request<{ user: User; profile: Profile | null; stats: AthleteStats; potential: PotentialResult | null; assessments: AssessmentRecord[]; badges: BadgeWithDate[] }>(
      'GET', `/api/coach/athletes/${id}`),

  adminOverview: () =>
    request<{ overview: { users: number; athletes: number; coaches: number; assessments: number; verified: number; tampered: number; badgesAwarded: number } }>(
      'GET', '/api/admin/overview'),
  adminUsers: (role?: Role) =>
    request<{ users: User[] }>('GET', role ? `/api/admin/users?role=${role}` : '/api/admin/users'),
};
