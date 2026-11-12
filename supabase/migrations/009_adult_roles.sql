-- 009: coach approval and the owner bootstrap follow the adults-only rule set_role() already enforces (005).
-- Gap: an applicant could raise their birth year after request_coach(), and review_coach() then made a minor a coach.
-- Not applied yet: stage-test with supabase/tests/run.sh before production.
create or replace function public.review_coach(target uuid, approve boolean) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only'; end if;
  if approve and (select is_minor(birth_year) from profiles where id = target) then raise exception 'coaches must be adults'; end if;
  update coach_requests set status = case when approve then 'approved' else 'rejected' end, reviewed_at = now(), reviewed_by = auth.uid()
  where user_id = target and status = 'pending';
  if not found then return false; end if;
  if approve then update profiles set role = 'coach' where id = target and role = 'athlete'; end if;
  return true;
end $$;

create or replace function public.bootstrap_owner_admin() returns trigger
language plpgsql security definer set search_path = public, auth as $$
begin
  if not is_minor(new.birth_year) and not exists (select 1 from profiles where role = 'admin') and exists (
    select 1 from auth.users u where u.id = new.id and lower(u.email) = 'shivanjayprakashbajpai@gmail.com' and u.email_confirmed_at is not null
  ) then
    new.role := 'admin';
  end if;
  return new;
end $$;
revoke execute on function public.bootstrap_owner_admin() from public, anon, authenticated;
