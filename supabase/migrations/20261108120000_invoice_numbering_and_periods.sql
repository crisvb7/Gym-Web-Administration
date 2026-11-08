-- Facturación legal (RD 1619/2012):
--  * Numeración correlativa sin huecos: F2026-0001 (simplificadas) y R2026-0001 (rectificativas, serie propia).
--  * Una factura puede cubrir varios meses (invoice_periods), y un mes no se puede cobrar dos veces.
--  * Las facturas no se borran ni se modifican: se anulan con una rectificativa.
--  * Límite de la factura simplificada: 3.000 € con IVA incluido (art. 4.2, utilización de instalaciones deportivas).
--  * Solo el staff escribe facturas; cada cliente solo ve las suyas (antes cualquier sesión podía todo).
--  * Borrar un socio ya no borra sus facturas (hay obligación de conservarlas).
--
-- La numeración y los meses se resuelven con triggers, así que también valen para OlimpIA, que inserta en
-- invoices directamente. Las facturas anteriores conservan su referencia FAC-xxxx: no se renumeran.

-- Copia de lo que cambia esta migración, para poder volver atrás (supabase/rollbacks/). RLS sin políticas:
-- solo accesible desde el panel o con la service_role.
create table if not exists public.backup_20261108_invoices as table public.invoices;
alter table public.backup_20261108_invoices enable row level security;
create table if not exists public.backup_20261108_profiles as
  select id, payment_status from public.profiles;
alter table public.backup_20261108_profiles enable row level security;

alter table public.invoices
  add column if not exists invoice_number text,
  add column if not exists series text,
  add column if not exists number integer,
  add column if not exists issue_date date,
  add column if not exists client_name text,
  add column if not exists lines jsonb,
  add column if not exists period_months date[],
  add column if not exists vat_rate numeric(5,2) not null default 21,
  add column if not exists base_amount numeric(10,2),
  add column if not exists vat_amount numeric(10,2),
  add column if not exists rectifies_invoice_id uuid references public.invoices(id),
  add column if not exists rectified_number text,
  add column if not exists rectification_reason text;

create unique index if not exists invoices_invoice_number_key on public.invoices (invoice_number);
create unique index if not exists invoices_series_number_key on public.invoices (series, number);
-- Una factura solo se puede rectificar (anular) una vez.
create unique index if not exists invoices_rectifies_key on public.invoices (rectifies_invoice_id)
  where rectifies_invoice_id is not null;

-- Borrar un socio deja la factura, sin vínculo, con el nombre guardado en client_name.
alter table public.invoices alter column user_id drop not null;
alter table public.invoices drop constraint if exists invoices_user_id_fkey;
alter table public.invoices
  add constraint invoices_user_id_fkey foreign key (user_id) references public.profiles(id) on delete set null;

update public.invoices i
set client_name = trim(concat(p.first_name, ' ', p.last_name))
from public.profiles p
where p.id = i.user_id and i.client_name is null;

-- Contador por serie y año. Se actualiza dentro de la transacción de la factura: si esta falla, el número
-- no se consume, y el bloqueo de la fila evita duplicados con dos cobros a la vez.
create table if not exists public.invoice_counters (
  series text not null,
  year integer not null,
  last_number integer not null,
  primary key (series, year)
);
alter table public.invoice_counters enable row level security;

-- Meses que cubre cada factura. Lo que dice si un mes está pagado.
create table if not exists public.invoice_periods (
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  period_month date not null check (extract(day from period_month) = 1),
  primary key (invoice_id, period_month),
  unique (user_id, period_month)
);
create index if not exists invoice_periods_month_idx on public.invoice_periods (period_month);

-- Meses de las facturas existentes. due_date + 1 día cubre los dos formatos guardados: último día del mes
-- anterior (web) y día 1 (OlimpIA). Cada factura cubre siempre el mes de su registro.
--
-- Además, los meses de "(Meses: Noviembre, Diciembre)" si el importe es de 100 € o más. Por debajo son cuotas
-- de un mes con la selección arrastrada del cliente anterior (el texto dice 3 meses y el importe es de 50 €).
-- El texto no lleva año: se toma el más cercano al mes del registro.
-- Si dos facturas cubren el mismo mes, se queda con él la más antigua.
insert into public.invoice_periods (invoice_id, user_id, period_month)
with legacy as (
  select id, user_id, created_at, amount, description,
         date_trunc('month', (due_date + 1)::timestamp)::date as base_month
  from public.invoices
  where status = 'pagada' and user_id is not null and due_date is not null
),
stated as (
  select l.id, l.user_id, l.created_at, l.base_month,
         make_date(extract(year from l.base_month)::int, array_position(
           array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'],
           lower(trim(name))), 1) as month_same_year
  from legacy l
  cross join lateral unnest(string_to_array((regexp_match(l.description, '\(Meses: ([^)]*)\)'))[1], ',')) as name
  where l.amount >= 100 and l.description ~ '\(Meses: [^)]*,'
),
all_months as (
  select id, user_id, created_at, base_month as period_month from legacy
  union
  select id, user_id, created_at,
         case when month_same_year > base_month + interval '6 months' then (month_same_year - interval '1 year')::date
              when month_same_year < base_month - interval '6 months' then (month_same_year + interval '1 year')::date
              else month_same_year end
  from stated
  where month_same_year is not null
)
select id, user_id, period_month from all_months
order by created_at, period_month
on conflict do nothing;

