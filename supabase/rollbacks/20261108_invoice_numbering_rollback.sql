-- Deshace 20261108120000_invoice_numbering_and_periods.sql para volver a la web anterior. No se aplica solo:
-- ejecutar a mano en el editor SQL de Supabase, después de publicar la versión anterior de la web.
--
-- Se conservan las facturas ya numeradas y sus columnas, porque son documentos emitidos. Tampoco se devuelve el
-- ON DELETE CASCADE, para que borrar un socio no borre sus facturas. Las rectificativas emitidas siguen ahí con
-- importe negativo y la web anterior no las distingue: revisarlas si las hay.

drop trigger if exists invoices_before_insert on public.invoices;
drop trigger if exists invoices_after_insert on public.invoices;
drop trigger if exists invoices_protect on public.invoices;
drop function if exists public.void_invoice(uuid, text);
drop function if exists public.invoices_before_insert();
drop function if exists public.invoices_after_insert();
drop function if exists public.invoices_protect();

drop policy if exists "Staff ve las facturas" on public.invoices;
drop policy if exists "Staff crea facturas" on public.invoices;
drop policy if exists "Staff actualiza facturas" on public.invoices;
create policy "Permitir todo a usuarios autenticados" on public.invoices
  using (auth.role() = 'authenticated');

drop policy if exists "Staff ve los meses facturados" on public.invoice_periods;
drop policy if exists "Clientes ven sus meses facturados" on public.invoice_periods;
drop table if exists public.invoice_periods;
drop function if exists public.invoice_is_staff();

-- Solo paid_until: el estado de pago de los cobros posteriores a la migración sigue siendo válido.
update public.profiles p
set paid_until = b.paid_until
from public.backup_20261108_profiles b
where b.id = p.id;

notify pgrst, 'reload schema';
