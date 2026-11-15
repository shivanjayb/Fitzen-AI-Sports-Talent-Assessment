-- Behaviour tests for 010 (temporary coach, connections and chat, boards, group requests, AI quota). Run via run.sh.
-- t = temporary coach, s = adult athlete, p = second adult (public boards), m = minor without consent, x = outsider.
\set t '''10000000-0000-0000-0000-00000000000a'''
\set s '''10000000-0000-0000-0000-00000000000b'''
\set p '''10000000-0000-0000-0000-00000000000c'''
\set m '''10000000-0000-0000-0000-00000000000d'''
\set x '''10000000-0000-0000-0000-00000000000e'''

create function pg_temp.login(u uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u)::text end, false);
  if u is null then set role anon; else set role authenticated; end if;
end $$;
create function pg_temp.throws(q text, msg text) returns void language plpgsql as $$
declare hit boolean := false;
begin
  begin execute q; exception when others then
    if sqlerrm not like '%' || msg || '%' then raise exception 'wrong error for [%]: %', q, sqlerrm; end if;
    hit := true;
  end;
  if not hit then raise exception 'expected [%] to fail with "%"', q, msg; end if;
end $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'FAILED: %', what; end if; end $$;

insert into auth.users (id, email, email_confirmed_at) values (:t, 't@s.in', now()), (:s, 's@s.in', now()), (:p, 'p@s.in', now()), (:m, 'm@s.in', now()), (:x, 'x@s.in', now());
select pg_temp.login(:t); insert into profiles (display_name, birth_year, city, state) values ('Tara Temp', 1988, 'Nashik', 'Maharashtra');
select pg_temp.login(:s); insert into profiles (display_name, birth_year, city, state) values ('Sameer Shah', 1999, 'Nashik', 'Maharashtra');
select pg_temp.login(:p); insert into profiles (display_name, birth_year, city, state, public_boards) values ('Priya Patil', 1998, 'Pune', 'Maharashtra', true);
select pg_temp.login(:m); insert into profiles (display_name, birth_year, parent_email, public_boards) values ('Mohan Kale', extract(year from now())::int - 14, 'parent@s.in', true);
select pg_temp.login(:x); insert into profiles (display_name, birth_year) values ('Xena', 1990);

-- Temporary coach: once, adults only, and it turns on the coach-only functions.
select pg_temp.login(:m); select pg_temp.throws('select start_coach_trial()', 'coaches must be adults');
select pg_temp.login(:t);
select pg_temp.throws('select * from coach_leaders()', 'coaches only');
select pg_temp.check(my_role() = 'athlete', 'athlete before trial');
select pg_temp.check(start_coach_trial() > now() + interval '13 days', 'trial lasts 14 days');
select pg_temp.check(my_role() = 'coach', 'trial grants coach');
select pg_temp.throws('select start_coach_trial()', 'already used');
select pg_temp.throws($$update profiles set coach_trial_until = now() + interval '9 years'$$, 'permission denied');
insert into groups (name, kind) values ('Temp Squad', 'squad'); -- squads are allowed on temporary access

-- Directory lists the temporary coach, marked temporary, never to signed-out callers.
select pg_temp.login(:s);
select pg_temp.check((select temporary from coach_directory() where id = :t), 'directory marks temporary coach');
select pg_temp.check(not exists (select 1 from coach_directory() where id in (:s, :p, :x)), 'directory lists coaches only');
select pg_temp.login(null); select pg_temp.throws('select * from coach_directory()', 'permission denied');

-- Athlete asks a coach: pending until the coach accepts; no chat or reports before that.
select pg_temp.login(:s);
select pg_temp.throws(format('select ask_coach(%L)', :x), 'coach not found');
create temp table c1 as select ask_coach(:t, 'Please check my squat', 'bodyweight-squat') id; grant select on c1 to authenticated;
select pg_temp.check(ask_coach(:t, 'again', null) = (select id from c1), 'asking twice keeps one request');
select pg_temp.check((select count(*) from messages) = 1, 'one opening note only');
select pg_temp.check(not answer_connection((select id from c1), true), 'requester cannot accept their own request');
select pg_temp.throws(format('insert into messages (connection_id, body) values (%L, %L)', (select id from c1), 'hi'), 'row-level security');
insert into sessions (id, exercise_id, source, started_at, verdict, form_score, data) values
  ('20000000-0000-0000-0000-000000000001', 'bodyweight-squat', 'camera', now() - interval '1 day', 'genuine', 80, '{"report":{"durationSec":120}}'),
  ('20000000-0000-0000-0000-000000000002', 'plank', 'camera', now() - interval '2 days', 'genuine', 90, '{"report":{"durationSec":60}}'),
  ('20000000-0000-0000-0000-000000000003', 'plank', 'camera', now() - interval '2 days', 'genuine', 70, '{"report":{"durationSec":60}}');
