-- Fitzen accounts, results, groups and leaderboards. For a FRESH Supabase project (never the old live one).
-- Sign-in: Supabase Auth email magic link. Video never reaches the database: only the headline number per session.
--
-- Privacy (DPDP Act 2023): under-18s appear on public boards (city/state/country/world) only after a parent confirms
-- from their own email (give_parent_consent), and always as initials. Groups are invite-only.
-- Nobody can read another user's profile or results rows directly: the leaderboard() function returns only
-- rank, display name (initials for minors), value and form score.

create extension if not exists pgcrypto;

create or replace function public.is_minor(birth_year int) returns boolean
language sql stable as $$ select extract(year from now())::int - birth_year < 18 $$;

-- "Ravi Kumar" -> "R.K.": how minors are shown to anyone but themselves.
create or replace function public.initials(name text) returns text
language sql immutable as $$
  select coalesce(string_agg(upper(left(w, 1)) || '.', '' order by i), '?')
  from unnest(regexp_split_to_array(btrim(name), '\s+')) with ordinality as t(w, i) where w <> ''
$$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key default auth.uid() references auth.users on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  birth_year int not null check (birth_year between 1920 and 2030),
  sex text check (sex in ('male', 'female')),
  city text check (char_length(city) <= 60),
  state text check (char_length(state) <= 60),
  country text not null default 'India' check (char_length(country) between 2 and 60),
  public_boards boolean not null default false,
  parent_email text check (parent_email is null or parent_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  parent_consent_at timestamptz,
  created_at timestamptz not null default now()
);

-- Changing the birth year or parent email voids an earlier parent consent.
create or replace function public.profiles_reset_consent() returns trigger
language plpgsql as $$
begin
  if new.birth_year is distinct from old.birth_year or lower(new.parent_email) is distinct from lower(old.parent_email) then
    new.parent_consent_at := null;
  end if;
  return new;
end $$;
create trigger profiles_reset_consent before update on public.profiles
  for each row execute function public.profiles_reset_consent();

alter table public.profiles enable row level security;
create policy "own profile: read" on public.profiles for select using (id = auth.uid());
create policy "own profile: insert" on public.profiles for insert with check (id = auth.uid());
create policy "own profile: update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "own profile: delete" on public.profiles for delete using (id = auth.uid());
-- parent_consent_at is writable only through give_parent_consent().
revoke insert, update on public.profiles from anon, authenticated;
grant insert (id, display_name, birth_year, sex, city, state, country, public_boards, parent_email) on public.profiles to authenticated;
grant update (display_name, birth_year, sex, city, state, country, public_boards, parent_email) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Results: one row per finished camera/video session (demo runs are never uploaded)
-- ---------------------------------------------------------------------------
create table public.results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  exercise_id text not null check (exercise_id ~ '^[a-z0-9-]{1,60}$'),
  metric text not null check (metric in ('reps', 'holdSec', 'jumpHeightCm')),
  -- Physical plausibility caps. ponytail: client-reported values; signed assessments (roadmap 5) before boards carry prizes.
  value real not null check (value >= 0 and value <= case metric when 'reps' then 500 when 'holdSec' then 3600 else 120 end),
  form_score smallint not null check (form_score between 0 and 100),
  source text not null check (source in ('camera', 'video')),
  created_at timestamptz not null default now()
);
create index results_board on public.results (exercise_id, user_id);

