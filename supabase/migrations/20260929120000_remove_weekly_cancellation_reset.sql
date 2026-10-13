-- Ya no hay límite semanal de cancelaciones, así que el reinicio de monthly_cancellations cada lunes
-- deja de tener sentido. El reinicio mensual de missed_classes se mantiene.

select cron.unschedule('reset-weekly-cancellations')
where exists (select 1 from cron.job where jobname = 'reset-weekly-cancellations');

drop function if exists public.reset_weekly_cancellations();
