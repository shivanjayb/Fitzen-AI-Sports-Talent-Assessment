-- 010: temporary coach access, coach <-> athlete requests and chat, activity and size-class leaderboards,
-- friend-group join requests, coach talent boards, AI review quota. Additive: no existing data is changed.
--
-- Privacy rules kept from 002/005: under-18s are visible to others only after a parent confirms and always as
-- initials; nobody reads another user's rows directly, only through the functions below.

-- ---------------------------------------------------------------------------
-- Temporary coach access: any adult can try the coach portal for 14 days, once. Shown as "temporary" everywhere.
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists coach_trial_until timestamptz; -- not in the column grants: set only below

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select case when role = 'athlete' and coach_trial_until > now() and not is_minor(birth_year) then 'coach' else role end
                   from profiles where id = auth.uid()), 'athlete')
$$;

create or replace function public.start_coach_trial() returns timestamptz
language plpgsql security definer set search_path = public as $$
declare me profiles;
begin
  select * into me from profiles where id = auth.uid();
  if me.id is null then raise exception 'create your profile first'; end if;
  if is_minor(me.birth_year) then raise exception 'coaches must be adults'; end if;
  if me.coach_trial_until is not null then raise exception 'temporary coach access was already used; apply for a coach account'; end if;
  update profiles set coach_trial_until = now() + interval '14 days' where id = me.id returning coach_trial_until into me.coach_trial_until;
  return me.coach_trial_until;
end $$;

