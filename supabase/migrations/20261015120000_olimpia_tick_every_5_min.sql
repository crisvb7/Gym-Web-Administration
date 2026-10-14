-- El 14/10 la base de datos estuvo saturada de 10:50 a 20:12 (hora de Madrid): pg_cron no podía
-- arrancar sus trabajos ("job startup timeout") y la web se quedaba cargando. La llamada a
-- olimpia-tasks cada minuto era la única carga constante (un proceso de pg_cron, la cola de pg_net y
-- varias consultas de la función por minuto). Las tareas son mensuales/semanales y la función guarda
-- su estado en la base de datos, así que cada 5 minutos basta.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'olimpia-tasks-tick'),
  schedule := '*/5 * * * *'
);
