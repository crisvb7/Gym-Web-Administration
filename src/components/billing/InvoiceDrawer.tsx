import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Download, Loader2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { downloadInvoice, storeInvoicePdf } from '../../lib/invoicePdf';
import { VAT_RATE, formatEuros, formatMonths, invoiceReference } from '../../lib/billing';

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

export const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  pagada: { label: 'Pagada', className: 'bg-emerald-500/10 text-emerald-400' },
  anulada: { label: 'Anulada', className: 'bg-gray-800 text-gray-400' },
  rectificativa: { label: 'Rectificativa', className: 'bg-amber-500/10 text-amber-300' },
};

type Props = {
  invoiceId: string;
  onClose: () => void;
  onVoided: (rectification: any, pdfFailed: boolean) => void;
  onOpenInvoice: (invoiceId: string) => void;
};

export function InvoiceDrawer({ invoiceId, onClose, onVoided, onOpenInvoice }: Props) {
  const [invoice, setInvoice] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isVoiding, setIsVoiding] = useState(false);
  const [showVoidForm, setShowVoidForm] = useState(false);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    setInvoice(null);
    setLoadError(null);
    setShowVoidForm(false);
    setActionError(null);
    closeButton.current?.focus();
    supabase.from('invoices').select('*').eq('id', invoiceId).single().then(({ data, error }: any) => {
      if (cancelled) return;
      if (error) setLoadError(`No se ha podido abrir la factura: ${error.message}`);
      else setInvoice(data);
    });
    return () => { cancelled = true; };
  }, [invoiceId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !isVoiding) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isVoiding, onClose]);

  const download = async () => {
    setIsDownloading(true);
    setActionError(null);
    try {
      await downloadInvoice(invoice);
    } catch (error) {
      console.error(error);
      setActionError('No se ha podido generar el PDF. Inténtalo de nuevo.');
    }
    setIsDownloading(false);
  };

  const voidInvoice = async () => {
    setIsVoiding(true);
    setActionError(null);
    const { data: rectification, error } = await supabase
      .rpc('void_invoice', { p_invoice_id: invoice.id, p_reason: reason.trim() || null })
      .single();

    if (error || !rectification) {
      console.error(error);
      setActionError(`No se ha anulado la factura: ${error?.message ?? 'error desconocido'}`);
      setIsVoiding(false);
      return;
    }

    let pdfFailed = false;
    try {
      await storeInvoicePdf(rectification);
    } catch (pdfError) {
      console.error(pdfError);
      pdfFailed = true;
    }
    onVoided(rectification, pdfFailed);
  };

  const months: string[] = invoice?.period_months ?? [];
  const lines: any[] = invoice?.lines?.length
    ? invoice.lines
    : invoice ? [{ desc: invoice.description || 'Cuota mensual', quantity: 1, amount: invoice.amount }] : [];
  const status = invoice ? STATUS_STYLES[invoice.status] ?? { label: invoice.status, className: 'bg-gray-800 text-gray-400' } : null;

  return (
    <div className="fixed inset-0 z-[200] bg-black/70 flex justify-end motion-safe:animate-in motion-safe:fade-in duration-200" onClick={() => !isVoiding && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={invoice ? `Factura ${invoiceReference(invoice)}` : 'Factura'}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-[#1a1a1a] sm:border-l border-[#2a2a2a] h-full flex flex-col motion-safe:animate-in motion-safe:slide-in-from-right duration-300"
      >
        <header className="px-5 py-4 border-b border-[#2a2a2a] flex justify-between items-center gap-3 shrink-0">
          <div className="min-w-0 flex items-center gap-3">
            <h2 className="text-lg font-bold text-white truncate">{invoice ? invoiceReference(invoice) : 'Factura'}</h2>
            {status && <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${status.className}`}>{status.label}</span>}
          </div>
          <button ref={closeButton} onClick={onClose} disabled={isVoiding} aria-label="Cerrar" className={`p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors ${FOCUS}`}>
            <X size={20} />
          </button>
        </header>

        {loadError && <p role="alert" className="p-5 text-sm text-red-300">{loadError}</p>}
        {!invoice && !loadError && <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-[#E31C25]" /></div>}

        {invoice && (
          <>
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div><dt className="text-xs text-gray-500 mb-0.5">Cliente</dt><dd className="text-white font-medium">{invoice.client_name || '-'}</dd></div>
                <div><dt className="text-xs text-gray-500 mb-0.5">Fecha</dt><dd className="text-white">{new Date(invoice.issue_date ? `${invoice.issue_date}T12:00:00` : invoice.payment_date).toLocaleDateString('es-ES')}</dd></div>
                {months.length > 0 && <div className="col-span-2"><dt className="text-xs text-gray-500 mb-0.5">Periodo</dt><dd className="text-white">{formatMonths(months)}</dd></div>}
                {invoice.rectified_number && <div className="col-span-2"><dt className="text-xs text-gray-500 mb-0.5">Rectifica a la factura</dt><dd className="text-white font-medium">{invoice.rectified_number}</dd></div>}
                {invoice.rectification_reason && <div className="col-span-2"><dt className="text-xs text-gray-500 mb-0.5">Motivo</dt><dd className="text-white">{invoice.rectification_reason}</dd></div>}
              </dl>

              <div>
                <ul className="border-t border-[#3f3f46] divide-y divide-[#2a2a2a]">
                  {lines.map((line, index) => (
                    <li key={index} className="py-2.5 flex justify-between gap-3 text-sm">
                      <span className="text-gray-300 min-w-0">{line.desc}{line.quantity > 1 && <span className="text-gray-500"> × {line.quantity}</span>}</span>
                      <span className="text-white tabular-nums whitespace-nowrap">{formatEuros(line.amount)}</span>
                    </li>
                  ))}
                </ul>
                <dl className="border-t border-[#3f3f46] pt-3 space-y-1 text-sm tabular-nums">
                  {invoice.base_amount != null && <div className="flex justify-between text-gray-500"><dt>Base imponible</dt><dd>{formatEuros(invoice.base_amount)}</dd></div>}
                  {invoice.vat_amount != null && <div className="flex justify-between text-gray-500"><dt>IVA ({Number(invoice.vat_rate ?? VAT_RATE)} %)</dt><dd>{formatEuros(invoice.vat_amount)}</dd></div>}
                  <div className="flex justify-between items-baseline pt-1"><dt className="font-bold text-white">Total</dt><dd className="text-2xl font-black text-white">{formatEuros(invoice.amount)}</dd></div>
                </dl>
              </div>

              {invoice.rectifies_invoice_id && (
                <button type="button" onClick={() => onOpenInvoice(invoice.rectifies_invoice_id)} className={`text-sm text-gray-300 underline underline-offset-4 hover:text-white rounded ${FOCUS}`}>
                  Ver la factura {invoice.rectified_number}
                </button>
              )}

              {showVoidForm && (
                <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 space-y-3 motion-safe:animate-in motion-safe:fade-in duration-200">
                  <p className="text-sm text-gray-200">
                    Se emitirá una factura rectificativa por {formatEuros(-invoice.amount)}.
                    {months.length > 0 && <> {formatMonths(months)} {months.length > 1 ? 'volverán' : 'volverá'} a quedar sin pagar.</>}
                  </p>
                  <label className="block text-sm text-gray-400">
                    Motivo (sale en la rectificativa)
                    <input
                      type="text"
                      autoFocus
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Anulación de la operación"
                      className="mt-1 w-full bg-black border border-[#3f3f46] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#E31C25] transition-colors"
                    />
                  </label>
                </div>
              )}

              {actionError && <p role="alert" className="text-sm text-red-300 flex gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" />{actionError}</p>}
            </div>

            <footer className="p-5 border-t border-[#2a2a2a] space-y-2 shrink-0">
              {showVoidForm ? (
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowVoidForm(false)} disabled={isVoiding} className={`flex-1 py-2.5 rounded-xl border border-[#3f3f46] text-sm font-medium text-gray-300 hover:text-white hover:border-gray-500 transition-colors ${FOCUS}`}>
                    Volver
                  </button>
                  <button type="button" onClick={voidInvoice} disabled={isVoiding} className={`flex-[2] py-2.5 rounded-xl bg-[#E31C25] text-white text-sm font-bold hover:bg-[#c4161e] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 ${FOCUS}`}>
                    {isVoiding && <Loader2 size={16} className="animate-spin" />}
                    {isVoiding ? 'Anulando…' : 'Anular y emitir rectificativa'}
                  </button>
                </div>
              ) : (
                <>
                  <button type="button" onClick={download} disabled={isDownloading} className={`w-full py-2.5 rounded-xl bg-white text-zinc-900 text-sm font-bold hover:bg-gray-200 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 ${FOCUS}`}>
                    {isDownloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    Descargar PDF
                  </button>
                  {invoice.status === 'pagada' && (
                    <button type="button" onClick={() => setShowVoidForm(true)} className={`w-full py-2.5 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors ${FOCUS}`}>
                      Anular factura
                    </button>
                  )}
                </>
              )}
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