-- Coaches an athlete can ask. Organisation comes from the coach application when there is one.
create or replace function public.coach_directory()
returns table (id uuid, display_name text, organisation text, temporary boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, cr.organisation, p.role = 'athlete'
  from profiles p left join coach_requests cr on cr.user_id = p.id
  where auth.uid() is not null and p.id <> auth.uid() and not is_minor(p.birth_year)
    and (p.role in ('coach', 'admin') or p.coach_trial_until > now())
  order by (p.role = 'athlete'), p.display_name limit 100
$$;

-- ---------------------------------------------------------------------------
-- Connections: one coach, one athlete. The side that did not start it must accept before anything is shared.
-- Accepting lets the coach read the athlete's session reports (connection_sessions) and both sides chat.
-- ---------------------------------------------------------------------------
create table public.connections (
  id uuid primary key default gen_random_uuid(),
  coach uuid not null references public.profiles on delete cascade,
  athlete uuid not null references public.profiles on delete cascade,
  started_by uuid not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  exercise_id text check (exercise_id ~ '^[a-z0-9-]{1,60}$'),
  created_at timestamptz not null default now(),
  unique (coach, athlete), check (coach <> athlete)
);
alter table public.connections enable row level security;
create policy "connections: both sides read" on public.connections for select using (coach = auth.uid() or athlete = auth.uid());
create policy "connections: either side ends" on public.connections for delete using (coach = auth.uid() or athlete = auth.uid());
revoke all on public.connections from anon, authenticated;
grant select, delete on public.connections to authenticated;

create table public.messages (
  id bigint generated always as identity primary key,
  connection_id uuid not null references public.connections on delete cascade,
  sender uuid not null default auth.uid(),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index messages_thread on public.messages (connection_id, id);
alter table public.messages enable row level security;
create policy "messages: both sides read" on public.messages for select
  using (exists (select 1 from public.connections c where c.id = connection_id and (c.coach = auth.uid() or c.athlete = auth.uid())));
create policy "messages: send once accepted" on public.messages for insert
  with check (sender = auth.uid() and exists (select 1 from public.connections c where c.id = connection_id and c.status = 'accepted' and (c.coach = auth.uid() or c.athlete = auth.uid())));
revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;
grant insert (connection_id, body) on public.messages to authenticated;

-- A request carries one opening note; more messages only after the other side accepts.
create or replace function public.open_connection(c uuid, a uuid, note text, exercise text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid; st text;
begin
  select id, status into cid, st from connections where coach = c and athlete = a;
  if cid is null then
    insert into connections (coach, athlete, started_by, exercise_id) values (c, a, auth.uid(), nullif(exercise, '')) returning id into cid;
  elsif st = 'declined' then
    update connections set status = 'pending', started_by = auth.uid(), exercise_id = nullif(exercise, ''), created_at = now() where id = cid;
  elsif st = 'pending' then
    return cid; -- already waiting: no second note
  end if;
  if nullif(btrim(note), '') is not null then insert into messages (connection_id, sender, body) values (cid, auth.uid(), left(btrim(note), 2000)); end if;
  return cid;
end $$;
revoke execute on function public.open_connection from public, anon, authenticated; -- internal

create or replace function public.ask_coach(coach uuid, note text default null, exercise text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare me profiles;
begin
  select * into me from profiles where id = auth.uid();
  if me.id is null then raise exception 'create your profile first'; end if;
  if is_minor(me.birth_year) and me.parent_consent_at is null then raise exception 'a parent must confirm your account before you can contact a coach'; end if;
  if not exists (select 1 from profiles p where p.id = coach and p.id <> me.id and not is_minor(p.birth_year) and (p.role in ('coach', 'admin') or p.coach_trial_until > now())) then raise exception 'coach not found'; end if;
  return open_connection(coach, me.id, note, exercise);
end $$;

-- A coach can only invite athletes who chose to be on public boards (and, under 18, whose parent confirmed).
create or replace function public.invite_athlete(athlete uuid, note text default null, exercise text default null) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if my_role() not in ('coach', 'admin') then raise exception 'coaches only'; end if;
  if not exists (select 1 from profiles p where p.id = athlete and p.id <> auth.uid() and p.public_boards and (not is_minor(p.birth_year) or p.parent_consent_at is not null)) then raise exception 'this athlete is not open to contact'; end if;
  return open_connection(auth.uid(), athlete, note, exercise);
end $$;

create or replace function public.answer_connection(c uuid, accept boolean) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update connections set status = case when accept then 'accepted' else 'declined' end
  where id = c and status = 'pending' and started_by <> auth.uid() and (coach = auth.uid() or athlete = auth.uid());
  return found;
end $$;

-- Inbox: every connection of the caller with the other side's name and the latest message.
create or replace function public.my_connections()
returns table (id uuid, i_am text, other_name text, status text, started_by_me boolean, exercise_id text, created_at timestamptz, last_body text, last_at timestamptz, last_mine boolean)
language sql stable security definer set search_path = public as $$
  select c.id, case when c.coach = auth.uid() then 'coach' else 'athlete' end,
         case when c.coach = auth.uid() and is_minor(o.birth_year) then initials(o.display_name) else o.display_name end,
         c.status, c.started_by = auth.uid(), c.exercise_id, c.created_at, m.body, m.created_at, m.sender = auth.uid()
  from connections c join profiles o on o.id = case when c.coach = auth.uid() then c.athlete else c.coach end
  left join lateral (select body, created_at, sender from messages where connection_id = c.id order by id desc limit 1) m on true
  where c.coach = auth.uid() or c.athlete = auth.uid()
  order by coalesce(m.created_at, c.created_at) desc
$$;

-- The coach's view of a connected athlete's session reports (same rows the athlete syncs to their own account).
create or replace function public.connection_sessions(c uuid, lim int default 60)
returns setof public.sessions
language sql stable security definer set search_path = public as $$
  select s.* from sessions s join connections k on k.athlete = s.user_id
  where k.id = c and k.coach = auth.uid() and k.status = 'accepted'
  order by s.started_at desc limit least(greatest(coalesce(lim, 60), 1), 200)
$$;

-- ---------------------------------------------------------------------------
-- Leaderboards
-- ---------------------------------------------------------------------------
-- Who the caller may be ranked against. same_class: same 10 kg weight band and 10 cm height band (from the synced profile).
create or replace function public.board_people(scope text, grp uuid, same_class boolean) returns setof uuid
language plpgsql stable security definer set search_path = public as $$
declare me profiles; w real; h real;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select * into me from profiles where id = auth.uid();
  if me.id is null then raise exception 'create your profile first'; end if;
  if scope not in ('group', 'city', 'state', 'country', 'world') then raise exception 'bad scope'; end if;
  if scope = 'group' and (grp is null or not is_member(grp)) then raise exception 'not a member of this group'; end if;
  if scope = 'city' and coalesce(btrim(me.city), '') = '' then raise exception 'add your city to your profile'; end if;
  if scope = 'state' and coalesce(btrim(me.state), '') = '' then raise exception 'add your state to your profile'; end if;
  if same_class then
    select nullif(profile ->> 'weightKg', '')::real, nullif(profile ->> 'heightCm', '')::real into w, h from athlete_data where user_id = me.id;
    if w is null or h is null then raise exception 'add your height and weight in your profile'; end if;
  end if;
  return query
  select p.id from profiles p
  where (p.id = me.id
     or (scope = 'group' and exists (select 1 from group_members m where m.group_id = grp and m.user_id = p.id))
     or (scope <> 'group' and p.public_boards and (not is_minor(p.birth_year) or p.parent_consent_at is not null)
         and case scope
               when 'city' then lower(btrim(p.city)) = lower(btrim(me.city)) and lower(btrim(p.state)) = lower(btrim(me.state))
               when 'state' then lower(btrim(p.state)) = lower(btrim(me.state)) and p.country = me.country
               when 'country' then p.country = me.country
               else true end))
    and (not same_class or p.id = me.id or exists (
      select 1 from athlete_data d where d.user_id = p.id
        and floor(nullif(d.profile ->> 'weightKg', '')::real / 10) = floor(w / 10)
        and floor(nullif(d.profile ->> 'heightCm', '')::real / 10) = floor(h / 10)));
end $$;
revoke execute on function public.board_people from public, anon, authenticated; -- internal

-- Same board as 002, plus the size-class filter. Old clients that pass five arguments keep working.
drop function if exists public.leaderboard(text, text, uuid, text, int);
create or replace function public.leaderboard(exercise text, scope text, grp uuid default null, sort text default 'value', lim int default 50, same_class boolean default false)
returns table (rank bigint, display_name text, value real, form_score smallint, metric text, is_me boolean, at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if sort not in ('value', 'form') then raise exception 'bad sort'; end if;
  lim := least(greatest(coalesce(lim, 50), 1), 200);
  return query
  with best as (
    select distinct on (r.user_id) r.user_id, r.value, r.form_score, r.metric, r.created_at
    from results r where r.exercise_id = exercise and r.user_id in (select board_people(scope, grp, same_class))
    order by r.user_id,
      case when sort = 'form' then r.form_score::real else r.value end desc,
      case when sort = 'form' then r.value else r.form_score::real end desc, r.created_at
  ), ranked as (
    select b.*, rank() over (order by
      case when sort = 'form' then b.form_score::real else b.value end desc,
      case when sort = 'form' then b.value else b.form_score::real end desc) as rk
    from best b
  )
  select k.rk, case when p.id = auth.uid() or not is_minor(p.birth_year) then p.display_name else initials(p.display_name) end,
         k.value, k.form_score, k.metric, p.id = auth.uid(), k.created_at
  from ranked k join profiles p on p.id = k.user_id
  where k.rk <= lim or p.id = auth.uid()
  order by k.rk, k.created_at;
end $$;

-- Boards across all exercises over the last 30 days, from synced session reports:
--   consistency = days trained, stamina = minutes of measured movement, form = mean form score (3+ sessions).
create or replace function public.activity_board(kind text, scope text, grp uuid default null, same_class boolean default false, lim int default 50)
returns table (rank bigint, display_name text, value real, sessions bigint, is_me boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if kind not in ('consistency', 'stamina', 'form') then raise exception 'bad board'; end if;
  lim := least(greatest(coalesce(lim, 50), 1), 200);
  return query
  with agg as (
    select s.user_id, count(*) n,
      case kind
        when 'consistency' then count(distinct (s.started_at at time zone 'Asia/Kolkata')::date)::real
        when 'stamina' then round((sum(least(coalesce(nullif(s.data -> 'report' ->> 'durationSec', '')::real, 0), 3600)) / 60)::numeric, 1)::real
        else round(avg(s.form_score))::real end v
    from sessions s
    where s.started_at > now() - interval '30 days' and s.verdict <> 'suspect' and s.user_id in (select board_people(scope, grp, same_class))
    group by s.user_id
  ), ranked as (
    select a.*, rank() over (order by a.v desc, a.n desc) rk from agg a where kind <> 'form' or a.n >= 3 or a.user_id = auth.uid()
  )
  select k.rk, case when p.id = auth.uid() or not is_minor(p.birth_year) then p.display_name else initials(p.display_name) end,
         k.v, k.n, p.id = auth.uid()
  from ranked k join profiles p on p.id = k.user_id
  where k.rk <= lim or p.id = auth.uid()
  order by k.rk;
end $$;

-- Coach talent board: the public board for one exercise with the athlete id, so a coach can send a request.
create or replace function public.coach_board(exercise text, sort text default 'value', lim int default 50)
returns table (rank bigint, athlete uuid, display_name text, value real, form_score smallint, metric text, city text, state text, at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if my_role() not in ('coach', 'admin') then raise exception 'coaches only'; end if;
  if sort not in ('value', 'form') then raise exception 'bad sort'; end if;
  return query
  with best as (
    select distinct on (r.user_id) r.user_id, r.value, r.form_score, r.metric, r.created_at
    from results r join profiles p on p.id = r.user_id
    where r.exercise_id = exercise and p.public_boards and (not is_minor(p.birth_year) or p.parent_consent_at is not null)
    order by r.user_id, case when sort = 'form' then r.form_score::real else r.value end desc, r.created_at
  )
  select rank() over (order by case when sort = 'form' then b.form_score::real else b.value end desc),
         p.id, case when is_minor(p.birth_year) then initials(p.display_name) else p.display_name end,
         b.value, b.form_score, b.metric, p.city, p.state, b.created_at
  from best b join profiles p on p.id = b.user_id
  order by 1, b.created_at limit least(greatest(coalesce(lim, 50), 1), 200);
end $$;

-- Coach overview: the current leader of every exercise that has a public result.
create or replace function public.coach_leaders()
returns table (exercise_id text, athlete uuid, display_name text, value real, form_score smallint, metric text, athletes bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if my_role() not in ('coach', 'admin') then raise exception 'coaches only'; end if;
  return query
  with pub as (
    select r.* from results r join profiles p on p.id = r.user_id
    where p.public_boards and (not is_minor(p.birth_year) or p.parent_consent_at is not null)
  ), top as (
    select distinct on (r.exercise_id) r.exercise_id, r.user_id, r.value, r.form_score, r.metric
    from pub r order by r.exercise_id, r.value desc, r.form_score desc, r.created_at
  )
  select t.exercise_id, p.id, case when is_minor(p.birth_year) then initials(p.display_name) else p.display_name end,
         t.value, t.form_score, t.metric, (select count(distinct x.user_id) from pub x where x.exercise_id = t.exercise_id)
  from top t join profiles p on p.id = t.user_id order by 7 desc, 1;
end $$;

-- ---------------------------------------------------------------------------
-- Friend groups: ask to join with the code; the owner accepts or declines.
-- ---------------------------------------------------------------------------
create table public.group_requests (
  group_id uuid not null references public.groups on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
alter table public.group_requests enable row level security;
create policy "group requests: own or owner" on public.group_requests for select
  using (user_id = auth.uid() or exists (select 1 from public.groups g where g.id = group_id and g.owner = auth.uid()));
create policy "group requests: withdraw or owner declines" on public.group_requests for delete
  using (user_id = auth.uid() or exists (select 1 from public.groups g where g.id = group_id and g.owner = auth.uid()));
revoke all on public.group_requests from anon, authenticated;
grant select, delete on public.group_requests to authenticated;

create or replace function public.request_join(code text) returns text
language plpgsql security definer set search_path = public as $$
declare g groups;
begin
  if not exists (select 1 from profiles where id = auth.uid()) then raise exception 'create your profile first'; end if;
  select * into g from groups where invite_code = upper(btrim(code));
  if g.id is null then raise exception 'invalid invite code'; end if;
  if exists (select 1 from group_members where group_id = g.id and user_id = auth.uid()) then return 'You are already in ' || g.name; end if;
  insert into group_requests (group_id, user_id) values (g.id, auth.uid()) on conflict do nothing;
  return 'Request sent to the owner of ' || g.name;
end $$;

create or replace function public.group_pending(g uuid)
returns table (user_id uuid, display_name text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, case when is_minor(p.birth_year) then initials(p.display_name) else p.display_name end, r.created_at
  from group_requests r join profiles p on p.id = r.user_id join groups gr on gr.id = r.group_id
  where r.group_id = g and gr.owner = auth.uid() order by r.created_at
$$;

create or replace function public.review_join(g uuid, u uuid, approve boolean) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from groups where id = g and owner = auth.uid()) then raise exception 'only the group owner can do this'; end if;
  delete from group_requests where group_id = g and user_id = u;
  if not found then return false; end if;
  if approve then
    if (select count(*) from group_members where group_id = g) >= 50 then raise exception 'group is full (50 members)'; end if;
    insert into group_members (group_id, user_id) values (g, u) on conflict do nothing;
  end if;
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- AI review quota: 20 a day per account, so one user cannot spend the shared key.
-- ---------------------------------------------------------------------------
create table public.ai_usage (user_id uuid not null default auth.uid() references auth.users on delete cascade, day date not null default current_date, n int not null default 0, primary key (user_id, day));
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;

-- True when the caller may run one more AI review today. Under-18s are refused: parent consent does not cover AI processing.
create or replace function public.ai_take() returns boolean
language plpgsql security definer set search_path = public as $$
declare used int;
begin
  if not exists (select 1 from profiles where id = auth.uid() and not is_minor(birth_year)) then return false; end if;
  insert into ai_usage (user_id) values (auth.uid()) on conflict (user_id, day) do update set n = ai_usage.n + 1 returning n into used;
  return used < 20;
end $$;

revoke execute on function public.start_coach_trial, public.coach_directory, public.ask_coach, public.invite_athlete, public.answer_connection,
  public.my_connections, public.connection_sessions, public.leaderboard, public.activity_board, public.coach_board, public.coach_leaders,
  public.request_join, public.group_pending, public.review_join, public.ai_take from public, anon;
grant execute on function public.start_coach_trial, public.coach_directory, public.ask_coach, public.invite_athlete, public.answer_connection,
  public.my_connections, public.connection_sessions, public.leaderboard, public.activity_board, public.coach_board, public.coach_leaders,
  public.request_join, public.group_pending, public.review_join, public.ai_take to authenticated;
