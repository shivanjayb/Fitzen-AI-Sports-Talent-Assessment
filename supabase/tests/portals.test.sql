-- Behaviour tests for 004 (roles, coach approval, squads, synced sessions, API keys, admin). Run via run.sh.
-- a = admin, c = coach applicant, s = adult athlete, m = minor athlete, x = outsider.
\set a '''00000000-0000-0000-0000-00000000000a'''
\set c '''00000000-0000-0000-0000-00000000000c'''
\set s '''00000000-0000-0000-0000-000000000005'''
\set m '''00000000-0000-0000-0000-00000000000d'''
\set x '''00000000-0000-0000-0000-00000000000e'''

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

insert into auth.users (id, email, email_confirmed_at) values
  (:a, 'a@t.in', now()), (:c, 'c@t.in', now()), (:s, 's@t.in', now()), (:m, 'm@t.in', now()), (:x, 'x@t.in', now());

select pg_temp.login(:a); insert into profiles (display_name, birth_year) values ('Asha Admin', 1985);
select pg_temp.login(:c); insert into profiles (display_name, birth_year) values ('Chetan Coach', 1980);
select pg_temp.login(:s); insert into profiles (display_name, birth_year) values ('Sunil Singh', 1999);
select pg_temp.login(:m); insert into profiles (display_name, birth_year, parent_email) values ('Meera Kumari', extract(year from now())::int - 14, 'parent@t.in');
select pg_temp.login(:x); insert into profiles (display_name, birth_year) values ('Xavier', 1990);
reset role; update profiles set role = 'admin' where id = :a; -- owner bootstrap

-- Roles can't be self-assigned.
select pg_temp.login(:s);
select pg_temp.throws($q$update profiles set role = 'admin' where id = auth.uid()$q$, 'permission denied');
select pg_temp.check(my_role() = 'athlete', 'new users are athletes');

-- Coach approval.
select pg_temp.login(:m);
select pg_temp.throws($q$select request_coach('School')$q$, 'coaches must be adults');
select pg_temp.login(:c);
select pg_temp.check(request_coach('Delhi Athletics Club', 'NIS certified') = 'pending', 'request is pending');
select pg_temp.check((select count(*) from coach_requests) = 1, 'applicant sees own request');
select pg_temp.login(:s);
select pg_temp.check((select count(*) from coach_requests) = 0, 'others cannot read requests');
select pg_temp.throws($q$select review_coach('00000000-0000-0000-0000-00000000000c', true)$q$, 'admins only');
select pg_temp.throws($q$insert into groups (name, kind) values ('Fake squad', 'squad')$q$, 'row-level security');
select pg_temp.login(:a);
select pg_temp.check((select count(*) from coach_requests where status = 'pending') = 1, 'admin sees pending requests');
select pg_temp.check(review_coach(:c, true), 'admin approves');
select pg_temp.throws($q$select set_role(auth.uid(), 'athlete')$q$, 'another admin');
select pg_temp.throws($q$select set_role('00000000-0000-0000-0000-00000000000d', 'coach')$q$, 'must be adults');
select pg_temp.login(:c);
select pg_temp.check(my_role() = 'coach', 'approved applicant is a coach');

-- Squad: coach creates, athletes join with the invite code.
insert into groups (name, kind) values ('U18 Sprint Squad', 'squad');
reset role; select set_config('t.g', (select id::text from groups where kind = 'squad'), false), set_config('t.code', (select invite_code from groups where kind = 'squad'), false);
select pg_temp.login(:s); select join_group(current_setting('t.code'));
select pg_temp.login(:m); select join_group(current_setting('t.code'));

-- Synced sessions are private to their owner.
select pg_temp.login(:s);
insert into sessions (id, exercise_id, source, started_at, verdict, form_score, data)
values (gen_random_uuid(), 'push-up', 'camera', now(), 'genuine', 82, '{"report": {"grade": "B", "reps": {"valid": 20}}}'),
       (gen_random_uuid(), 'push-up', 'video', now() - interval '1 day', 'suspect', 40, '{"report": {"grade": "D"}}');
