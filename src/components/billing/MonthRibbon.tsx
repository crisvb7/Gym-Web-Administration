import React from 'react';
import { formatMonth, invoiceReference } from '../../lib/billing';

export type PaidMonth = { invoice_id: string; invoice_number: string | null };

const SHORT_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

type Props = {
  clientName: string;
  months: string[];
  paid: Record<string, PaidMonth>;
  openMonth: string;
  thisMonth: string;
  joinMonth: string | null;
  onOpenInvoice: (invoiceId: string) => void;
  onCharge: (month: string) => void;
};

// Tira de 12 meses de un cliente. Los meses de una misma factura se dibujan unidos en un solo tramo.
export function MonthRibbon({ clientName, months, paid, openMonth, thisMonth, joinMonth, onOpenInvoice, onCharge }: Props) {
  return (
    // Rejilla de columnas iguales: el mismo mes queda alineado en todas las filas.
    <div className="grid grid-cols-12 gap-[3px]" role="group" aria-label={`Meses de ${clientName}`}>
      {months.map((month, index) => {
        const paidMonth = paid[month];
        const monthIndex = Number(month.slice(5, 7)) - 1;
        const previous = paid[months[index - 1]];
        const next = paid[months[index + 1]];
        const joinsPrevious = !!paidMonth && previous?.invoice_id === paidMonth.invoice_id;
        const joinsNext = !!paidMonth && next?.invoice_id === paidMonth.invoice_id;
        const isOpen = month === openMonth;
        const beforeJoining = !paidMonth && !!joinMonth && month < joinMonth;
        const isOverdue = !paidMonth && !beforeJoining && month < thisMonth;

        const shape = `${joinsPrevious ? 'rounded-l-none' : 'rounded-l-md'} ${joinsNext ? "rounded-r-none after:content-[''] after:absolute after:inset-y-0 after:-right-[3px] after:w-[3px] after:bg-emerald-500" : 'rounded-r-md'}`;
        const look = paidMonth
          ? 'bg-emerald-500 text-emerald-950'
          : beforeJoining
            ? 'text-gray-700 cursor-default'
            : isOverdue
              ? 'text-red-300/80 border border-red-500/25 hover:bg-[#E31C25] hover:border-[#E31C25] hover:text-white'
              : 'bg-[#121212] text-gray-500 border border-[#2a2a2a] hover:bg-[#E31C25] hover:border-[#E31C25] hover:text-white';

        const title = paidMonth
          ? `${formatMonth(month)}: pagado, factura ${invoiceReference({ id: paidMonth.invoice_id, invoice_number: paidMonth.invoice_number })}`
          : beforeJoining
            ? `${formatMonth(month)}: aún no era cliente`
            : `Cobrar ${formatMonth(month)}`;

        return (
          <button
            key={month}
            type="button"
            title={title}
            aria-label={`${clientName}. ${title}`}
            aria-current={isOpen ? 'date' : undefined}
            disabled={beforeJoining}
            onClick={() => paidMonth ? onOpenInvoice(paidMonth.invoice_id) : onCharge(month)}
            className={`relative min-w-0 h-8 text-[10px] font-bold transition-colors duration-150 ${shape} ${look} ${FOCUS} ${isOpen ? 'z-10 ring-2 ring-white ring-offset-1 ring-offset-[#1a1a1a]' : ''}`}
          >
            <span className="xl:hidden">{SHORT_NAMES[monthIndex][0]}</span>
            {/* Enero lleva el año, para que se note el cambio sin leer la fecha completa. */}
            <span className="hidden xl:inline">{SHORT_NAMES[monthIndex]}{monthIndex === 0 && <span className="font-medium opacity-70"> {month.slice(2, 4)}</span>}</span>
          </button>
        );
      })}
    </div>
  );
}
