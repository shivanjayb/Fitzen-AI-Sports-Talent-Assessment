-- Apply after 003 on the fresh Fitzen accounts project.
-- Pin helper lookup paths and keep trigger-only functions out of the public API.
alter function public.is_minor(integer) set search_path = public;
alter function public.initials(text) set search_path = public;
alter function public.profiles_reset_consent() set search_path = public;
alter function public.exercise_metric(text) set search_path = public;
revoke execute on function public.groups_add_owner() from public, anon, authenticated;
revoke execute on function public.is_member(uuid) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;
-- Supabase may provision this event-trigger helper on new projects.
do $$ begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
