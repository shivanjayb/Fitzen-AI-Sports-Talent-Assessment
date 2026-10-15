-- 005: one account on every device, coach and admin portals, coach API keys.
-- Apply after 004 on the fresh Fitzen project only (never the old live one). Tested locally with supabase/tests/run.sh.
--
-- Roles: everyone starts as 'athlete'. An adult asks to coach (request_coach); an admin approves (review_coach).
-- The first admin is set once by the project owner in the SQL editor:
--   update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'you@example.com');
--
-- Privacy (DPDP Act 2023): joining a coach's squad is the athlete's consent to share full session reports with that
-- coach. Under-18s are only visible to a coach after a parent confirms (same parent consent as public boards) and
-- always as initials. Video never reaches the database: sessions hold the on-device analysis only.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
-- Not in the column grants of 002/003, so only the security-definer functions below can change it.
alter table public.profiles add column role text not null default 'athlete' check (role in ('athlete', 'coach', 'admin'));

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from profiles where id = auth.uid()), 'athlete')
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin')
$$;

create table public.coach_requests (
  user_id uuid primary key references public.profiles on delete cascade,
  organisation text not null check (char_length(btrim(organisation)) between 2 and 80),
  note text check (char_length(note) <= 400),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles on delete set null
);
alter table public.coach_requests enable row level security;
create policy "coach requests: own or admin" on public.coach_requests for select using (user_id = auth.uid() or public.is_admin());
revoke all on public.coach_requests from anon, authenticated;
grant select on public.coach_requests to authenticated;

create or replace function public.request_coach(organisation text, note text default null) returns text
language plpgsql security definer set search_path = public as $$
declare me profiles;
begin
  select * into me from profiles where id = auth.uid();
  if me.id is null then raise exception 'create your profile first'; end if;
  if is_minor(me.birth_year) then raise exception 'coaches must be adults'; end if;
  if me.role <> 'athlete' then return me.role; end if;
  insert into coach_requests (user_id, organisation, note) values (me.id, btrim(organisation), nullif(btrim(note), ''))
  on conflict (user_id) do update set organisation = excluded.organisation, note = excluded.note, status = 'pending',
    created_at = now(), reviewed_at = null, reviewed_by = null
  where coach_requests.status <> 'pending';
  return 'pending';
end $$;

create or replace function public.review_coach(target uuid, approve boolean) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only'; end if;
  update coach_requests set status = case when approve then 'approved' else 'rejected' end, reviewed_at = now(), reviewed_by = auth.uid()
  where user_id = target and status = 'pending';
  if not found then return false; end if;
  if approve then update profiles set role = 'coach' where id = target and role = 'athlete'; end if;
  return true;
end $$;

-- An admin can't change their own role, so the last admin can't lock everyone out by accident.
create or replace function public.set_role(target uuid, new_role text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only'; end if;
  if target = auth.uid() then raise exception 'ask another admin to change your role'; end if;
  if new_role not in ('athlete', 'coach', 'admin') then raise exception 'bad role'; end if;
  if new_role <> 'athlete' and (select is_minor(birth_year) from profiles where id = target) then raise exception 'coaches and admins must be adults'; end if;
  update profiles set role = new_role where id = target;
  return found;
end $$;

-- ---------------------------------------------------------------------------
-- Cross-device sync: the device profile and full session reports, private to the owner
-- ---------------------------------------------------------------------------
create table public.athlete_data (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  profile jsonb not null check (jsonb_typeof(profile) = 'object' and pg_column_size(profile) <= 16384),
  updated_at timestamptz not null default now()
);
alter table public.athlete_data enable row level security;
create policy "own data" on public.athlete_data for all using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.athlete_data from anon;

-- One row per finished camera/video session (demos stay on the device). id = the client's cloudId, so retries are idempotent.
-- verdict: the device's genuineness check (integrity + forensics + movement match), shown to coaches.
-- ponytail: client-computed like results.value; signed assessments (roadmap) make tampering detectable.
create table public.sessions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  exercise_id text not null check (exercise_id ~ '^[a-z0-9-]{1,60}$'),
  source text not null check (source in ('camera', 'video')),
  started_at timestamptz not null,
  verdict text not null check (verdict in ('genuine', 'review', 'suspect')),
  form_score smallint not null check (form_score between 0 and 100),
  data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 262144),
  updated_at timestamptz not null default now()
);
create index sessions_user_time on public.sessions (user_id, started_at desc);
alter table public.sessions enable row level security;
create policy "own sessions" on public.sessions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.sessions from anon;

