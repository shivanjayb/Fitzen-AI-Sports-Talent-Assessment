-- 006: the project owner becomes admin as soon as their profile exists. One-time bootstrap: once any admin exists it
-- does nothing, and only the owner's confirmed email qualifies. Later admins are made in /admin (set_role).
create or replace function public.bootstrap_owner_admin() returns trigger
language plpgsql security definer set search_path = public, auth as $$
begin
  if not exists (select 1 from profiles where role = 'admin') and exists (
    select 1 from auth.users u where u.id = new.id and lower(u.email) = 'shivanjayprakashbajpai@gmail.com' and u.email_confirmed_at is not null
  ) then
    new.role := 'admin';
  end if;
  return new;
end $$;
create trigger profiles_bootstrap_owner_admin before insert on public.profiles
  for each row execute function public.bootstrap_owner_admin();
revoke execute on function public.bootstrap_owner_admin() from public, anon, authenticated;

-- If the owner's profile already exists, promote it now (same conditions).
update public.profiles p set role = 'admin'
where not exists (select 1 from public.profiles where role = 'admin')
  and exists (select 1 from auth.users u where u.id = p.id and lower(u.email) = 'shivanjayprakashbajpai@gmail.com' and u.email_confirmed_at is not null);
