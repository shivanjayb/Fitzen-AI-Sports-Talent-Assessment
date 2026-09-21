import type { Database } from '../db.ts';
import { HttpError } from '../http/router.ts';
import { hashPassword, verifyPassword } from '../auth/password.ts';
import { newId } from '../util/id.ts';
import type { AthleteProfile, Role, Sex, UserRecord } from '../domain/types.ts';

export async function findUserByEmail(db: Database, email: string) {
  const row = await db.findUserByEmail(email);
  if (!row) return undefined;
  return {
    id: String(row.id),
    email: String(row.email),
    password_hash: String(row.password_hash || ''),
    role: String(row.role) as Role,
    name: String(row.name),
    created_at: String(row.created_at),
  };
}

export async function getUser(db: Database, id: string): Promise<UserRecord | null> {
  const row = await db.getUser(id);
  if (!row) return null;
  return {
    id: String(row.id),
    email: String(row.email),
    role: String(row.role) as Role,
    name: String(row.name),
    createdAt: String(row.created_at),
  };
}

export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
  role: Role;
}

export async function createUser(db: Database, input: CreateUserInput): Promise<UserRecord> {
  const existing = await findUserByEmail(db, input.email);
  if (existing) {
    throw new HttpError(409, 'An account with this email already exists');
  }
  if (input.password.length < 8) {
    throw new HttpError(400, 'Password must be at least 8 characters');
  }
  const id = newId('usr');
  const createdAt = new Date().toISOString();
  await db.insertUser({
    id,
    email: input.email.toLowerCase(),
    password_hash: hashPassword(input.password),
    role: input.role,
    name: input.name,
    created_at: createdAt,
  });
  await db.upsertSettings(id, { notifications_enabled: 1, leaderboard_opt_in: 1 });
  return { id, email: input.email.toLowerCase(), role: input.role, name: input.name, createdAt };
}

export async function authenticate(db: Database, email: string, password: string): Promise<UserRecord> {
  const row = await findUserByEmail(db, email);
  if (!row || !verifyPassword(password, row.password_hash)) {
    throw new HttpError(401, 'Invalid email or password');
  }
  return { id: row.id, email: row.email, role: row.role, name: row.name, createdAt: row.created_at };
}

export interface ProfileInput {
  sex: Sex;
  birthDate: string;
  heightCm: number;
  massKg: number;
  midParentalHeightCm?: number;
  sport?: string;
  region?: string;
  coachId?: string;
}

export async function upsertProfile(db: Database, userId: string, input: ProfileInput): Promise<AthleteProfile> {
  const updatedAt = new Date().toISOString();
  await db.upsertProfile({
    user_id: userId,
    sex: input.sex,
    birth_date: input.birthDate,
    height_cm: input.heightCm,
    mass_kg: input.massKg,
    mid_parental_height_cm: input.midParentalHeightCm ?? null,
    sport: input.sport ?? null,
    region: input.region ?? null,
    coach_id: input.coachId ?? null,
    updated_at: updatedAt,
  });
  return { userId, updatedAt, ...input };
}

export async function getProfile(db: Database, userId: string): Promise<AthleteProfile | null> {
  const row = await db.getProfile(userId);
  if (!row) return null;
  return {
    userId: String(row.user_id),
    sex: String(row.sex) as Sex,
    birthDate: String(row.birth_date),
    heightCm: Number(row.height_cm),
    massKg: Number(row.mass_kg),
    midParentalHeightCm: row.mid_parental_height_cm == null ? undefined : Number(row.mid_parental_height_cm),
    sport: row.sport == null ? undefined : String(row.sport),
    region: row.region == null ? undefined : String(row.region),
    coachId: row.coach_id == null ? undefined : String(row.coach_id),
    updatedAt: String(row.updated_at),
  };
}

export async function coachRoster(db: Database, coachId: string) {
  const rows = await db.coachRoster(coachId);
  return rows.map((r: any) => ({
    id: String(r.id),
    name: String(r.name),
    email: String(r.email),
    sport: r.sport ? String(r.sport) : null,
    region: r.region ? String(r.region) : null,
    birth_date: String(r.birth_date),
  }));
}

export async function listUsers(db: Database, role?: Role): Promise<UserRecord[]> {
  const rows = await db.listUsers(role);
  return rows.map((r: any) => ({
    id: String(r.id),
    email: String(r.email),
    role: String(r.role) as Role,
    name: String(r.name),
    createdAt: String(r.created_at),
  }));
}
