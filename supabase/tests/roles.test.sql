-- 009: a minor can never become a coach through review_coach(), and the owner bootstrap needs an adult profile. Run via run.sh.
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

reset role; delete from public.profiles; delete from auth.users;
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000009a1', 'ShivanjayPrakashBajpai@gmail.com', now()),
  ('00000000-0000-0000-0000-0000000009a2', 'admin2@t.in', now()),
  ('00000000-0000-0000-0000-0000000009c1', 'applicant@t.in', now());

-- Owner with a minor birth year is not bootstrapped; once the profile says adult, the next insert path is the update below.
select pg_temp.login('00000000-0000-0000-0000-0000000009a1');
insert into profiles (display_name, birth_year) values ('Owner', extract(year from now())::int - 15);
reset role; select pg_temp.check((select role from profiles where id = '00000000-0000-0000-0000-0000000009a1') = 'athlete', 'minor owner is not bootstrapped');
delete from profiles where id = '00000000-0000-0000-0000-0000000009a1';
select pg_temp.login('00000000-0000-0000-0000-0000000009a1');
insert into profiles (display_name, birth_year) values ('Owner', 1990);
reset role; select pg_temp.check((select role from profiles where id = '00000000-0000-0000-0000-0000000009a1') = 'admin', 'adult owner is bootstrapped');

-- Adult applies, then raises the birth year to a minor's before an admin reviews.
select pg_temp.login('00000000-0000-0000-0000-0000000009c1');
insert into profiles (display_name, birth_year) values ('Applicant', 1995);
select pg_temp.check(request_coach('Club') = 'pending', 'adult can apply');
update profiles set birth_year = extract(year from now())::int - 15 where id = auth.uid();
select pg_temp.login('00000000-0000-0000-0000-0000000009a1');
select pg_temp.throws($q$select review_coach('00000000-0000-0000-0000-0000000009c1', true)$q$, 'coaches must be adults');
reset role; select pg_temp.check((select role from profiles where id = '00000000-0000-0000-0000-0000000009c1') = 'athlete', 'minor applicant stays athlete');
select pg_temp.login('00000000-0000-0000-0000-0000000009a1');
select pg_temp.check(review_coach('00000000-0000-0000-0000-0000000009c1', false), 'admin can still reject');
reset role;
