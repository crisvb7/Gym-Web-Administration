-- Reinicio automático de los contadores de sanciones:
--   * monthly_cancellations (a pesar del nombre, es semanal): se pone a 0 cada lunes a las 00:00 (Madrid).
--   * missed_classes: se pone a 0 el día 1 de cada mes a las 00:00 (Madrid).
-- Ni penalized_until ni is_blocked se tocan: una penalización en curso termina su plazo, y el
-- bloqueo por 6 faltas solo lo quita el staff desde "Quitar Sanciones" en la ficha del socio.
--
-- pg_cron trabaja en UTC y Madrid cambia entre UTC+1 y UTC+2, así que cada job se lanza en las dos
-- horas UTC candidatas y la función solo actúa en la que de verdad son las 00:00 en Madrid.

create extension if not exists pg_cron;

create or replace function public.reset_weekly_cancellations()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  madrid_now timestamp := now() at time zone 'Europe/Madrid';
begin
  if extract(isodow from madrid_now) = 1 and extract(hour from madrid_now) = 0 then
    update public.profiles set monthly_cancellations = 0 where monthly_cancellations <> 0;
  end if;
end;
$$;

create or replace function public.reset_monthly_missed_classes()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  madrid_now timestamp := now() at time zone 'Europe/Madrid';
begin
  if extract(day from madrid_now) = 1 and extract(hour from madrid_now) = 0 then
    update public.profiles set missed_classes = 0 where missed_classes <> 0;
  end if;
end;
$$;

-- Solo pg_cron (rol postgres) debe poder ejecutarlas
revoke execute on function public.reset_weekly_cancellations() from public, anon, authenticated;
revoke execute on function public.reset_monthly_missed_classes() from public, anon, authenticated;

-- Domingo 22:00 y 23:00 UTC = lunes 00:00 en Madrid (verano / invierno)
select cron.schedule('reset-weekly-cancellations', '0 22,23 * * 0', 'select public.reset_weekly_cancellations()');

-- Días 28-31 a las 22:00 y 23:00 UTC cubren el día 1 a las 00:00 en Madrid de cualquier mes
select cron.schedule('reset-monthly-missed-classes', '0 22,23 28-31 * *', 'select public.reset_monthly_missed_classes()');
