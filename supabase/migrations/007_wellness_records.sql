-- Private manual records. Stage-test before applying; this migration never connects a wearable or AI service.
create function public.valid_wellness_values(record_kind text, vals jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare k text; v jsonb; n numeric; lo numeric; hi numeric;
begin
  if jsonb_typeof(vals) <> 'object' or vals = '{}'::jsonb then return false; end if;
  for k, v in select * from jsonb_each(vals) loop
    if jsonb_typeof(v) <> 'number' then return false; end if;
    n := v::text::numeric;
    select bounds[1], bounds[2] into lo, hi from (select case record_kind || ':' || k
      when 'vitals:rhr' then array[25,240] when 'vitals:hrv' then array[1,400]
      when 'sleep:hours' then array[0,24] when 'body:weight' then array[15,350] when 'body:bodyfat' then array[1,75]
      when 'nutrition:calories' then array[0,10000] when 'nutrition:protein' then array[0,1000]
      when 'nutrition:carbs' then array[0,2000] when 'nutrition:fat' then array[0,1000]
      when 'journal:mood' then array[1,5] when 'blood-records:value' then array[0,1000000]
      when 'blood-records:low' then array[0,1000000] when 'blood-records:high' then array[0,1000000]
      end bounds) q;
    if lo is null or n < lo or n > hi then return false; end if;
  end loop;
  return case record_kind
    when 'sleep' then vals ? 'hours'
    when 'nutrition' then vals ? 'calories'
    when 'journal' then vals ? 'mood' and (vals->>'mood')::numeric = trunc((vals->>'mood')::numeric)
    when 'blood-records' then vals ? 'value' and (not(vals ? 'low' and vals ? 'high') or (vals->>'low')::numeric <= (vals->>'high')::numeric)
    else true end;
end $$;
create table public.wellness_records (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('vitals', 'sleep', 'body', 'nutrition', 'journal', 'blood-records')),
  recorded_on date not null check (recorded_on <= (now() at time zone 'Pacific/Kiritimati')::date),
  title text not null check (char_length(btrim(title)) between 1 and 100),
  note text not null default '' check (char_length(note) <= 1000),
  unit text not null default '' check (char_length(unit) <= 30 and (kind <> 'blood-records' or char_length(btrim(unit)) > 0)),
  "values" jsonb not null check (pg_column_size("values") <= 2048 and public.valid_wellness_values(kind, "values")),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index wellness_records_owner_date on public.wellness_records(user_id, recorded_on desc);
alter table public.wellness_records enable row level security;
create policy "wellness: owner only" on public.wellness_records for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.wellness_records from public, anon;
grant select, insert, update, delete on public.wellness_records to authenticated;
-- A delayed offline write must not replace a newer edit already saved on another device.
create function public.keep_newer_wellness_record() returns trigger language plpgsql set search_path = public as $$
begin
  if new.updated_at < old.updated_at then return old; end if;
  return new;
end $$;
create trigger wellness_newer_only before update on public.wellness_records for each row execute function public.keep_newer_wellness_record();
revoke all on function public.keep_newer_wellness_record() from public;