update public.invoices i
set period_months = (select array_agg(p.period_month order by p.period_month) from public.invoice_periods p where p.invoice_id = i.id)
where exists (select 1 from public.invoice_periods p where p.invoice_id = i.id);

create or replace function public.invoice_is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'trainer'));
$$;
revoke all on function public.invoice_is_staff() from public, anon;
grant execute on function public.invoice_is_staff() to authenticated, service_role;

-- Antes de crear: valida, normaliza y asigna el número.
create or replace function public.invoices_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Europe/Madrid')::date;
  v_year integer := extract(year from v_today)::integer;
  v_lines_total numeric;
begin
  if new.status not in ('pagada', 'rectificativa') then
    return new;
  end if;

  if new.status = 'rectificativa' then
    if new.rectifies_invoice_id is null then
      raise exception 'Una factura rectificativa debe indicar la factura que rectifica.';
    end if;
    new.series := 'R';
  else
    new.series := 'F';
    new.rectifies_invoice_id := null;
    if new.amount is null or new.amount < 0 then
      raise exception 'El importe de la factura no puede ser negativo.';
    end if;
    if new.amount > 3000 then
      raise exception 'LIMITE_SIMPLIFICADA: una factura simplificada no puede superar los 3.000 € con IVA incluido.';
    end if;

    if new.period_months is null or cardinality(new.period_months) = 0 then
      if new.due_date is null then
        raise exception 'La factura debe indicar qué meses cubre.';
      end if;
      new.period_months := array[date_trunc('month', (new.due_date + 1)::timestamp)::date];
    else
      select array_agg(distinct d order by d) into new.period_months
      from (select date_trunc('month', m::timestamp)::date as d from unnest(new.period_months) m) s;
    end if;
    -- Mismo formato que han guardado siempre las facturas de la web (último día del mes anterior), por si
    -- la app móvil lo usa para saber si el mes está pagado. Lo que manda ahora es invoice_periods.
    new.due_date := new.period_months[1] - 1;
  end if;

  if new.lines is null then
    new.lines := jsonb_build_array(jsonb_build_object(
      'desc', coalesce(new.description, 'Cuota mensual'), 'quantity', 1, 'unit_amount', new.amount, 'amount', new.amount));
  end if;
  select sum((l->>'amount')::numeric) into v_lines_total from jsonb_array_elements(new.lines) l;
  if abs(coalesce(v_lines_total, 0) - new.amount) > 0.005 then
    raise exception 'La suma de los conceptos no coincide con el total de la factura.';
  end if;

  new.base_amount := round(new.amount / (1 + new.vat_rate / 100), 2);
  new.vat_amount := new.amount - new.base_amount;
  new.issue_date := v_today;
  new.payment_date := coalesce(new.payment_date, now());
  if new.client_name is null and new.user_id is not null then
    select trim(concat(first_name, ' ', last_name)) into new.client_name from public.profiles where id = new.user_id;
  end if;

  insert into public.invoice_counters as c (series, year, last_number)
  values (new.series, v_year, 1)
  on conflict (series, year) do update set last_number = c.last_number + 1
  returning last_number into new.number;
  new.invoice_number := new.series || v_year::text || '-' || lpad(new.number::text, 4, '0');

  return new;
end;
$$;

-- Después de crear una factura cobrada: registra sus meses y actualiza el estado del cliente. Si un mes ya
-- estaba pagado, la restricción unique deshace todo, número incluido.
create or replace function public.invoices_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'pagada' or new.user_id is null then
    return null;
  end if;

  insert into public.invoice_periods (invoice_id, user_id, period_month)
  select new.id, new.user_id, m from unnest(new.period_months) m;

  -- Pagar solo meses ya pasados no reactiva la cuenta: el mes en curso sigue sin pagar.
  if (new.period_months[cardinality(new.period_months)] + interval '1 month')::timestamp
     at time zone 'Europe/Madrid' > now() then
    update public.profiles set payment_status = 'paid' where id = new.user_id;
  end if;

  return null;
end;
$$;

