// Cálculos de facturación, sin dependencias de React ni de Supabase.
//
// Los meses se identifican con el texto 'YYYY-MM-01' construido a partir de la fecha local. No usar
// toISOString(): convierte a UTC y en España el día 1 pasa a ser el último día del mes anterior.

// Art. 4.2 del RD 1619/2012 (utilización de instalaciones deportivas).
export const SIMPLIFIED_INVOICE_LIMIT = 3000;
export const VAT_RATE = 21;

// Datos del emisor que salen en la factura.
export const ISSUER = {
  name: 'Daniel Miranda',
  tradeName: 'Expertos en Movimiento',
  nif: '71729852M',
  city: 'Oviedo',
  email: 'danimirandatrainer@gmail.com',
};

export type DraftItem = { desc: string; amount: string; isFixed: boolean };
export type InvoiceLine = { desc: string; quantity: number; unit_amount: number; amount: number };

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

export function formatMonth(key: string): string {
  const [year, month] = key.split('-');
  return `${MONTH_NAMES[Number(month) - 1]} ${year}`;
}

// "Noviembre 2026, Diciembre 2026 y Enero 2027"
export function formatMonths(keys: string[]): string {
  const names = [...keys].sort().map(formatMonth);
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

const toCents = (value: string | number): number => Math.round((Number(value) || 0) * 100);

// La tarifa se multiplica por los meses, salvo que ya sea el precio de todo el periodo (perMonth = false,
// p. ej. 390 € por 3 meses). Los conceptos extra se cobran una sola vez.
export function buildLines(items: DraftItem[], months: string[], perMonth = true): InvoiceLine[] {
  return items.map((item) => {
    const quantity = item.isFixed && perMonth ? months.length : 1;
    const unitCents = toCents(item.amount);
    const coversPeriod = item.isFixed && !perMonth && months.length > 1;
    return {
      desc: coversPeriod ? `${item.desc.trim().replace(/ Mensual$/, '')} (${months.length} meses)` : item.desc.trim(),
      quantity,
      unit_amount: unitCents / 100,
      amount: (unitCents * quantity) / 100,
    };
  });
}

export function invoiceTotals(lines: Pick<InvoiceLine, 'amount'>[]) {
  const totalCents = lines.reduce((acc, line) => acc + toCents(line.amount), 0);
  // Igual que round(amount / 1.21, 2) en la base de datos.
  const baseCents = Math.round(totalCents / (1 + VAT_RATE / 100));
  return { total: totalCents / 100, base: baseCents / 100, vat: (totalCents - baseCents) / 100 };
}

// Número que se muestra: las facturas antiguas no tienen numeración y conservan su referencia.
export function invoiceReference(invoice: { id: string; invoice_number?: string | null }): string {
  return invoice.invoice_number || `FAC-${invoice.id.split('-')[0].toUpperCase()}`;
}
