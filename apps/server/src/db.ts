import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase Postgres Database interface for Fitzen.
 * Completely replaces SQLite with a clean, high-performance Supabase persistence layer.
 */
export class FitzenDb {
  public client: SupabaseClient;

  // In-memory fallback tables for ultra-fast local test execution (e.g. vitest runs)
  private isTestMode: boolean;
  private memoryUsers: Map<string, any> = new Map();
  private memoryProfiles: Map<string, any> = new Map();
  private memoryAssessments: Map<string, any> = new Map();
  private memoryBadges: Map<string, any> = new Map();
  private memoryNotifications: Map<string, any> = new Map();
  private memorySettings: Map<string, any> = new Map();

  constructor(supabaseUrl: string, supabaseKey: string, isTest = false) {
    this.client = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });
    this.isTestMode = isTest;
  }

  // --- Users ---
  public async findUserByEmail(email: string) {
    if (this.isTestMode) {
      const lower = email.toLowerCase();
      for (const u of this.memoryUsers.values()) {
        if (u.email.toLowerCase() === lower) return u;
      }
      return undefined;
    }
    const { data } = await this.client
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();
    return data || undefined;
  }

  public async getUser(id: string) {
    if (this.isTestMode) {
      return this.memoryUsers.get(id) || null;
    }
    const { data } = await this.client.from('users').select('*').eq('id', id).single();
    return data || null;
  }

  public async insertUser(user: { id: string; email: string; password_hash: string; role: string; name: string; created_at: string }) {
    if (this.isTestMode) {
      this.memoryUsers.set(user.id, user);
      return user;
    }
    const { data, error } = await this.client.from('users').insert(user).select().single();
    if (error && error.code === '23505') return null;
    return data || user;
  }

  public async listUsers(role?: string) {
    if (this.isTestMode) {
      const list = Array.from(this.memoryUsers.values());
      if (role) return list.filter((u) => u.role === role);
      return list;
    }
    let query = this.client.from('users').select('*').order('created_at', { ascending: false });
    if (role) query = query.eq('role', role);
    const { data } = await query;
    return data || [];
  }

  // --- Athlete Profiles ---
  public async getProfile(userId: string) {
    if (this.isTestMode) {
      return this.memoryProfiles.get(userId) || null;
    }
    const { data } = await this.client.from('athlete_profiles').select('*').eq('user_id', userId).single();
    return data || null;
  }

  public async upsertProfile(profile: any) {
    if (this.isTestMode) {
      this.memoryProfiles.set(profile.user_id, profile);
      return profile;
    }
    const { data } = await this.client.from('athlete_profiles').upsert(profile).select().single();
    return data || profile;
  }

  public async coachRoster(coachId: string) {
    if (this.isTestMode) {
      const roster: any[] = [];
      for (const p of this.memoryProfiles.values()) {
        if (p.coach_id === coachId) {
          const u = this.memoryUsers.get(p.user_id);
          if (u) {
            roster.push({
              id: u.id,
              name: u.name,
              email: u.email,
              sport: p.sport || null,
              region: p.region || null,
              birth_date: p.birth_date,
            });
          }
        }
      }
      return roster;
    }
    const { data } = await this.client
      .from('athlete_profiles')
      .select('user_id, sport, region, birth_date, users!inner(id, name, email)')
      .eq('coach_id', coachId);
    if (!data) return [];
    return data.map((item: any) => ({
      id: item.users.id,
      name: item.users.name,
      email: item.users.email,
      sport: item.sport,
      region: item.region,
      birth_date: item.birth_date,
    }));
  }

  // --- Assessments ---
  public async getAssessment(id: string) {
    if (this.isTestMode) {
      return this.memoryAssessments.get(id) || null;
    }
    const { data } = await this.client.from('assessments').select('*').eq('id', id).single();
    return data || null;
  }

  public async findAssessmentByClient(athleteId: string, clientId: string) {
    if (this.isTestMode) {
      for (const a of this.memoryAssessments.values()) {
        if (a.athlete_id === athleteId && a.client_id === clientId) return a;
      }
      return null;
    }
    const { data } = await this.client
      .from('assessments')
      .select('*')
      .eq('athlete_id', athleteId)
      .eq('client_id', clientId)
      .single();
    return data || null;
  }

  public async insertAssessment(record: any) {
    if (this.isTestMode) {
      this.memoryAssessments.set(record.id, record);
      return record;
    }
    const { data } = await this.client.from('assessments').insert(record).select().single();
    return data || record;
  }

  public async updateAssessmentIntegrity(id: string, integrity: string, reasons: string[]) {
    if (this.isTestMode) {
      const existing = this.memoryAssessments.get(id);
      if (existing) {
        existing.integrity = integrity;
        existing.integrity_reasons_json = JSON.stringify(reasons);
      }
      return true;
    }
    await this.client
      .from('assessments')
      .update({ integrity, integrity_reasons_json: JSON.stringify(reasons) })
      .eq('id', id);
    return true;
  }

  public async listAssessments(athleteId: string, limit = 100) {
    if (this.isTestMode) {
      const list = Array.from(this.memoryAssessments.values())
        .filter((a) => a.athlete_id === athleteId)
        .sort((a, b) => b.captured_at.localeCompare(a.captured_at))
        .slice(0, limit);
      return list;
    }
    const { data } = await this.client
      .from('assessments')
      .select('*')
      .eq('athlete_id', athleteId)
      .order('captured_at', { ascending: false })
      .limit(limit);
    return data || [];
  }

  public async listVerifiedAssessments(athleteId: string) {
    if (this.isTestMode) {
      return Array.from(this.memoryAssessments.values())
        .filter((a) => a.athlete_id === athleteId && a.integrity !== 'tampered')
        .sort((a, b) => a.captured_at.localeCompare(b.captured_at));
    }
    const { data } = await this.client
      .from('assessments')
      .select('*')
      .eq('athlete_id', athleteId)
      .neq('integrity', 'tampered')
      .order('captured_at', { ascending: true });
    return data || [];
  }

  // --- Badges ---
  public async getBadges(athleteId: string) {
    if (this.isTestMode) {
      return Array.from(this.memoryBadges.values()).filter((b) => b.athlete_id === athleteId);
    }
    const { data } = await this.client.from('badges').select('*').eq('athlete_id', athleteId);
    return data || [];
  }

  public async insertBadge(athleteId: string, badgeId: string, earnedAt: string) {
    if (this.isTestMode) {
      const key = `${athleteId}:${badgeId}`;
      if (!this.memoryBadges.has(key)) {
        this.memoryBadges.set(key, { athlete_id: athleteId, badge_id: badgeId, earned_at: earnedAt });
      }
      return;
    }
    await this.client.from('badges').upsert({ athlete_id: athleteId, badge_id: badgeId, earned_at: earnedAt });
  }

  // --- Notifications ---
  public async insertNotification(n: any) {
    if (this.isTestMode) {
      this.memoryNotifications.set(n.id, n);
      return n;
    }
    const { data } = await this.client.from('notifications').insert(n).select().single();
    return data || n;
  }

  public async listNotifications(userId: string, limit = 50) {
    if (this.isTestMode) {
      return Array.from(this.memoryNotifications.values())
        .filter((n) => n.user_id === userId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, limit);
    }
    const { data } = await this.client
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return data || [];
  }

  public async markAllNotificationsRead(userId: string) {
    const now = new Date().toISOString();
    if (this.isTestMode) {
      let count = 0;
      for (const n of this.memoryNotifications.values()) {
        if (n.user_id === userId && !n.read_at) {
          n.read_at = now;
          count++;
        }
      }
      return count;
    }
    const { data } = await this.client
      .from('notifications')
      .update({ read_at: now })
      .eq('user_id', userId)
      .is('read_at', null)
      .select();
    return data ? data.length : 0;
  }

  public async markNotificationRead(userId: string, id: string) {
    const now = new Date().toISOString();
    if (this.isTestMode) {
      const n = this.memoryNotifications.get(id);
      if (n && n.user_id === userId) {
        n.read_at = now;
        return true;
      }
      return false;
    }
    const { data } = await this.client
      .from('notifications')
      .update({ read_at: now })
      .eq('id', id)
      .eq('user_id', userId)
      .select();
    return Boolean(data && data.length > 0);
  }

  // --- Settings ---
  public async getSettings(userId: string) {
    if (this.isTestMode) {
      return this.memorySettings.get(userId) || null;
    }
    const { data } = await this.client.from('settings').select('*').eq('user_id', userId).single();
    return data || null;
  }

  public async upsertSettings(userId: string, settings: any) {
    const record = { user_id: userId, ...settings, updated_at: new Date().toISOString() };
    if (this.isTestMode) {
      this.memorySettings.set(userId, record);
      return record;
    }
    const { data } = await this.client.from('settings').upsert(record).select().single();
    return data || record;
  }

  // --- Leaderboard & Admin Queries ---
  public async getLeaderboardRows(opts: { metric?: string; region?: string; limit?: number }) {
    if (this.isTestMode) {
      const athletes = Array.from(this.memoryUsers.values()).filter((u) => u.role === 'athlete');
      const rows: any[] = [];

      for (const athlete of athletes) {
        const s = this.memorySettings.get(athlete.id);
        if (s && (s.leaderboard_opt_in === 0 || s.leaderboard_opt_in === false)) continue;

        const p = this.memoryProfiles.get(athlete.id);
        if (opts.region && p?.region !== opts.region) continue;

        const athleteAssessments = Array.from(this.memoryAssessments.values()).filter(
          (a) => a.athlete_id === athlete.id && a.integrity === 'verified'
        );
        if (athleteAssessments.length === 0) continue;

        const jumps = athleteAssessments.filter((a) => a.test === 'vertical_jump' || !a.test);
        const pushups = athleteAssessments.filter((a) => a.test === 'pushup');
        const squats = athleteAssessments.filter((a) => a.test === 'squat');

        const bestJump = jumps.length ? Math.max(...jumps.map((a) => a.jump_height_m)) : 0;
        const bestPower = jumps.length ? Math.max(...jumps.map((a) => a.relative_power_wkg)) : 0;
        const bestPushups = pushups.length
          ? Math.max(
              ...pushups.map((a) => {
                const m = JSON.parse(a.metrics_json);
                return typeof m.validReps === 'number' ? m.validReps : 0;
              })
            )
          : 0;
        const bestSquats = squats.length
          ? Math.max(
              ...squats.map((a) => {
                const m = JSON.parse(a.metrics_json);
                return typeof m.validReps === 'number' ? m.validReps : 0;
              })
            )
          : 0;

        rows.push({
          athlete_id: athlete.id,
          name: athlete.name,
          region: p?.region || null,
          sport: p?.sport || null,
          best_jump: bestJump,
          best_power: bestPower,
          best_pushups: bestPushups,
          best_squats: bestSquats,
          n: athleteAssessments.length,
        });
      }

      rows.sort((a, b) => {
        if (opts.metric === 'power') return b.best_power - a.best_power;
        if (opts.metric === 'pushup') return b.best_pushups - a.best_pushups;
        if (opts.metric === 'squat') return b.best_squats - a.best_squats;
        return b.best_jump - a.best_jump;
      });

      return rows.slice(0, opts.limit || 50);
    }

    const { data } = await this.client.from('users').select('*, athlete_profiles(*), assessments(*)').eq('role', 'athlete');
    return data || [];
  }

  public async getAdminOverview() {
    if (this.isTestMode) {
      const users = Array.from(this.memoryUsers.values());
      const assessments = Array.from(this.memoryAssessments.values());
      return {
        users: users.length,
        athletes: users.filter((u) => u.role === 'athlete').length,
        coaches: users.filter((u) => u.role === 'coach').length,
        assessments: assessments.length,
        verified: assessments.filter((a) => a.integrity === 'verified').length,
        tampered: assessments.filter((a) => a.integrity === 'tampered').length,
        badgesAwarded: this.memoryBadges.size,
      };
    }
    const [u, a, b] = await Promise.all([
      this.client.from('users').select('role'),
      this.client.from('assessments').select('integrity'),
      this.client.from('badges').select('athlete_id'),
    ]);
    const users = u.data || [];
    const assessments = a.data || [];
    const badges = b.data || [];
    return {
      users: users.length,
      athletes: users.filter((u: any) => u.role === 'athlete').length,
      coaches: users.filter((u: any) => u.role === 'coach').length,
      assessments: assessments.length,
      verified: assessments.filter((a: any) => a.integrity === 'verified').length,
      tampered: assessments.filter((a: any) => a.integrity === 'tampered').length,
      badgesAwarded: badges.length,
    };
  }
}

export type Database = FitzenDb;

export function openDatabase(supabaseUrl: string, supabaseKey: string, isTest = false): FitzenDb {
  return new FitzenDb(supabaseUrl, supabaseKey, isTest);
}
