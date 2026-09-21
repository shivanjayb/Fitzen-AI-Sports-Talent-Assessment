import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * SQLite schema for Fitzen. Uses the built-in `node:sqlite` driver (no native
 * add-ons). WAL mode and foreign keys are enabled for concurrency and
 * referential integrity.
 *
 * Design notes:
 *  - Assessments store the *signed envelope* (payload + signature + public key
 *    + audit trail) as JSON so the server can re-verify integrity exactly as
 *    the client signed it, and so the record is portable and tamper-evident.
 *  - `client_id` is the offline-generated UUID, enabling idempotent sync.
 */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('athlete','coach','admin')),
  name          TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS athlete_profiles (
  user_id                TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  sex                    TEXT NOT NULL CHECK (sex IN ('male','female')),
  birth_date             TEXT NOT NULL,
  height_cm              REAL NOT NULL,
  mass_kg                REAL NOT NULL,
  mid_parental_height_cm REAL,
  sport                  TEXT,
  region                 TEXT,
  coach_id               TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at             TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assessments (
  id             TEXT PRIMARY KEY,
  client_id      TEXT NOT NULL,
  athlete_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  test           TEXT NOT NULL,
  captured_at    TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  jump_height_m  REAL NOT NULL,
  jump_height_ci_low  REAL NOT NULL,
  jump_height_ci_high REAL NOT NULL,
  flight_time_s  REAL NOT NULL,
  peak_power_w   REAL NOT NULL,
  relative_power_wkg REAL NOT NULL,
  symmetry_score REAL NOT NULL,
  movement_quality REAL NOT NULL,
  confidence     REAL NOT NULL,
  metrics_json   TEXT NOT NULL,
  envelope_json  TEXT NOT NULL,
  integrity      TEXT NOT NULL CHECK (integrity IN ('verified','tampered','unverified')),
  integrity_reasons_json TEXT NOT NULL DEFAULT '[]',
  UNIQUE (athlete_id, client_id)
);
CREATE INDEX IF NOT EXISTS idx_assessments_athlete ON assessments(athlete_id, captured_at);
CREATE INDEX IF NOT EXISTS idx_assessments_jump ON assessments(jump_height_m);

CREATE TABLE IF NOT EXISTS badges (
  athlete_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id    TEXT NOT NULL,
  earned_at   TEXT NOT NULL,
  PRIMARY KEY (athlete_id, badge_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  read_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);

CREATE TABLE IF NOT EXISTS settings (
  user_id            TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme              TEXT NOT NULL DEFAULT 'system',
  units              TEXT NOT NULL DEFAULT 'metric',
  notifications_enabled INTEGER NOT NULL DEFAULT 1,
  leaderboard_opt_in INTEGER NOT NULL DEFAULT 1,
  updated_at         TEXT NOT NULL
);
`;

export type Database = DatabaseSync;

export function openDatabase(path: string): Database {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA journal_mode = WAL;');
  } catch {
    db.exec('PRAGMA journal_mode = DELETE;');
  }
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}
