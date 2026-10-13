-- Permite al staff (admin/trainer) fijar manualmente la marca personal de un socio en un
-- ejercicio (subirla o bajarla a mano), en vez de depender solo del máximo calculado a
-- partir de workout_logs. El ajuste manual tiene prioridad sobre el cálculo automático,
-- pero si se borra el ajuste, la vista vuelve a mostrar el máximo real de los logs.
-- Se puede ejecutar varias veces sin error.

create table if not exists public.personal_record_overrides (
  user_id uuid not null references public.profiles(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  weight_kg numeric not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  primary key (user_id, exercise_id)
);

alter table public.personal_record_overrides enable row level security;

drop policy if exists "El personal puede gestionar ajustes de marcas" on public.personal_record_overrides;
create policy "El personal puede gestionar ajustes de marcas"
  on public.personal_record_overrides
  for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and (profiles.role = 'admin' or profiles.role = 'trainer')
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and (profiles.role = 'admin' or profiles.role = 'trainer')
    )
  );

drop policy if exists "Los usuarios pueden ver sus propios ajustes de marcas" on public.personal_record_overrides;
create policy "Los usuarios pueden ver sus propios ajustes de marcas"
  on public.personal_record_overrides
  for select
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.personal_record_overrides to authenticated;

-- Se borra y se vuelve a crear porque "create or replace" no deja cambiar las columnas
-- de una vista que ya existe. Una vista no guarda datos, así que no se pierde nada.
drop view if exists public.personal_records;

create view public.personal_records
with (security_invoker = true)
as
select
  coalesce(o.user_id, wl.user_id) as user_id,
  coalesce(o.exercise_id, wl.exercise_id) as exercise_id,
  coalesce(o.weight_kg, wl.max_weight_kg) as max_weight_kg,
  coalesce(o.updated_at, wl.achieved_at) as achieved_at,
  coalesce(wl.logs_count, 0) as logs_count,
  (o.user_id is not null) as is_manual_override
from (
  select
    user_id,
    exercise_id,
    max(weight_kg) as max_weight_kg,
    (array_agg(logged_at order by weight_kg desc nulls last, logged_at desc))[1] as achieved_at,
    count(*) as logs_count
  from public.workout_logs
  where weight_kg is not null
    and user_id is not null
    and exercise_id is not null
  group by user_id, exercise_id
) wl
full outer join public.personal_record_overrides o
  on o.user_id = wl.user_id and o.exercise_id = wl.exercise_id;

grant select on public.personal_records to authenticated;