alter table public.results enable row level security;
create policy "own results: read" on public.results for select using (user_id = auth.uid());
create policy "own results: insert" on public.results for insert with check (user_id = auth.uid());
create policy "own results: delete" on public.results for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Groups (invite code) and members
-- ---------------------------------------------------------------------------
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  owner uuid not null default auth.uid() references public.profiles on delete cascade,
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  created_at timestamptz not null default now()
);
create table public.group_members (
  group_id uuid not null references public.groups on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- Security definer so policies can ask "is the caller in this group?" without recursing into group_members' own RLS.
create or replace function public.is_member(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = g and user_id = auth.uid())
$$;

-- The owner joins their own group automatically.
create or replace function public.groups_add_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into group_members (group_id, user_id) values (new.id, new.owner);
  return new;
end $$;
create trigger groups_add_owner after insert on public.groups
  for each row execute function public.groups_add_owner();

alter table public.groups enable row level security;
-- owner = auth.uid(): INSERT ... RETURNING checks this policy before the trigger above adds the owner as a member.
create policy "groups: members read" on public.groups for select using (owner = auth.uid() or public.is_member(id));
create policy "groups: create own" on public.groups for insert with check (owner = auth.uid());
create policy "groups: owner renames" on public.groups for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy "groups: owner deletes" on public.groups for delete using (owner = auth.uid());
revoke update on public.groups from anon, authenticated;
grant update (name) on public.groups to authenticated;

alter table public.group_members enable row level security;
create policy "members: see fellow members" on public.group_members for select using (public.is_member(group_id));
-- Leave a group yourself, or the owner removes someone. Joining goes through join_group() only.
create policy "members: leave or owner removes" on public.group_members for delete
  using (user_id = auth.uid() or exists (select 1 from public.groups g where g.id = group_id and g.owner = auth.uid()));
revoke insert, update on public.group_members from anon, authenticated;

create or replace function public.join_group(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if not exists (select 1 from profiles where id = auth.uid()) then raise exception 'create your profile first'; end if;
  select id into g from groups where invite_code = upper(btrim(code));
  if g is null then raise exception 'invalid invite code'; end if;
  if (select count(*) from group_members where group_id = g) >= 50 then raise exception 'group is full (50 members)'; end if;
  insert into group_members (group_id, user_id) values (g, auth.uid()) on conflict do nothing;
  return g;
end $$;

-- Group member names for the group screen (same masking as the leaderboard).
create or replace function public.group_roster(g uuid)
returns table (display_name text, is_owner boolean, is_me boolean)
language sql stable security definer set search_path = public as $$
  select case when p.id = auth.uid() or not public.is_minor(p.birth_year) then p.display_name
              else public.initials(p.display_name) end,
         p.id = gr.owner, p.id = auth.uid()
  from group_members m join profiles p on p.id = m.user_id join groups gr on gr.id = m.group_id
  where m.group_id = g and public.is_member(g)
  order by m.joined_at
$$;

-- ---------------------------------------------------------------------------
-- Parent consent for under-18s: the parent signs in with the email the child entered and confirms.
-- ---------------------------------------------------------------------------
create or replace function public.give_parent_consent(child uuid) returns boolean
language plpgsql security definer set search_path = public, auth as $$
declare parent text := lower(auth.jwt() ->> 'email');
begin
  if auth.uid() is null or child = auth.uid() or parent is null then return false; end if;
  update profiles p set parent_consent_at = now()
  where p.id = child and lower(p.parent_email) = parent
    and parent <> (select lower(u.email) from auth.users u where u.id = child); -- a child can't consent for themselves
  return found;
end $$;

-- What the parent sees before confirming.
create or replace function public.consent_request(child uuid)
returns table (display_name text, birth_year int, consented boolean)
language sql stable security definer set search_path = public as $$
  select p.display_name, p.birth_year, p.parent_consent_at is not null from profiles p
  where p.id = child and lower(p.parent_email) = lower(auth.jwt() ->> 'email')
$$;

-- ---------------------------------------------------------------------------
-- Leaderboard
-- ---------------------------------------------------------------------------

-- scope: 'group' (needs grp) | 'city' | 'state' | 'country' | 'world'. sort: 'value' (performance) | 'form' (accuracy).
-- Each user's single best session for the exercise; caller's own row is always included even outside the top `lim`.
create or replace function public.leaderboard(exercise text, scope text, grp uuid default null, sort text default 'value', lim int default 50)
returns table (rank bigint, display_name text, value real, form_score smallint, metric text, is_me boolean, at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare me profiles;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select * into me from profiles where id = auth.uid();
  if me.id is null then raise exception 'create your profile first'; end if;
  lim := least(greatest(coalesce(lim, 50), 1), 200);
  if scope not in ('group', 'city', 'state', 'country', 'world') or sort not in ('value', 'form') then raise exception 'bad scope or sort'; end if;
  if scope = 'group' and (grp is null or not is_member(grp)) then raise exception 'not a member of this group'; end if;
  if scope = 'city' and coalesce(btrim(me.city), '') = '' then raise exception 'add your city to your profile'; end if;
  if scope = 'state' and coalesce(btrim(me.state), '') = '' then raise exception 'add your state to your profile'; end if;
  return query
  with eligible as (
    select p.* from profiles p
    where p.id = me.id
       or (scope = 'group' and exists (select 1 from group_members m where m.group_id = grp and m.user_id = p.id))
       or (scope <> 'group' and p.public_boards and (not is_minor(p.birth_year) or p.parent_consent_at is not null)
           and case scope
                 when 'city' then lower(btrim(p.city)) = lower(btrim(me.city)) and lower(btrim(p.state)) = lower(btrim(me.state))
                 when 'state' then lower(btrim(p.state)) = lower(btrim(me.state)) and p.country = me.country
                 when 'country' then p.country = me.country
                 else true end)
  ), best as (
    select distinct on (r.user_id) r.user_id, r.value, r.form_score, r.metric, r.created_at
    from results r join eligible e on e.id = r.user_id
    where r.exercise_id = exercise
    order by r.user_id,
      case when sort = 'form' then r.form_score::real else r.value end desc,
      case when sort = 'form' then r.value else r.form_score::real end desc,
      r.created_at
  ), ranked as (
    select b.*, rank() over (order by
      case when sort = 'form' then b.form_score::real else b.value end desc,
      case when sort = 'form' then b.value else b.form_score::real end desc) as rk
    from best b
  )
  select rk, case when e.id = me.id or not is_minor(e.birth_year) then e.display_name else initials(e.display_name) end,
         rk_.value, rk_.form_score, rk_.metric, e.id = me.id, rk_.created_at
  from ranked rk_ join eligible e on e.id = rk_.user_id
  where rk_.rk <= lim or e.id = me.id
  order by rk_.rk, rk_.created_at;
end $$;

-- Functions are executable by PUBLIC by default: only signed-in users may call these.
revoke execute on function public.leaderboard, public.join_group, public.group_roster, public.give_parent_consent, public.consent_request from public, anon;
grant execute on function public.leaderboard, public.join_group, public.group_roster, public.give_parent_consent, public.consent_request to authenticated;
