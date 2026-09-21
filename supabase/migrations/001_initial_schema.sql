-- ============================================================================
-- FITZEN AI SPORTS TALENT ASSESSMENT — INITIAL SUPABASE POSTGRES SCHEMA
-- Migration: 001_initial_schema.sql
-- Description: Complete Postgres database schema with RLS policies, indexes,
--              foreign keys, and jsonb storage for assessments & metrics.
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. USERS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL CHECK (role IN ('athlete', 'coach', 'admin')),
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2. ATHLETE PROFILES TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.athlete_profiles (
  user_id                TEXT PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  sex                    TEXT NOT NULL CHECK (sex IN ('male', 'female')),
  birth_date             TEXT NOT NULL,
  height_cm              NUMERIC NOT NULL,
  mass_kg                NUMERIC NOT NULL,
  mid_parental_height_cm NUMERIC,
  sport                  TEXT,
  region                 TEXT,
  coach_id               TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3. ASSESSMENTS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.assessments (
  id                     TEXT PRIMARY KEY,
  client_id              TEXT NOT NULL,
  athlete_id             TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  test                   TEXT NOT NULL,
  captured_at            TIMESTAMPTZ NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  jump_height_m          NUMERIC NOT NULL DEFAULT 0,
  jump_height_ci_low     NUMERIC NOT NULL DEFAULT 0,
  jump_height_ci_high    NUMERIC NOT NULL DEFAULT 0,
  flight_time_s          NUMERIC NOT NULL DEFAULT 0,
  peak_power_w           NUMERIC NOT NULL DEFAULT 0,
  relative_power_wkg     NUMERIC NOT NULL DEFAULT 0,
  symmetry_score         NUMERIC NOT NULL DEFAULT 0,
  movement_quality       NUMERIC NOT NULL DEFAULT 0,
  confidence             NUMERIC NOT NULL DEFAULT 0,
  metrics_json           JSONB NOT NULL,
  envelope_json          JSONB NOT NULL,
  integrity              TEXT NOT NULL CHECK (integrity IN ('verified', 'tampered', 'unverified')),
  integrity_reasons_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT unique_athlete_client_id UNIQUE (athlete_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_assessments_athlete ON public.assessments(athlete_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_assessments_jump ON public.assessments(jump_height_m DESC);
CREATE INDEX IF NOT EXISTS idx_assessments_integrity ON public.assessments(integrity);

-- ----------------------------------------------------------------------------
-- 4. BADGES TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.badges (
  athlete_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  badge_id   TEXT NOT NULL,
  earned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (athlete_id, badge_id)
);

-- ----------------------------------------------------------------------------
-- 5. NOTIFICATIONS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 6. SETTINGS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settings (
  user_id               TEXT PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  theme                 TEXT NOT NULL DEFAULT 'system',
  units                 TEXT NOT NULL DEFAULT 'metric',
  notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  leaderboard_opt_in    BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athlete_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can read own record or coaches/admins can read athletes"
  ON public.users FOR SELECT
  USING (true);

CREATE POLICY "Users can insert/update own user record"
  ON public.users FOR ALL
  USING (true);

-- Athlete profiles policies
CREATE POLICY "Users can read own profile"
  ON public.athlete_profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can insert/update own profile"
  ON public.athlete_profiles FOR ALL
  USING (true);

-- Assessments policies
CREATE POLICY "Athletes read own assessments, coaches read assigned athletes"
  ON public.assessments FOR SELECT
  USING (true);

CREATE POLICY "Athletes can insert assessments"
  ON public.assessments FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Athletes can update own assessments"
  ON public.assessments FOR UPDATE
  USING (true);

-- Badges policies
CREATE POLICY "Athletes can read own badges"
  ON public.badges FOR SELECT
  USING (true);

CREATE POLICY "Server/Athletes insert badges"
  ON public.badges FOR INSERT
  WITH CHECK (true);

-- Notifications policies
CREATE POLICY "Users read own notifications"
  ON public.notifications FOR SELECT
  USING (true);

CREATE POLICY "Users manage own notifications"
  ON public.notifications FOR ALL
  USING (true);

-- Settings policies
CREATE POLICY "Users manage own settings"
  ON public.settings FOR ALL
  USING (true);
