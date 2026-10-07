-- Apply after 002_compete.sql. Legacy tables are optional: this is safe on a fresh accounts project.
-- Local repository change only; review and apply in a staging database before production.
-- Birth year cannot establish the birthday: the entire eighteenth-birthday year stays protected.
create or replace function public.is_minor(birth_year int) returns boolean
language sql stable as $$ select birth_year is null or extract(year from now())::int - birth_year <= 18 $$;

-- The old server authenticates its own JWTs, which Supabase RLS cannot map to auth.uid().
-- Therefore only the server's secret/service role may access its legacy persistence tables.
do $$
declare t text; p record;
begin
  foreach t in array array['users','athlete_profiles','assessments','badges','notifications','settings'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on table public.%I from public, anon, authenticated', t);
      if exists (select 1 from pg_roles where rolname = 'service_role') then
        execute format('grant all on table public.%I to service_role', t);
      end if;
      for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
        execute format('drop policy %I on public.%I', p.policyname, t);
      end loop;
    end if;
  end loop;
end $$;

-- Canonical metrics mirror the catalog, rather than trusting a client's metric selection.
-- Throws and horizontal/box jumps have no supported headline distance/height and cannot enter these boards.
create or replace function public.exercise_metric(exercise text) returns text
language sql immutable as $$
  select metric from (values
    ('back-squat', 'reps'),
    ('front-squat', 'reps'),
    ('goblet-squat', 'reps'),
    ('sumo-squat', 'reps'),
    ('bench-press', 'reps'),
    ('incline-bench-press', 'reps'),
    ('overhead-press', 'reps'),
    ('conventional-deadlift', 'reps'),
    ('romanian-deadlift', 'reps'),
    ('bent-over-row', 'reps'),
    ('dumbbell-curl', 'reps'),
    ('hammer-curl', 'reps'),
    ('overhead-triceps-extension', 'reps'),
    ('lateral-raise', 'reps'),
    ('front-raise', 'reps'),
    ('forward-lunge', 'reps'),
    ('bulgarian-split-squat', 'reps'),
    ('hip-thrust', 'reps'),
    ('glute-bridge', 'reps'),
    ('standing-calf-raise', 'reps'),
    ('good-morning', 'reps'),
    ('upright-row', 'reps'),
    ('kettlebell-swing', 'reps'),
    ('dumbbell-shoulder-press', 'reps'),
    ('push-up', 'reps'),
    ('knee-push-up', 'reps'),
    ('diamond-push-up', 'reps'),
    ('pike-push-up', 'reps'),
    ('pull-up', 'reps'),
    ('chin-up', 'reps'),
    ('parallel-bar-dip', 'reps'),
    ('bench-dip', 'reps'),
    ('bodyweight-squat', 'reps'),
    ('jump-squat', 'reps'),
    ('pistol-squat', 'reps'),
    ('burpee', 'reps'),
    ('mountain-climber', 'reps'),
    ('crunch', 'reps'),
    ('lying-leg-raise', 'reps'),
    ('plank', 'holdSec'),
    ('side-plank', 'holdSec'),
    ('hollow-body-hold', 'holdSec'),
    ('wall-sit', 'holdSec'),
    ('l-sit', 'holdSec'),
    ('sprint-start-set', 'holdSec'),
    ('high-knees', 'reps'),
    ('a-skip', 'reps'),
    ('butt-kicks', 'reps'),
    ('countermovement-jump', 'jumpHeightCm'),
    ('squat-jump', 'jumpHeightCm'),
    ('lateral-bound', 'reps'),
    ('power-clean', 'reps'),
    ('hang-clean', 'reps'),
    ('snatch', 'reps'),
    ('push-jerk', 'reps'),
    ('split-jerk', 'reps'),
    ('split-jerk-catch-hold', 'holdSec'),
    ('sai-sit-up', 'reps'),
    ('sai-partial-curl-up', 'reps'),
    ('sai-sit-and-reach', 'holdSec'),
    ('sai-flamingo-balance', 'holdSec'),
    ('sai-push-up', 'reps'),
    ('sai-vertical-jump', 'jumpHeightCm'),
    ('tree-pose', 'holdSec'),
    ('warrior-ii', 'holdSec'),
    ('warrior-i', 'holdSec'),
    ('chair-pose', 'holdSec'),
    ('downward-dog', 'holdSec'),
    ('cobra-pose', 'holdSec'),
    ('triangle-pose', 'holdSec'),
    ('boat-pose', 'holdSec'),
    ('bridge-pose', 'holdSec'),
    ('mountain-pose', 'holdSec'),
    ('deep-squat-hold', 'holdSec'),
    ('overhead-reach-test', 'holdSec'),
    ('hip-hinge-drill', 'reps'),
    ('standing-toe-touch', 'holdSec'),
    ('knee-to-wall', 'holdSec'),
    ('arm-circles', 'reps')
  ) as catalog(id, metric) where id = exercise
$$;
-- NOT VALID preserves historical rows for review; new writes are checked immediately.
-- Historical mismatches are excluded from leaderboard() below.
alter table public.results add constraint results_canonical_metric
  check (public.exercise_metric(exercise_id) is not null and metric = public.exercise_metric(exercise_id)) not valid;

-- Keep consent timestamps writable only by the consent RPCs, including projects with older broad grants.
revoke insert, update on public.profiles from public, anon, authenticated;
grant insert (id, display_name, birth_year, sex, city, state, country, public_boards, parent_email) on public.profiles to authenticated;
grant update (display_name, birth_year, sex, city, state, country, public_boards, parent_email) on public.profiles to authenticated;

-- A child cannot lower a stored birth year to bypass the gate. Corrections require trusted review.
create or replace function public.profiles_reset_consent() returns trigger
language plpgsql as $$
begin
  if auth.uid() = old.id and public.is_minor(old.birth_year) and new.birth_year < old.birth_year then
    raise exception 'Birth-year corrections require a trusted review while this profile is protected';
  end if;
  if new.birth_year is distinct from old.birth_year or lower(new.parent_email) is distinct from lower(old.parent_email) then
    new.parent_consent_at := null;
  end if;
  return new;
end $$;

-- Consent grants only public leaderboard publication. It is never permission for external AI processing.
-- A verified mailbox is not proof of adulthood or parental identity; that verification remains a release requirement.
create or replace function public.give_parent_consent(child uuid) returns boolean
language plpgsql security definer set search_path = public, auth as $$
declare parent text;
begin
  select lower(u.email) into parent from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null;
  if auth.uid() is null or child = auth.uid() or parent is null then return false; end if;
  update profiles p set parent_consent_at = now()
  where p.id = child and lower(p.parent_email) = parent
    and parent <> (select lower(u.email) from auth.users u where u.id = child);
  return found;
end $$;

create or replace function public.revoke_parent_consent(child uuid) returns boolean
language plpgsql security definer set search_path = public, auth as $$
declare parent text;
begin
  select lower(u.email) into parent from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null;
  if auth.uid() is null or child = auth.uid() or parent is null then return false; end if;
  update profiles p set parent_consent_at = null, public_boards = false
  where p.id = child and lower(p.parent_email) = parent
    and parent <> (select lower(u.email) from auth.users u where u.id = child);
  return found;
end $$;
revoke execute on function public.revoke_parent_consent(uuid) from public, anon;
grant execute on function public.revoke_parent_consent(uuid) to authenticated;

-- Serialize joins against the group row so concurrent joins cannot overrun the fifty-member cap.
create or replace function public.join_group(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if not exists (select 1 from profiles where id = auth.uid()) then raise exception 'create your profile first'; end if;
  select id into g from groups where invite_code = upper(btrim(code)) for update;
  if g is null then raise exception 'invalid invite code'; end if;
  if exists (select 1 from group_members where group_id = g and user_id = auth.uid()) then return g; end if;
  if (select count(*) from group_members where group_id = g) >= 50 then raise exception 'group is full (50 members)'; end if;
  insert into group_members (group_id, user_id) values (g, auth.uid()) on conflict do nothing;
  return g;
end $$;

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
    where r.exercise_id = exercise and r.metric = public.exercise_metric(exercise)
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

