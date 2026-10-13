-- Tareas automáticas de OlimpIA en la nube: se ejecutan aunque el ordenador del gimnasio esté
-- apagado. La app de escritorio crea las tareas y sube las fichas; cada minuto pg_cron llama a la
-- función olimpia-tasks, que avanza el trabajo pendiente por pasos cortos.
--
-- Todas las tablas son solo para la service_role (la app de escritorio y la función): RLS activado
-- sin políticas, y sin permisos para anon/authenticated. La web no las ve.

create extension if not exists pg_net;

-- Ajustes que necesita la función: clave y modelo de OpenAI y zona horaria del gimnasio (los sube
-- la app de escritorio) y el secreto con el que pg_cron la llama.
create table if not exists public.olimpia_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into public.olimpia_settings (key, value)
values ('cron_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

create table if not exists public.olimpia_tasks (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly')),
  day_of_month int check (day_of_month between 1 and 31),
  day_of_week int check (day_of_week between 0 and 6),
  "time" text check ("time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  clients text[],
  -- Carpeta de fichas (relativa a la carpeta de la app; '' = la propia carpeta) si la tarea se
  -- hace una vez por cada cliente de esa carpeta. null = no es por cliente.
  client_files_folder text,
  -- true: los cambios quedan pendientes del botón Confirmar. null/false: se guardan directamente.
  require_confirmation boolean,
  created_at timestamptz not null default now(),
  -- Última ocurrencia (YYYY-MM-DD, hora del gimnasio) ya lanzada, para no repetirla.
  last_run_date text,
  last_run_summary text
);

-- Copia en la nube del texto de las fichas: una fila por cliente (un archivo, o una subcarpeta con
-- varios documentos) de cada carpeta de fichas que usan las tareas.
create table if not exists public.olimpia_fichas (
  folder text not null,
  client_name text not null,
  files text[] not null default '{}',
  content text not null default '',
  -- Nombre, tamaño y fecha de cada archivo: si no cambia, no se vuelve a subir.
  signature text not null,
  member_id uuid,
  -- ok | not_found | duplicate | unreadable
  match_status text,
  match_note text,
  synced_at timestamptz not null default now(),
  primary key (folder, client_name)
);

create table if not exists public.olimpia_task_runs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.olimpia_tasks (id) on delete cascade,
  -- YYYY-MM-DD de la ocurrencia programada, o "manual-..." para "Ejecutar ahora".
  occurrence text not null,
  status text not null default 'new' check (status in ('new', 'expanding', 'running', 'done')),
  summary text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  notified_at timestamptz,
  unique (task_id, occurrence)
);

-- Un trabajo por cliente (o uno solo si la tarea no es por cliente). Avanza una ronda del modelo
-- cada vez: response_id es la respuesta de OpenAI (modo background) que se está esperando.
create table if not exists public.olimpia_task_jobs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.olimpia_task_runs (id) on delete cascade,
  label text not null default '',
  prompt text not null,
  status text not null default 'pending' check (status in ('pending', 'waiting', 'done', 'failed')),
  response_id text,
  -- Última petición enviada a OpenAI (para reintentarla si falla).
  request jsonb,
  rounds int not null default 0,
  attempts int not null default 0,
  nudged boolean not null default false,
  tools_used text[] not null default '{}',
  -- Mensajes (formato chat) para el hilo "🕒 Tareas automáticas" de la app.
  transcript jsonb not null default '[]',
  pending_actions jsonb not null default '[]',
  result text,
  error text,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Cuándo lo importó la app de escritorio a su hilo de tareas.
  imported_at timestamptz
);

create index if not exists olimpia_task_jobs_active_idx on public.olimpia_task_jobs (status) where status in ('pending', 'waiting');
create index if not exists olimpia_task_jobs_unimported_idx on public.olimpia_task_jobs (run_id) where imported_at is null;
create index if not exists olimpia_task_jobs_run_idx on public.olimpia_task_jobs (run_id);

alter table public.olimpia_settings enable row level security;
alter table public.olimpia_tasks enable row level security;
alter table public.olimpia_fichas enable row level security;
alter table public.olimpia_task_runs enable row level security;
alter table public.olimpia_task_jobs enable row level security;

revoke all on public.olimpia_settings, public.olimpia_tasks, public.olimpia_fichas,
  public.olimpia_task_runs, public.olimpia_task_jobs from anon, authenticated;

-- Cada minuto, llama a la función. Responde al momento y sigue trabajando en segundo plano.
select cron.schedule(
  'olimpia-tasks-tick',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://vnockjqtkbhgytmmbdlb.supabase.co/functions/v1/olimpia-tasks',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-olimpia-secret', (select value from public.olimpia_settings where key = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);