insert into results (exercise_id, metric, value, form_score, source) values ('bodyweight-squat', 'reps', 12, 80, 'camera');
select pg_temp.login(:t);
select pg_temp.check((select count(*) from my_connections() where status = 'pending' and not started_by_me and i_am = 'coach' and other_name = 'Sameer Shah') = 1, 'coach sees the request');
select pg_temp.check((select count(*) from connection_sessions((select id from c1))) = 0, 'no reports before accepting');
select pg_temp.check(answer_connection((select id from c1), true), 'coach accepts');
select pg_temp.check((select count(*) from connection_sessions((select id from c1))) = 3, 'coach reads reports after accepting');
insert into messages (connection_id, body) values ((select id from c1), 'Send me a side-on video');
select pg_temp.throws(format('insert into messages (connection_id, sender, body) values (%L, %L, %L)', (select id from c1), :s, 'forged'), 'permission denied');
select pg_temp.login(:s);
insert into messages (connection_id, body) values ((select id from c1), 'Will do');
select pg_temp.check((select last_body from my_connections()) = 'Will do', 'inbox shows the latest message');
select pg_temp.login(:x);
select pg_temp.check((select count(*) from messages) = 0 and (select count(*) from connections) = 0 and (select count(*) from my_connections()) = 0, 'outsiders see nothing');
select pg_temp.check((select count(*) from connection_sessions((select id from c1))) = 0, 'outsiders cannot read reports');
select pg_temp.throws(format('select invite_athlete(%L)', :p), 'coaches only');

-- Coach invites: only athletes on public boards, and never a minor without parent consent.
select pg_temp.login(:p); insert into results (exercise_id, metric, value, form_score, source) values ('bodyweight-squat', 'reps', 20, 92, 'camera');
select pg_temp.login(:m); insert into results (exercise_id, metric, value, form_score, source) values ('bodyweight-squat', 'reps', 30, 95, 'camera');
select pg_temp.throws(format('select ask_coach(%L)', :t), 'parent must confirm');
select pg_temp.login(:t);
select pg_temp.check((select array_agg(display_name order by rank) from coach_board('bodyweight-squat')) = array['Priya Patil'], 'talent board: public adults only');
select pg_temp.check((select display_name from coach_leaders() where exercise_id = 'bodyweight-squat') = 'Priya Patil', 'leader of each exercise');
select pg_temp.throws(format('select invite_athlete(%L)', :s), 'not open to contact');
select pg_temp.throws(format('select invite_athlete(%L)', :m), 'not open to contact');
create temp table c2 as select invite_athlete(:p, 'Great squat', 'bodyweight-squat') id; grant select on c2 to authenticated;
select pg_temp.login(:p);
select pg_temp.check(answer_connection((select id from c2), false), 'athlete declines');
select pg_temp.login(:t);
select pg_temp.check((select status from connections where id = (select id from c2)) = 'declined', 'declined is recorded');
select pg_temp.login(:p); delete from connections where id = (select id from c2);
select pg_temp.check((select count(*) from connections) = 0, 'either side can end a connection');

-- Boards: exercise board keeps its old five-argument call; activity boards rank the last 30 days.
select pg_temp.login(:s);
select pg_temp.check((select count(*) from leaderboard('bodyweight-squat', 'world', null, 'value', 50)) = 2, 'world board: public adult + me, minor hidden');
select pg_temp.check((select value from activity_board('consistency', 'world') where is_me) = 2, 'consistency = days trained');
select pg_temp.check((select value from activity_board('stamina', 'world') where is_me) = 4, 'stamina = minutes');
select pg_temp.check((select value from activity_board('form', 'world') where is_me) = 80, 'technique = mean form score');
select pg_temp.throws($$select * from activity_board('stamina', 'world', null, true)$$, 'height and weight');
insert into athlete_data (profile) values ('{"weightKg": 64, "heightCm": 171}');
select pg_temp.login(:p); insert into athlete_data (profile) values ('{"weightKg": 81, "heightCm": 176}');
select pg_temp.login(:s);
select pg_temp.check((select count(*) from leaderboard('bodyweight-squat', 'world', null, 'value', 50, true)) = 1, 'size class filters other bands out');
select pg_temp.login(:p); update athlete_data set profile = '{"weightKg": 69, "heightCm": 178}';
select pg_temp.login(:s);
select pg_temp.check((select count(*) from leaderboard('bodyweight-squat', 'world', null, 'value', 50, true)) = 2, 'same 10 kg and 10 cm bands rank together');

-- Friend groups: the code asks, the owner accepts.
insert into groups (name) values ('Gym friends');
create temp table g1 as select id, invite_code from groups where name = 'Gym friends'; grant select on g1 to authenticated;
select pg_temp.login(:x);
select pg_temp.throws($$select request_join('NOPE')$$, 'invalid invite code');
select pg_temp.check(request_join((select invite_code from g1)) like 'Request sent%', 'request is recorded');
select pg_temp.check(not is_member((select id from g1)), 'asking does not join');
select pg_temp.throws(format('select review_join(%L, %L, true)', (select id from g1), :x), 'only the group owner');
select pg_temp.login(:p); select pg_temp.check((select count(*) from group_pending((select id from g1))) = 0, 'only the owner sees requests');
select pg_temp.login(:s);
select pg_temp.check((select display_name from group_pending((select id from g1))) = 'Xena', 'owner sees who asked');
select pg_temp.check(review_join((select id from g1), :x, true), 'owner accepts');
select pg_temp.login(:x);
select pg_temp.check(is_member((select id from g1)) and request_join((select invite_code from g1)) like 'You are already%', 'accepted member is in');

-- AI quota: adults only, 20 a day.
select pg_temp.check(ai_take(), 'adult may use the AI review');
select pg_temp.login(:m); select pg_temp.check(not ai_take(), 'minors are refused');
reset role; update ai_usage set n = 20;
select pg_temp.login(:x); select pg_temp.check(not ai_take(), 'daily limit holds');
reset role;
