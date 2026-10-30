-- 007 private wellness persistence: standalone fixtures, no real users or external services.
create function pg_temp.well_check(ok boolean, what text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'FAILED: %', what; end if; end $$;
create function pg_temp.well_throws(q text, msg text) returns void language plpgsql as $$
declare hit boolean := false;
begin
  begin execute q; exception when others then
    if sqlerrm not like '%' || msg || '%' then raise exception 'wrong error for [%]: %', q, sqlerrm; end if;
    hit := true;
  end;
  if not hit then raise exception 'expected [%] to fail with "%"', q, msg; end if;
end $$;
create function pg_temp.well_login(u uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u)::text end, false);
  if u is null then set role anon; else set role authenticated; end if;
end $$;
insert into auth.users(id, email) values
 ('00000000-0000-0000-0000-000000000071','wellness-a@example.invalid'),
 ('00000000-0000-0000-0000-000000000072','wellness-b@example.invalid');
select pg_temp.well_check(public.valid_wellness_values('vitals','{"rhr":55,"hrv":75}'), 'valid vitals');
select pg_temp.well_check(not public.valid_wellness_values('vitals','{"rhr":0}'), 'resting heart rate bounds');
select pg_temp.well_check(not public.valid_wellness_values('body','{"weight":"72"}'), 'numeric values required');
select pg_temp.well_check(not public.valid_wellness_values('sleep','{}'), 'sleep value required');
select pg_temp.well_check(not public.valid_wellness_values('journal','{"mood":2.5}'), 'mood integer required');
select pg_temp.well_check(not public.valid_wellness_values('body','{"height":180}'), 'unknown keys rejected');
select pg_temp.well_check(not public.valid_wellness_values('blood-records','{"value":4,"low":8,"high":3}'), 'ordered lab reference range');
select pg_temp.well_login('00000000-0000-0000-0000-000000000071');
insert into wellness_records(id,kind,recorded_on,title,"values",updated_at) values
 ('00000000-0000-0000-0000-000000000073','body','2026-01-01','Morning','{"weight":72}','2026-01-01T00:00:00Z');
select pg_temp.well_check((select count(*) from wellness_records) = 1, 'owner reads own record');
update wellness_records set "values" = '{"weight":73}', updated_at = '2026-01-03T00:00:00Z' where id = '00000000-0000-0000-0000-000000000073';
update wellness_records set "values" = '{"weight":71}', updated_at = '2026-01-02T00:00:00Z' where id = '00000000-0000-0000-0000-000000000073';
select pg_temp.well_check((select ("values"->>'weight')::int from wellness_records) = 73, 'stale offline update cannot replace newer record');
select pg_temp.well_throws($q$insert into wellness_records(id,kind,recorded_on,title,"values") values(gen_random_uuid(),'body','2026-01-01','Invalid','{"weight":0}')$q$,'check constraint');
select pg_temp.well_throws($q$insert into wellness_records(id,kind,recorded_on,title,"values") values(gen_random_uuid(),'sleep',current_date + 3,'Future','{"hours":8}')$q$,'check constraint');
select pg_temp.well_throws($q$insert into wellness_records(id,kind,recorded_on,title,"values",unit) values(gen_random_uuid(),'blood-records','2026-01-01','Lab','{"value":5}','')$q$,'check constraint');
select pg_temp.well_login('00000000-0000-0000-0000-000000000072');
select pg_temp.well_check((select count(*) from wellness_records) = 0, 'second account cannot read another owner');
select pg_temp.well_throws($q$insert into wellness_records(id,user_id,kind,recorded_on,title,"values") values(gen_random_uuid(),'00000000-0000-0000-0000-000000000071','sleep','2026-01-01','Spoof','{"hours":8}')$q$,'row-level security');
update wellness_records set title = 'Stolen' where id = '00000000-0000-0000-0000-000000000073';
delete from wellness_records where id = '00000000-0000-0000-0000-000000000073';
select pg_temp.well_login('00000000-0000-0000-0000-000000000071');
select pg_temp.well_check((select title from wellness_records) = 'Morning', 'second account cannot edit or remove another owner');
update wellness_records set deleted_at = now(), updated_at = now() where id = '00000000-0000-0000-0000-000000000073';
select pg_temp.well_check((select deleted_at is not null from wellness_records), 'deletion tombstone is synced');
select pg_temp.well_login(null);
select pg_temp.well_throws($q$select * from wellness_records$q$, 'permission denied');
reset role;
delete from auth.users where id in ('00000000-0000-0000-0000-000000000071','00000000-0000-0000-0000-000000000072');
select pg_temp.well_check((select count(*) from wellness_records) = 0, 'account removal cascades to wellness records');
