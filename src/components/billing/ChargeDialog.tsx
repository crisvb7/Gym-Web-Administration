import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Loader2, Plus, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { storeInvoicePdf } from '../../lib/invoicePdf';
import {
  DEFAULT_FEE, DraftItem, SIMPLIFIED_INVOICE_LIMIT, VAT_RATE, addMonths, buildLines, formatEuros,
  formatMonth, formatMonths, invoiceTotals, monthKey,
} from '../../lib/billing';

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';
// A partir de este importe, una tarifa suele ser ya el precio de varios meses.
const HIGH_FEE = 100;

type Item = DraftItem & { excluded: string[] };

type Props = {
  client: any;
  initialMonth: string;
  onClose: () => void;
  onIssued: (invoice: any, pdfFailed: boolean) => void;
};

export function ChargeDialog({ client, initialMonth, onClose, onIssued }: Props) {
  const [year, month] = initialMonth.split('-').map(Number);
  const [pickerStart, setPickerStart] = useState(new Date(year, month - 2, 1));
  const [selectedMonths, setSelectedMonths] = useState<string[]>([initialMonth]);
  const [paidMonths, setPaidMonths] = useState<string[] | null>(null);
  const [feeIsPerMonth, setFeeIsPerMonth] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isIssuing, setIsIssuing] = useState(false);
  const [items, setItems] = useState<Item[]>(() => {
    const initial: Item[] = [{ desc: 'Cuota Mensual', amount: String(client.fee || DEFAULT_FEE), isFixed: true, excluded: [] }];
    if (client.nutrition_fee > 0) {
      initial.push({ desc: 'Servicio de Nutrición', amount: String(client.nutrition_fee), isFixed: true, excluded: [] });
    }
    return initial;
  });
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButton.current?.focus();
    let cancelled = false;
    supabase.from('invoice_periods').select('period_month').eq('user_id', client.id).then(({ data, error: loadError }: any) => {
      if (cancelled) return;
      if (loadError) setError(`No se han podido comprobar los meses pagados: ${loadError.message}`);
      else setPaidMonths((data || []).map((p: any) => p.period_month));
    });
    return () => { cancelled = true; };
  }, [client.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !isIssuing) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isIssuing, onClose]);

  const sortedMonths = [...selectedMonths].sort();
  const lines = buildLines(items, sortedMonths, feeIsPerMonth);
  const invoiceLines = lines.filter((line) => line.quantity > 0);
  const { total, base, vat } = invoiceTotals(lines);
  const overLimit = total > SIMPLIFIED_INVOICE_LIMIT;
  const isMultiMonth = sortedMonths.length > 1;
  const feeLooksLikeWholePeriod = isMultiMonth && feeIsPerMonth && items.some((item) => item.isFixed && Number(item.amount) >= HIGH_FEE);
  const pickerMonths = Array.from({ length: 12 }, (_, offset) => addMonths(pickerStart, offset));

  const toggleMonth = (key: string) => {
    const adding = !selectedMonths.includes(key);
    setSelectedMonths(adding ? [...selectedMonths, key] : selectedMonths.filter((m) => m !== key));
    // Un mes nuevo se aplica a las tarifas fijas, pero no a los extra ya añadidos (como una fianza).
    if (adding) {
      setItems(items.map((item) => ({
        ...item,
        excluded: item.isFixed || selectedMonths.length === 0
          ? item.excluded.filter((m) => m !== key)
          : [...item.excluded, key],
      })));
    }
  };

  const toggleItemMonth = (index: number, key: string) => {
    setItems(items.map((item, i) => i !== index ? item : {
      ...item,
      excluded: item.excluded.includes(key) ? item.excluded.filter((m) => m !== key) : [...item.excluded, key],
    }));
  };

  const updateItem = (index: number, field: 'desc' | 'amount', value: string) => {
    setItems(items.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  // Empieza en el primer mes cobrado; se pueden marcar más en la propia línea.
  const addExtra = () => {
    setItems([...items, { desc: '', amount: '', isFixed: false, excluded: sortedMonths.slice(1) }]);
  };

  const issue = async () => {
    setError(null);
    if (sortedMonths.length === 0) return setError('Selecciona al menos un mes.');
    if (items.some((item) => item.desc.trim() === '')) return setError('Escribe el nombre de todos los conceptos extra.');
    const withoutMonth = items.find((item, i) => !item.isFixed && lines[i].quantity === 0);
    if (withoutMonth) return setError(`Elige al menos un mes para "${withoutMonth.desc.trim()}".`);
    if (total <= 0) return setError('El total de la factura debe ser mayor que 0 €.');
    if (overLimit) return setError(`Una factura simplificada no puede superar ${formatEuros(SIMPLIFIED_INVOICE_LIMIT)} con IVA incluido. Quita meses de este cobro.`);

    setIsIssuing(true);
    const { data: invoice, error: insertError } = await supabase.from('invoices').insert([{
      user_id: client.id,
      amount: total,
      description: `${invoiceLines.map((line) => line.desc).join(' + ')} (${formatMonths(sortedMonths)})`,
      status: 'pagada',
      due_date: sortedMonths[0],
      period_months: sortedMonths,
      lines: invoiceLines,
      payment_date: new Date().toISOString(),
    }]).select().single();

    if (insertError || !invoice) {
      console.error(insertError);
      // 23505: alguno de los meses ya está pagado (por ejemplo, desde otro dispositivo).
      setError(insertError?.code === '23505'
        ? 'Alguno de los meses seleccionados ya está pagado. No se ha emitido la factura.'
        : `No se ha emitido la factura: ${insertError?.message ?? 'error desconocido'}`);
      setIsIssuing(false);
      return;
    }

    let pdfFailed = false;
    try {
      await storeInvoicePdf(invoice);
    } catch (pdfError) {
      console.error(pdfError);
      pdfFailed = true;
    }
    onIssued(invoice, pdfFailed);
  };

  const checkout = (
    <>
      <div aria-live="polite">
        {overLimit && !error && (
          <p className="mt-4 text-sm text-amber-200 flex gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" />Supera el máximo de {formatEuros(SIMPLIFIED_INVOICE_LIMIT)} de una factura simplificada. Quita meses de este cobro.</p>
        )}
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-300 flex gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" />{error}</p>
        )}
      </div>
      <button
        type="button"
        onClick={issue}
        disabled={isIssuing || overLimit || sortedMonths.length === 0}
        className={`mt-4 w-full bg-[#E31C25] text-white px-4 py-3 rounded-xl font-bold hover:bg-[#c4161e] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS}`}
      >
        {isIssuing && <Loader2 className="animate-spin" size={18} />}
        {isIssuing ? 'Emitiendo factura…' : `Cobrar ${formatEuros(total)} y emitir factura`}
      </button>
      <p className="mt-2 text-xs text-gray-500 text-center">Una factura emitida no se puede editar, solo anular.</p>
    </>
  );

  return (
    <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-stretch sm:items-center justify-center sm:p-4 motion-safe:animate-in motion-safe:fade-in duration-200" onClick={() => !isIssuing && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="charge-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-[#1a1a1a] sm:border border-[#2a2a2a] w-full max-w-5xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[100dvh] sm:max-h-[90vh] overflow-hidden motion-safe:animate-in motion-safe:zoom-in-95 duration-200"
      >
        <header className="px-5 sm:px-6 py-4 border-b border-[#2a2a2a] flex justify-between items-center gap-4 shrink-0">
          <h2 id="charge-title" className="text-lg font-bold text-white truncate">
            Cobrar a {client.first_name} {client.last_name}
          </h2>
          <button ref={closeButton} onClick={onClose} disabled={isIssuing} aria-label="Cerrar" className={`p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors ${FOCUS}`}>
            <X size={20} />
          </button>
        </header>

        <div className="overflow-y-auto lg:overflow-hidden flex-1 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] min-h-0">
          <div className="lg:overflow-y-auto p-5 sm:p-6 space-y-8">

            {/* Meses */}
            <section aria-labelledby="months-title">
              <div className="flex justify-between items-center mb-3">
                <h3 id="months-title" className="font-bold text-white"><span className="text-[#E31C25] mr-2">1</span>¿Qué meses paga?</h3>
                <div className="flex gap-1">
                  <button type="button" aria-label="Ver meses anteriores" onClick={() => setPickerStart(addMonths(pickerStart, -6))} className={`p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors ${FOCUS}`}><ChevronLeft size={18} /></button>
                  <button type="button" aria-label="Ver meses siguientes" onClick={() => setPickerStart(addMonths(pickerStart, 6))} className={`p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors ${FOCUS}`}><ChevronRight size={18} /></button>
                </div>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {pickerMonths.map((date) => {
                  const key = monthKey(date);
                  const isPaid = paidMonths?.includes(key) ?? false;
                  const isSelected = selectedMonths.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={isPaid || paidMonths === null}
                      aria-pressed={isSelected}
                      onClick={() => toggleMonth(key)}
                      className={`px-2 py-2.5 rounded-xl border text-left transition-colors ${FOCUS} ${
                        isPaid
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 cursor-not-allowed'
                          : isSelected
                            ? 'bg-[#E31C25] border-[#E31C25] text-white'
                            : 'bg-[#121212] border-[#2a2a2a] text-gray-300 hover:border-gray-500'
                      }`}
                    >
                      <span className="flex justify-between items-center text-sm font-bold">
                        {MONTH_NAMES[date.getMonth()]}
                        {isPaid && <Check size={14} aria-label="ya pagado" />}
                      </span>
                      <span className="block text-xs opacity-70">{date.getFullYear()}</span>
                    </button>
                  );
                })}
              </div>
              {isMultiMonth && (
                <label className={`mt-3 flex items-start gap-2.5 text-sm rounded-xl p-3 cursor-pointer select-none border transition-colors ${
                  feeLooksLikeWholePeriod ? 'bg-amber-500/10 border-amber-500/30 text-amber-100' : 'border-[#2a2a2a] text-gray-300'
                }`}>
                  <input type="checkbox" checked={!feeIsPerMonth} onChange={(e) => setFeeIsPerMonth(!e.target.checked)} className="accent-[#E31C25] mt-0.5 size-4 shrink-0" />
                  <span>
                    La tarifa ya es el precio de los {sortedMonths.length} meses: no multiplicarla.
                    {feeLooksLikeWholePeriod && <span className="block text-xs mt-0.5 opacity-80">Esta tarifa es alta. Compruébalo antes de cobrar: se está multiplicando por {sortedMonths.length}.</span>}
                  </span>
                </label>
              )}
            </section>

            {/* Conceptos */}
            <section aria-labelledby="items-title">
              <h3 id="items-title" className="font-bold text-white mb-3"><span className="text-[#E31C25] mr-2">2</span>¿Qué incluye?</h3>
              <div className="space-y-2">
                {items.map((item, index) => (
                  <div key={index} className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-3 motion-safe:animate-in motion-safe:fade-in duration-200">
                    {item.isFixed ? (
                      <div className="flex justify-between gap-3 text-sm">
                        <span className="text-white font-medium">{item.desc}</span>
                        <span className="text-gray-400 tabular-nums whitespace-nowrap">
                          {formatEuros(item.amount)}{feeIsPerMonth ? ' al mes' : ''}
                        </span>
                      </div>
                    ) : (
                      <div className="flex gap-2 items-center">
                        <input
                          type="text"
                          aria-label="Nombre del concepto"
                          placeholder="Concepto, por ejemplo Fianza"
                          autoFocus
                          value={item.desc}
                          onChange={(e) => updateItem(index, 'desc', e.target.value)}
                          className="flex-1 min-w-0 bg-black border border-[#3f3f46] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#E31C25] transition-colors"
                        />
                        <div className="relative w-24 shrink-0">
                          <input
                            type="number"
                            inputMode="decimal"
                            aria-label={isMultiMonth ? 'Precio por mes en euros' : 'Precio en euros'}
                            placeholder="0"
                            value={item.amount}
                            onChange={(e) => updateItem(index, 'amount', e.target.value)}
                            className="w-full bg-black border border-[#3f3f46] rounded-lg pl-3 pr-6 py-2 text-sm text-white text-right tabular-nums outline-none focus:border-[#E31C25] transition-colors"
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none">€</span>
                        </div>
                        <button type="button" aria-label={`Quitar ${item.desc || 'concepto'}`} onClick={() => setItems(items.filter((_, i) => i !== index))} className={`p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0 ${FOCUS}`}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}

                    {isMultiMonth && (feeIsPerMonth || !item.isFixed) && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                        <span className="text-xs text-gray-500 mr-0.5">Se aplica a</span>
                        {sortedMonths.map((key) => {
                          const applies = !item.excluded.includes(key);
                          return (
                            <button
                              key={key}
                              type="button"
                              aria-pressed={applies}
                              onClick={() => toggleItemMonth(index, key)}
                              className={`px-2 py-1 text-xs font-medium rounded-md border transition-colors ${FOCUS} ${
                                applies ? 'bg-[#E31C25]/15 border-[#E31C25]/50 text-white' : 'border-[#2a2a2a] text-gray-500 line-through hover:border-gray-500'
                              }`}
                            >
                              {formatMonth(key)}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <button type="button" onClick={addExtra} className={`mt-2 w-full py-2.5 rounded-xl border border-dashed border-[#3f3f46] text-sm font-medium text-gray-400 hover:text-white hover:border-gray-500 transition-colors flex items-center justify-center gap-1.5 ${FOCUS}`}>
                <Plus size={16} /> Añadir concepto extra
              </button>
            </section>
          </div>

          {/* La factura tal como saldrá */}
          <aside aria-label="Resumen de la factura" className="bg-[#121212] border-t lg:border-t-0 lg:border-l border-[#2a2a2a] p-5 sm:p-6 lg:overflow-y-auto">
            <div className="relative overflow-hidden bg-[#0F0F12] text-[#D4D4D8] border border-[#3A3A41] p-5 shadow-lg">
              <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_100%_100%,rgba(240,8,60,0.13),transparent_70%)]" />
              <img src="/logo-invoice-mark.png" alt="" aria-hidden="true" className="absolute -right-6 -bottom-6 w-44" />
              <div className="relative">
                <div className="flex justify-between items-start gap-3 pb-3 border-b border-[#2E2E34]">
                  <img src="/logo-invoice.png" alt="" className="w-8 h-10 object-contain bg-white p-0.5" />
                  <div className="text-right min-w-0">
                    <p className="font-mono font-bold text-[9px] tracking-widest text-[#F0083C]">FACTURA SIMPLIFICADA</p>
                    <p className="text-xs font-bold text-white mt-1 truncate">{client.first_name} {client.last_name}</p>
                  </div>
                </div>

                <div className="relative mt-3 bg-[#1A1A1F] border border-[#3A3A41] px-3 py-2">
                  <p className="font-mono font-bold text-[9px] tracking-widest text-[#F0083C]">PERIODO FACTURADO</p>
                  <p className="text-xs font-bold text-white mt-0.5">{sortedMonths.length ? formatMonths(sortedMonths) : 'Sin meses'}</p>
                  <span aria-hidden="true" className="absolute left-0 -bottom-px w-1/4 h-0.5 bg-[#F0083C]" />
                </div>

                <ul className="mt-3 border-b border-[#2E2E34] divide-y divide-[#2E2E34]">
                  {lines.map((line, index) => line.quantity > 0 && (
                    <li key={index} className="py-2 flex justify-between gap-3 text-xs">
                      <span className="min-w-0 font-bold text-white">
                        {items[index].desc.trim() ? line.desc : <span className="font-normal text-[#9A9AA3]">Concepto sin nombre</span>}
                        {line.quantity > 1 && <span className="font-normal text-[#9A9AA3]"> × {line.quantity}</span>}
                      </span>
                      <span className="font-bold text-white tabular-nums whitespace-nowrap">{formatEuros(line.amount)}</span>
                    </li>
                  ))}
                </ul>

                <dl className="mt-3 bg-[#1A1A1F] border border-[#3A3A41] px-3 py-2.5 space-y-1 text-xs tabular-nums">
                  <div className="flex justify-between"><dt className="text-[#9A9AA3]">Base imponible</dt><dd className="font-bold text-white">{formatEuros(base)}</dd></div>
                  <div className="flex justify-between"><dt className="text-[#9A9AA3]">IVA / {VAT_RATE} %</dt><dd className="font-bold text-white">{formatEuros(vat)}</dd></div>
                  <div className="flex justify-between items-center pt-2 mt-2 border-t border-[#3A3A41]">
                    <dt className="font-mono font-bold text-[10px] tracking-widest text-white">TOTAL</dt>
                    <dd className="font-mono font-bold text-xl text-[#F0083C]">{formatEuros(total)}</dd>
                  </div>
                </dl>
              </div>
            </div>

            <div className="hidden lg:block">{checkout}</div>
          </aside>
        </div>

        {/* En móvil el botón queda siempre a la vista, fuera de lo que se desplaza. */}
        <div className="lg:hidden shrink-0 px-5 pb-4 border-t border-[#2a2a2a] bg-[#121212]">{checkout}</div>
      </div>
    </div>
  );
}
