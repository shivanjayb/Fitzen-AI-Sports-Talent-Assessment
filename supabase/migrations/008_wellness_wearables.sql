-- 008: imported wearable data (file import or Bluetooth) and the sleep schedule reuse wellness_records with more value keys.
-- Bounds match apps/web/src/app/wellnessStore.ts `limits`. Skin temperature is a deviation from baseline in °C;
-- bedtime and wake are minutes after local midnight.
create or replace function public.valid_wellness_values(record_kind text, vals jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare k text; v jsonb; n numeric; lo numeric; hi numeric;
begin
  if jsonb_typeof(vals) <> 'object' or vals = '{}'::jsonb then return false; end if;
  for k, v in select * from jsonb_each(vals) loop
    if jsonb_typeof(v) <> 'number' then return false; end if;
    n := v::text::numeric;
    select bounds[1], bounds[2] into lo, hi from (select case record_kind || ':' || k
      when 'vitals:rhr' then array[25,240] when 'vitals:hrv' then array[1,400] when 'vitals:hr' then array[25,240]
      when 'vitals:spo2' then array[50,100] when 'vitals:resp' then array[4,60] when 'vitals:skin' then array[-5,5]
      when 'vitals:steps' then array[0,200000] when 'vitals:active' then array[0,10000] when 'vitals:burned' then array[0,15000]
      when 'vitals:strain' then array[0,21] when 'vitals:recovery' then array[0,100]
      when 'sleep:hours' then array[0,24] when 'sleep:deep' then array[0,24] when 'sleep:rem' then array[0,24]
      when 'sleep:light' then array[0,24] when 'sleep:awake' then array[0,1440] when 'sleep:efficiency' then array[0,100]
      when 'sleep:bedtime' then array[0,1440] when 'sleep:wake' then array[0,1440]
      when 'body:weight' then array[15,350] when 'body:bodyfat' then array[1,75] when 'body:lean' then array[5,250]
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