-- Una factura emitida no se borra ni se cambia. Solo se admite guardar su PDF, marcarla como anulada y
-- desvincularla cuando se borra el socio.
create or replace function public.invoices_protect()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Las facturas no se pueden borrar: hay que anularlas con una factura rectificativa.';
  end if;
  if (to_jsonb(new) - 'pdf_url' - 'status' - 'user_id') is distinct from (to_jsonb(old) - 'pdf_url' - 'status' - 'user_id') then
    raise exception 'Una factura emitida no se puede modificar: hay que anularla con una factura rectificativa.';
  end if;
  if new.status is distinct from old.status and not (old.status = 'pagada' and new.status = 'anulada') then
    raise exception 'Cambio de estado de factura no permitido (% a %).', old.status, new.status;
  end if;
  if new.user_id is distinct from old.user_id and new.user_id is not null then
    raise exception 'No se puede cambiar el cliente de una factura emitida.';
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_before_insert on public.invoices;
create trigger invoices_before_insert before insert on public.invoices
  for each row execute function public.invoices_before_insert();

drop trigger if exists invoices_after_insert on public.invoices;
create trigger invoices_after_insert after insert on public.invoices
  for each row execute function public.invoices_after_insert();

drop trigger if exists invoices_protect on public.invoices;
create trigger invoices_protect before update or delete on public.invoices
  for each row execute function public.invoices_protect();

-- Anula una factura: emite la rectificativa por el importe en negativo, marca la original como anulada,
-- libera sus meses y recalcula el estado del cliente. Devuelve la rectificativa.
create or replace function public.void_invoice(p_invoice_id uuid, p_reason text default null)
returns public.invoices language plpgsql security definer set search_path = public as $$
declare
  v_old public.invoices;
  v_new public.invoices;
  v_reason text := coalesce(nullif(trim(p_reason), ''), 'Anulación de la operación');
  v_ref text;
  v_last date;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.invoice_is_staff() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  select * into v_old from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'La factura no existe.';
  end if;
  if v_old.status <> 'pagada' then
    raise exception 'Solo se puede anular una factura pagada (estado actual: %).', v_old.status;
  end if;

  v_ref := coalesce(v_old.invoice_number, 'FAC-' || upper(split_part(v_old.id::text, '-', 1)));

  insert into public.invoices
    (user_id, client_name, amount, description, status, due_date, payment_date, vat_rate, lines,
     rectifies_invoice_id, rectified_number, rectification_reason)
  select
    v_old.user_id, v_old.client_name, -v_old.amount, 'Rectificativa de ' || v_ref || ': ' || v_reason,
    'rectificativa', v_old.due_date, now(), v_old.vat_rate,
    (select jsonb_agg(jsonb_build_object(
        'desc', l->>'desc',
        'quantity', coalesce((l->>'quantity')::numeric, 1),
        'unit_amount', -coalesce((l->>'unit_amount')::numeric, (l->>'amount')::numeric),
        'amount', -(l->>'amount')::numeric))
     from jsonb_array_elements(coalesce(v_old.lines, jsonb_build_array(jsonb_build_object(
        'desc', coalesce(v_old.description, 'Cuota mensual'), 'amount', v_old.amount)))) l),
    v_old.id, v_ref, v_reason
  returning * into v_new;

  update public.invoices set status = 'anulada' where id = v_old.id;
  delete from public.invoice_periods where invoice_id = v_old.id;

  if v_old.user_id is not null then
    select max(period_month) into v_last from public.invoice_periods where user_id = v_old.user_id;
    update public.profiles
    set payment_status = case
      when v_last is not null and (v_last + interval '1 month')::timestamp at time zone 'Europe/Madrid' > now()
        then 'paid' else 'pending' end
    where id = v_old.user_id;
  end if;

  return v_new;
end;
$$;
revoke all on function public.void_invoice(uuid, text) from public, anon;
grant execute on function public.void_invoice(uuid, text) to authenticated, service_role;

-- Permisos: fuera la política que dejaba todo a cualquier sesión, clientes incluidos. No hay política de DELETE.
-- Se mantiene "Los usuarios pueden ver sus propias facturas".
alter table public.invoices enable row level security;
drop policy if exists "Permitir todo a usuarios autenticados" on public.invoices;
drop policy if exists "Staff ve las facturas" on public.invoices;
drop policy if exists "Staff crea facturas" on public.invoices;
drop policy if exists "Staff actualiza facturas" on public.invoices;
create policy "Staff ve las facturas" on public.invoices for select to authenticated
  using (public.invoice_is_staff());
create policy "Staff crea facturas" on public.invoices for insert to authenticated
  with check (public.invoice_is_staff());
create policy "Staff actualiza facturas" on public.invoices for update to authenticated
  using (public.invoice_is_staff()) with check (public.invoice_is_staff());

-- Los meses solo se escriben desde los triggers y void_invoice.
alter table public.invoice_periods enable row level security;
drop policy if exists "Staff ve los meses facturados" on public.invoice_periods;
drop policy if exists "Clientes ven sus meses facturados" on public.invoice_periods;
create policy "Staff ve los meses facturados" on public.invoice_periods for select to authenticated
  using (public.invoice_is_staff());
create policy "Clientes ven sus meses facturados" on public.invoice_periods for select to authenticated
  using (auth.uid() = user_id);

notify pgrst, 'reload schema';