-- ---------------------------------------------------------------------------
-- Squads: a coach's invite-code group. Joining uses join_group() from 002/003.
-- ---------------------------------------------------------------------------
alter table public.groups add column kind text not null default 'group' check (kind in ('group', 'squad'));
-- Only coaches/admins may create squads. alter (not drop + create) keeps the change non-destructive.
alter policy "groups: create own" on public.groups
  with check (owner = auth.uid() and (kind = 'group' or public.my_role() in ('coach', 'admin')));

-- True when the caller owns squad g as a coach/admin and athlete a is a member they may see.
create or replace function public.coach_sees(g uuid, a uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from groups gr join group_members m on m.group_id = gr.id join profiles p on p.id = m.user_id
    where gr.id = g and gr.kind = 'squad' and gr.owner = auth.uid() and m.user_id = a and a <> gr.owner
      and my_role() in ('coach', 'admin') and (not is_minor(p.birth_year) or p.parent_consent_at is not null))
$$;

create or replace function public.squad_athletes(g uuid)
returns table (athlete uuid, display_name text, minor boolean, visible boolean, sessions_30d bigint, avg_form int,
               genuine bigint, review bigint, suspect bigint, last_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, case when is_minor(p.birth_year) then initials(p.display_name) else p.display_name end,
         is_minor(p.birth_year), v.ok, coalesce(st.n30, 0), st.af, coalesce(st.ng, 0), coalesce(st.nr, 0), coalesce(st.ns, 0), st.last
  from groups gr join group_members m on m.group_id = gr.id join profiles p on p.id = m.user_id
  cross join lateral (select not is_minor(p.birth_year) or p.parent_consent_at is not null as ok) v
  left join lateral (
    select count(*) filter (where s.started_at > now() - interval '30 days') n30, round(avg(s.form_score))::int af,
           count(*) filter (where s.verdict = 'genuine') ng, count(*) filter (where s.verdict = 'review') nr,
           count(*) filter (where s.verdict = 'suspect') ns, max(s.started_at) last
    from sessions s where s.user_id = p.id and v.ok
  ) st on true
  where gr.id = g and gr.kind = 'squad' and gr.owner = auth.uid() and p.id <> gr.owner and my_role() in ('coach', 'admin')
  order by 2
$$;

create or replace function public.athlete_sessions(g uuid, athlete uuid, lim int default 50)
returns setof public.sessions
language sql stable security definer set search_path = public as $$
  select s.* from sessions s
  where s.user_id = athlete and coach_sees(g, athlete)
  order by s.started_at desc limit least(greatest(coalesce(lim, 50), 1), 200)
$$;

-- ---------------------------------------------------------------------------
-- API keys for coaches: read their squads' reports from other tools.
-- Only a SHA-256 of the key is stored (keys are 192-bit random, so a fast hash is enough); the key is shown once.
-- ---------------------------------------------------------------------------
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  prefix text not null,
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
alter table public.api_keys enable row level security;
create policy "api keys: own" on public.api_keys for select using (owner = auth.uid());
revoke all on public.api_keys from anon, authenticated;
grant select (id, name, prefix, created_at, last_used_at, revoked_at) on public.api_keys to authenticated;

create or replace function public.create_api_key(name text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare k text := 'fz_' || encode(gen_random_bytes(24), 'hex');
begin
  if my_role() not in ('coach', 'admin') then raise exception 'coaches only'; end if;
  if (select count(*) from api_keys where owner = auth.uid() and revoked_at is null) >= 5 then raise exception 'revoke a key first (5 active keys max)'; end if;
  insert into api_keys (owner, name, prefix, key_hash) values (auth.uid(), btrim(name), left(k, 10), encode(digest(k, 'sha256'), 'hex'));
  return k;
end $$;

create or replace function public.revoke_api_key(key_id uuid) returns boolean
language sql security definer set search_path = public as $$
  update api_keys set revoked_at = now() where id = key_id and owner = auth.uid() and revoked_at is null returning true
$$;

-- POST /rest/v1/rpc/api_squad_report {"api_key": "fz_..."} with the project's publishable key as `apikey`.
-- Last 90 days, up to 200 sessions per athlete, same visibility rules as the coach portal.
create or replace function public.api_squad_report(api_key text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare k api_keys;
begin
  if api_key is null or api_key !~ '^fz_[0-9a-f]{48}$' then raise exception 'invalid api key'; end if;
  select * into k from api_keys where key_hash = encode(digest(api_key, 'sha256'), 'hex') and revoked_at is null;
  if k.id is null or (select role from profiles where id = k.owner) not in ('coach', 'admin') then raise exception 'invalid api key'; end if;
  update api_keys set last_used_at = now() where id = k.id;
  return jsonb_build_object('generated_at', now(), 'squads', coalesce((
    select jsonb_agg(jsonb_build_object('id', gr.id, 'name', gr.name, 'athletes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'display_name', case when is_minor(p.birth_year) then initials(p.display_name) else p.display_name end,
        'sessions', coalesce((
          select jsonb_agg(jsonb_build_object('id', s.id, 'exercise_id', s.exercise_id, 'started_at', s.started_at, 'source', s.source,
            'verdict', s.verdict, 'form_score', s.form_score, 'grade', s.data #>> '{report,grade}',
            'reps', s.data #> '{report,reps,valid}', 'hold_sec', s.data #> '{report,hold,bestSec}') order by s.started_at desc)
          from (select * from sessions where user_id = p.id and started_at > now() - interval '90 days' order by started_at desc limit 200) s), '[]')))
      from group_members m join profiles p on p.id = m.user_id
      where m.group_id = gr.id and p.id <> gr.owner and (not is_minor(p.birth_year) or p.parent_consent_at is not null)), '[]')))
    from groups gr where gr.owner = k.owner and gr.kind = 'squad'), '[]'));
end $$;

-- ---------------------------------------------------------------------------
-- Admin portal
-- ---------------------------------------------------------------------------
create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not is_admin() then raise exception 'admins only'; end if;
  return jsonb_build_object(
    'accounts', (select count(*) from auth.users),
    'profiles', (select count(*) from profiles),
    'minors', (select count(*) from profiles where is_minor(birth_year)),
    'coaches', (select count(*) from profiles where role = 'coach'),
    'admins', (select count(*) from profiles where role = 'admin'),
    'squads', (select count(*) from groups where kind = 'squad'),
    'pending_coaches', (select count(*) from coach_requests where status = 'pending'),
    'sessions_7d', (select count(*) from sessions where started_at > now() - interval '7 days'),
    'sessions_30d', (select count(*) from sessions where started_at > now() - interval '30 days'),
    'active_30d', (select count(distinct user_id) from sessions where started_at > now() - interval '30 days'),
    'verdicts_30d', coalesce((select jsonb_object_agg(verdict, n) from (select verdict, count(*) n from sessions where started_at > now() - interval '30 days' group by verdict) v), '{}'),
    'top_exercises_30d', coalesce((select jsonb_agg(jsonb_build_object('exercise_id', exercise_id, 'sessions', n) order by n desc) from (
      select exercise_id, count(*) n from sessions where started_at > now() - interval '30 days' group by exercise_id order by n desc limit 8) t), '[]'));
end $$;

create or replace function public.admin_users(q text default '', lim int default 50)
returns table (id uuid, display_name text, role text, minor boolean, created_at timestamptz, sessions bigint, coach_request text, organisation text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only'; end if;
  return query
  select p.id, case when is_minor(p.birth_year) then initials(p.display_name) else p.display_name end, p.role, is_minor(p.birth_year),
         p.created_at, (select count(*) from sessions s where s.user_id = p.id), c.status, c.organisation
  from profiles p left join coach_requests c on c.user_id = p.id
  where coalesce(q, '') = '' or p.display_name ilike '%' || replace(replace(q, '%', ''), '_', '') || '%'
  order by (c.status = 'pending') desc nulls last, p.created_at desc
  limit least(greatest(coalesce(lim, 50), 1), 200);
end $$;

-- Functions are executable by PUBLIC by default: only signed-in users may call these; the API key read is the exception.
revoke execute on function public.my_role, public.is_admin, public.request_coach, public.review_coach, public.set_role,
  public.coach_sees, public.squad_athletes, public.athlete_sessions, public.create_api_key, public.revoke_api_key,
  public.api_squad_report, public.admin_stats, public.admin_users from public, anon;
grant execute on function public.my_role, public.is_admin, public.request_coach, public.review_coach, public.set_role,
  public.coach_sees, public.squad_athletes, public.athlete_sessions, public.create_api_key, public.revoke_api_key,
  public.api_squad_report, public.admin_stats, public.admin_users to authenticated;
grant execute on function public.api_squad_report to anon;
