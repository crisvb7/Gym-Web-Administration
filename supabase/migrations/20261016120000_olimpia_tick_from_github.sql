-- La instancia del plan Free (0,5 GB de RAM) se queda sin memoria y tira de swap; cuando se agota el
-- cupo de disco, la base de datos se congela durante horas (14/10 y 15/10). Para quitarle peso, el aviso
-- periódico a olimpia-tasks ya no sale de la base de datos (pg_cron + pg_net) sino de GitHub Actions
-- (.github/workflows/olimpia-tick.yml), y se desinstala pg_net, que solo se usaba para eso.

-- Por si algo más usa pg_net (p. ej. webhooks de base de datos creados desde el panel): entonces no se toca nada.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname not in ('net', 'pg_catalog', 'information_schema')
      and p.prosrc ilike '%net.http_%'
  ) or exists (
    select 1 from cron.job where jobname <> 'olimpia-tasks-tick' and command ilike '%net.http_%'
  ) then
    raise exception 'pg_net se usa en otro sitio: revisar antes de desinstalarlo';
  end if;
end $$;

select cron.unschedule(jobid) from cron.job where jobname = 'olimpia-tasks-tick';

drop extension if exists pg_net;