insert into athlete_data (profile) values ('{"name": "Sunil", "level": "beginner"}');
select pg_temp.login(:m);
insert into sessions (id, exercise_id, source, started_at, verdict, form_score, data) values (gen_random_uuid(), 'plank', 'camera', now(), 'genuine', 90, '{}');
select pg_temp.login(:x);
select pg_temp.check((select count(*) from sessions) = 0 and (select count(*) from athlete_data) = 0, 'outsider sees nothing');
select pg_temp.throws($q$insert into sessions (id, user_id, exercise_id, source, started_at, verdict, form_score, data) values (gen_random_uuid(), '00000000-0000-0000-0000-000000000005', 'push-up', 'camera', now(), 'genuine', 99, '{}')$q$, 'row-level security');
select pg_temp.check((select count(*) from squad_athletes(current_setting('t.g')::uuid)) = 0, 'outsider gets no roster');
select pg_temp.check((select count(*) from athlete_sessions(current_setting('t.g')::uuid, :s)) = 0, 'outsider gets no sessions');

-- Coach view: adults visible, minors only after parent consent and as initials.
select pg_temp.login(:c);
select pg_temp.check((select count(*) from squad_athletes(current_setting('t.g')::uuid)) = 2, 'coach sees both members');
select pg_temp.check((select visible and suspect = 1 and genuine = 1 from squad_athletes(current_setting('t.g')::uuid) where athlete = :s), 'adult visible with verdicts');
select pg_temp.check((select not visible and display_name = 'M.K.' and sessions_30d = 0 from squad_athletes(current_setting('t.g')::uuid) where athlete = :m), 'minor hidden without consent');
select pg_temp.check((select count(*) from athlete_sessions(current_setting('t.g')::uuid, :s)) = 2, 'coach reads adult reports');
select pg_temp.check((select count(*) from athlete_sessions(current_setting('t.g')::uuid, :m)) = 0, 'coach cannot read minor without consent');
reset role; update profiles set parent_consent_at = now() where id = :m;
select pg_temp.login(:c);
select pg_temp.check((select count(*) from athlete_sessions(current_setting('t.g')::uuid, :m)) = 1, 'minor visible after parent consent');

-- API keys: coaches only, hashed, revocable, readable by anon with the key.
select pg_temp.login(:s);
select pg_temp.throws($q$select create_api_key('mine')$q$, 'coaches only');
select pg_temp.login(:c);
reset role; select set_config('request.jwt.claims', json_build_object('sub', :c)::text, false); set role authenticated;
select set_config('t.key', create_api_key('Squad sheet'), false);
select pg_temp.check(current_setting('t.key') ~ '^fz_[0-9a-f]{48}$', 'key format');
select pg_temp.check((select prefix from api_keys) = left(current_setting('t.key'), 10), 'coach lists own key by prefix');
select pg_temp.throws($q$select key_hash from api_keys$q$, 'permission denied');
reset role; select pg_temp.check((select key_hash from api_keys) <> current_setting('t.key'), 'plaintext key is not stored');
select pg_temp.login(null);
select pg_temp.check(jsonb_array_length(api_squad_report(current_setting('t.key')) -> 'squads' -> 0 -> 'athletes') = 2, 'api returns squad athletes');
select pg_temp.check((select count(*) from jsonb_array_elements(api_squad_report(current_setting('t.key')) #> '{squads,0,athletes}') e where e ->> 'display_name' = 'M.K.') = 1, 'api masks minors');
select pg_temp.throws($q$select api_squad_report('fz_000000000000000000000000000000000000000000000000')$q$, 'invalid api key');
select pg_temp.throws($q$select squad_athletes(gen_random_uuid())$q$, 'permission denied');
select pg_temp.throws($q$select * from sessions$q$, 'permission denied');
select pg_temp.login(:c);
select pg_temp.check(revoke_api_key((select id from api_keys limit 1)), 'revoke');
select pg_temp.login(null);
select pg_temp.throws(format('select api_squad_report(%L)', current_setting('t.key')), 'invalid api key');

-- Admin portal.
select pg_temp.login(:c);
select pg_temp.throws($q$select admin_stats()$q$, 'admins only');
select pg_temp.login(:a);
select pg_temp.check((admin_stats() ->> 'sessions_7d')::int = 3 and (admin_stats() ->> 'coaches')::int = 1 and (admin_stats() -> 'verdicts_30d' ->> 'suspect')::int = 1, 'admin stats');
select pg_temp.check((select count(*) from admin_users()) = 5, 'admin lists users');
select pg_temp.check((select display_name from admin_users('Meera')) = 'M.K.', 'admin sees minors as initials');
reset role;
