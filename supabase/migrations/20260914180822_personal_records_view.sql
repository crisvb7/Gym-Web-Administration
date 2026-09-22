-- Marcas personales (PRs): máximo peso (kg) levantado por usuario y ejercicio,
-- calculado a partir de workout_logs. Pensada para que el chatbot de IA (ai-assistant)
-- pueda consultar el máximo actual de cada persona en cada ejercicio al preparar cargas.
--
-- security_invoker = true hace que la vista respete las políticas RLS de workout_logs
-- según el rol que consulta (en vez de ejecutarse con los permisos del dueño de la vista).
create or replace view public.personal_records
with (security_invoker = true)
as
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
group by user_id, exercise_id;

grant select on public.personal_records to authenticated;
