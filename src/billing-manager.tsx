import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, CheckCircle, ChevronLeft, ChevronRight, Download, Loader2, Pencil, Search, Unlock, X } from "lucide-react";
import { supabase } from "./lib/supabase";
import { downloadInvoice } from "./lib/invoicePdf";
import { DEFAULT_FEE, FREEZE_DAY, addMonths, formatEuros, formatMonth, formatMonths, invoiceReference, monthKey } from "./lib/billing";
import { MonthRibbon, PaidMonth } from "./components/billing/MonthRibbon";
import { ChargeDialog } from "./components/billing/ChargeDialog";
import { InvoiceDrawer, STATUS_STYLES } from "./components/billing/InvoiceDrawer";

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

type ClientStatus = 'paid' | 'frozen' | 'overdue' | 'pending';
type Filter = 'all' | ClientStatus;
type Toast = { kind: 'success' | 'error'; message: string; invoice?: any };

const STATUS: Record<ClientStatus, { label: string; badge: string; bar: string; order: number }> = {
  frozen: { label: 'Congelado', badge: 'bg-red-500/10 text-red-400 border-red-500/20', bar: 'bg-[#E31C25]', order: 0 },
  overdue: { label: 'Sin pagar', badge: 'bg-red-500/10 text-red-300 border-red-500/20', bar: 'bg-red-400/70', order: 1 },
  pending: { label: 'Pendiente', badge: 'bg-gray-800 text-gray-300 border-transparent', bar: 'bg-gray-600', order: 2 },
  paid: { label: 'Pagado', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', bar: 'bg-emerald-500', order: 3 },
};

// PostgREST devuelve como mucho 1000 filas por petición: con 12 meses por cliente se puede superar.
async function fetchPeriods(from: string, to: string) {
  const rows: any[] = [];
  const pageSize = 1000;
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase
      .from('invoice_periods')
      .select('user_id, period_month, invoice_id, invoice:invoices(invoice_number)')
      .gte('period_month', from)
      .lte('period_month', to)
      .order('period_month')
      .order('invoice_id')
      .range(start, start + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

export function BillingManager() {
  const today = useMemo(() => new Date(), []);
  const thisMonth = monthKey(today);

  const [clients, setClients] = useState<any[]>([]);
  const [periods, setPeriods] = useState<any[]>([]);
  const [issuedInvoices, setIssuedInvoices] = useState<any[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [openMonthDate, setOpenMonthDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [view, setView] = useState<'clients' | 'invoices'>('clients');
  const [filter, setFilter] = useState<Filter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [charging, setCharging] = useState<{ client: any; month: string } | null>(null);
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);
  const [editingFeesId, setEditingFeesId] = useState<string | null>(null);
  const [tempBaseFee, setTempBaseFee] = useState('');
  const [tempNutriFee, setTempNutriFee] = useState('');
  const [confirmUnfreezeId, setConfirmUnfreezeId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const requestId = useRef(0);

  const openMonth = monthKey(openMonthDate);
  // El mes abierto queda hacia la mitad de la tira, con su pasado y su futuro a los lados.
  const ribbonMonths = useMemo(
    () => Array.from({ length: 12 }, (_, i) => monthKey(addMonths(openMonthDate, i - 5))),
    [openMonthDate],
  );

  const fetchData = useCallback(async () => {
    const id = ++requestId.current;
    setIsLoading(true);
    setLoadError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
        if (id === requestId.current) setIsAdmin(profile?.role === 'admin');
      }

      const nextMonth = addMonths(openMonthDate, 1);
      const [clientsResult, periodRows, issuedResult] = await Promise.all([
        supabase.from('profiles').select('id, first_name, last_name, fee, nutrition_fee, payment_status, created_at').eq('role', 'client').order('first_name', { ascending: true }),
        fetchPeriods(ribbonMonths[0], ribbonMonths[ribbonMonths.length - 1]),
        supabase.from('invoices').select('*').gte('created_at', openMonthDate.toISOString()).lt('created_at', nextMonth.toISOString()).order('created_at', { ascending: false }),
      ]);
      if (clientsResult.error) throw clientsResult.error;
      if (issuedResult.error) throw issuedResult.error;
      if (id !== requestId.current) return;

      setClients(clientsResult.data ?? []);
      setPeriods(periodRows);
      setIssuedInvoices(issuedResult.data ?? []);
      setHasLoaded(true);
    } catch (error: any) {
      console.error(error);
      if (id === requestId.current) setLoadError(error.message ?? 'Error desconocido');
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
  }, [openMonthDate, ribbonMonths]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Un aviso no debe tapar los botones de la ventana que se acaba de abrir.
  useEffect(() => {
    if (charging || openInvoiceId) setToast(null);
  }, [charging, openInvoiceId]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.invoice ? 9000 : 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const paidByUser = useMemo(() => {
    const map: Record<string, Record<string, PaidMonth>> = {};
    for (const row of periods) {
      (map[row.user_id] ??= {})[row.period_month] = { invoice_id: row.invoice_id, invoice_number: row.invoice?.invoice_number ?? null };
    }
    return map;
  }, [periods]);

  const statusOf = useCallback((client: any): ClientStatus => {
    if (paidByUser[client.id]?.[openMonth]) return 'paid';
    if (openMonth < thisMonth) return 'overdue';
    if (openMonth === thisMonth && today.getDate() >= FREEZE_DAY) return 'frozen';
    return 'pending';
  }, [paidByUser, openMonth, thisMonth, today]);

  const joinMonthOf = (client: any) => client.created_at ? monthKey(new Date(client.created_at)) : null;

  // Cada mes cuenta solo quienes ya eran clientes entonces, o quienes tienen ese mes pagado.
  const monthClients = useMemo(() => clients
    .filter((c) => {
      const joined = c.created_at ? monthKey(new Date(c.created_at)) : null;
      return !joined || joined <= openMonth || !!paidByUser[c.id]?.[openMonth];
    })
    .map((c) => ({ ...c, status: statusOf(c) })),
  [clients, openMonth, paidByUser, statusOf]);

  const counts = useMemo(() => {
    const result: Record<ClientStatus, number> = { paid: 0, frozen: 0, overdue: 0, pending: 0 };
    for (const c of monthClients) result[c.status as ClientStatus]++;
    return result;
  }, [monthClients]);

  const visibleClients = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return monthClients
      .filter((c) => filter === 'all' || c.status === filter)
      .filter((c) => !query || `${c.first_name} ${c.last_name}`.toLowerCase().includes(query))
      .sort((a, b) => STATUS[a.status as ClientStatus].order - STATUS[b.status as ClientStatus].order);
  }, [monthClients, filter, searchQuery]);

  // Neto del mes: una factura anulada y su rectificativa se compensan.
  const billedThisMonth = issuedInvoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  const unpaidCount = monthClients.length - counts.paid;
  const availableFilters = (Object.keys(STATUS) as ClientStatus[]).filter((key) => counts[key] > 0);

  const changeMonth = (delta: number) => {
    setOpenMonthDate(addMonths(openMonthDate, delta));
    setFilter('all');
  };

  const startFeeEdit = (client: any) => {
    setEditingFeesId(client.id);
    setTempBaseFee(String(client.fee || DEFAULT_FEE));
    setTempNutriFee(String(client.nutrition_fee || 0));
  };

  const saveFees = async (clientId: string) => {
    const fee = parseFloat(tempBaseFee) || 0;
    const nutrition_fee = parseFloat(tempNutriFee) || 0;
    const { error } = await supabase.from('profiles').update({ fee, nutrition_fee }).eq('id', clientId);
    if (error) {
      setToast({ kind: 'error', message: `No se ha guardado la tarifa: ${error.message}` });
      return;
    }
    setClients(clients.map((c) => c.id === clientId ? { ...c, fee, nutrition_fee } : c));
    setEditingFeesId(null);
  };

  const unfreeze = async (client: any) => {
    setConfirmUnfreezeId(null);
    const { error } = await supabase.from('profiles').update({ payment_status: 'paid' }).eq('id', client.id);
    if (error) {
      setToast({ kind: 'error', message: `No se ha reactivado la cuenta: ${error.message}` });
      return;
    }
    setToast({ kind: 'success', message: `Cuenta de ${client.first_name} reactivada, sin factura.` });
    fetchData();
  };

  const downloadFromList = async (invoice: any) => {
    try {
      await downloadInvoice(invoice);
    } catch (error) {
      console.error(error);
      setToast({ kind: 'error', message: `No se ha podido generar el PDF de ${invoiceReference(invoice)}.` });
    }
  };

  const handleIssued = (invoice: any, pdfFailed: boolean) => {
    setCharging(null);
    setToast({
      kind: 'success',
      message: `Factura ${invoice.invoice_number} emitida: ${formatEuros(invoice.amount)}.${pdfFailed ? ' El PDF se generará al descargarla.' : ''}`,
      invoice,
    });
    fetchData();
  };

  const handleVoided = (rectification: any, pdfFailed: boolean) => {
    setOpenInvoiceId(null);
    setToast({
      kind: 'success',
      message: `Factura ${rectification.rectified_number} anulada. Rectificativa ${rectification.invoice_number} emitida.${pdfFailed ? ' El PDF se generará al descargarla.' : ''}`,
      invoice: rectification,
    });
    fetchData();
  };

  return (
    <div className="space-y-6">
      {/* El mes: qué falta por cobrar */}
      <section aria-label={`Resumen de ${formatMonth(openMonth)}`} className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <h1 className="text-3xl font-bold text-white tracking-tight">Facturación</h1>
          <div className="flex items-center gap-1 bg-[#1a1a1a] p-1 rounded-xl border border-[#2a2a2a]">
            <button aria-label="Mes anterior" onClick={() => changeMonth(-1)} className={`p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors ${FOCUS}`}><ChevronLeft size={20} /></button>
            <div aria-live="polite" className="w-40 text-center font-bold text-white text-sm">{formatMonth(openMonth)}</div>
            <button aria-label="Mes siguiente" onClick={() => changeMonth(1)} className={`p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors ${FOCUS}`}><ChevronRight size={20} /></button>
          </div>
        </div>

        {hasLoaded && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <p className="text-xl sm:text-2xl font-bold text-white">
                {monthClients.length === 0
                  ? 'Ningún cliente este mes'
                  : unpaidCount === 0
                    ? `Han pagado los ${monthClients.length} clientes`
                    : <>Faltan <span className="text-[#E31C25]">{unpaidCount}</span> de {monthClients.length} clientes por pagar</>}
              </p>
              <p className="text-sm text-gray-400 tabular-nums">
                Facturado en {formatMonth(openMonth).split(' ')[0].toLowerCase()}: <span className="text-white font-bold">{formatEuros(billedThisMonth)}</span>
              </p>
            </div>
            {monthClients.length > 0 && (
              <div className="flex h-2 rounded-full overflow-hidden bg-[#1a1a1a] gap-px" aria-hidden="true">
                {(['paid', 'pending', 'overdue', 'frozen'] as ClientStatus[]).map((key) => (
                  <div key={key} className={`${STATUS[key].bar} transition-[width] duration-500 ease-out motion-reduce:transition-none`} style={{ width: `${(counts[key] / monthClients.length) * 100}%` }} />
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {loadError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm text-red-200">
          <span className="flex gap-2"><AlertTriangle size={18} className="shrink-0" />No se han podido cargar los datos: {loadError}</span>
          <button onClick={fetchData} className={`font-bold underline underline-offset-4 hover:text-white ${FOCUS}`}>Reintentar</button>
        </div>
      )}

      {/* Clientes o facturas */}
      <div className="flex gap-1 border-b border-[#2a2a2a]" role="tablist">
        {([['clients', 'Clientes'], ['invoices', `Facturas emitidas${hasLoaded ? ` (${issuedInvoices.length})` : ''}`]] as const).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={view === key}
            onClick={() => setView(key)}
            className={`px-4 py-2.5 -mb-px text-sm font-bold border-b-2 transition-colors ${FOCUS} ${view === key ? 'border-[#E31C25] text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'clients' && (
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
              <input
                type="search"
                aria-label="Buscar cliente"
                placeholder="Buscar cliente"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] pl-10 pr-4 py-2.5 rounded-xl text-sm text-white outline-none focus:border-[#E31C25] transition-colors"
              />
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por estado">
              <FilterChip label="Todos" count={monthClients.length} active={filter === 'all'} onClick={() => setFilter('all')} />
              {availableFilters.map((key) => (
                <FilterChip key={key} label={STATUS[key].label} count={counts[key]} active={filter === key} onClick={() => setFilter(key)} />
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><i className="w-5 h-2.5 rounded-sm bg-emerald-500" />Pagado (unido: una sola factura)</span>
            <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm border border-red-500/40" />Atrasado</span>
            <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-[#121212] border border-[#3f3f46]" />Sin pagar</span>
            <span>Pulsa un mes para cobrarlo o ver su factura.</span>
          </div>

          <div className={`bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl divide-y divide-[#2a2a2a] transition-opacity duration-200 ${isLoading && hasLoaded ? 'opacity-60' : ''}`}>
            {!hasLoaded && isLoading && Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="p-4 flex items-center gap-4 animate-pulse motion-reduce:animate-none" aria-hidden="true">
                <div className="h-4 w-40 bg-white/5 rounded" />
                <div className="h-8 flex-1 bg-white/5 rounded" />
                <div className="h-8 w-24 bg-white/5 rounded hidden sm:block" />
              </div>
            ))}

            {hasLoaded && visibleClients.length === 0 && (
              <div className="p-10 text-center">
                <p className="text-gray-400">{searchQuery ? `Ningún cliente coincide con "${searchQuery}".` : 'Ningún cliente en este estado.'}</p>
                <button onClick={() => { setSearchQuery(''); setFilter('all'); }} className={`mt-2 text-sm font-bold text-white underline underline-offset-4 ${FOCUS}`}>Ver todos los clientes</button>
              </div>
            )}

            {visibleClients.map((client) => {
              const status = client.status as ClientStatus;
              const paidMonth = paidByUser[client.id]?.[openMonth];
              const name = `${client.first_name} ${client.last_name}`;
              return (
                <div key={client.id} className="p-4 grid gap-x-5 gap-y-3 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)_auto] items-center hover:bg-white/[0.02] transition-colors">
                  <div className="min-w-0">
                    <p className="font-bold text-white truncate" title={name}>{name}</p>
                    {editingFeesId === client.id ? (
                      <form
                        className="mt-1.5 flex flex-wrap items-center gap-2"
                        onSubmit={(e) => { e.preventDefault(); saveFees(client.id); }}
                      >
                        <label className="text-xs text-gray-500 flex items-center gap-1">Cuota
                          <input type="number" inputMode="decimal" autoFocus value={tempBaseFee} onChange={(e) => setTempBaseFee(e.target.value)} className="w-16 bg-black border border-[#3f3f46] rounded px-1.5 py-1 text-xs text-white outline-none focus:border-[#E31C25]" />
                        </label>
                        <label className="text-xs text-gray-500 flex items-center gap-1">Nutrición
                          <input type="number" inputMode="decimal" value={tempNutriFee} onChange={(e) => setTempNutriFee(e.target.value)} className="w-16 bg-black border border-[#3f3f46] rounded px-1.5 py-1 text-xs text-white outline-none focus:border-[#E31C25]" />
                        </label>
                        <button type="submit" aria-label="Guardar tarifa" className={`p-1 rounded text-emerald-400 hover:bg-emerald-500/20 ${FOCUS}`}><Check size={16} /></button>
                        <button type="button" aria-label="Cancelar" onClick={() => setEditingFeesId(null)} className={`p-1 rounded text-gray-400 hover:bg-white/10 ${FOCUS}`}><X size={16} /></button>
                      </form>
                    ) : (
                      <p className="text-xs text-gray-500 flex items-center gap-1.5 tabular-nums">
                        <span className="truncate">{formatEuros(client.fee || DEFAULT_FEE)}{client.nutrition_fee > 0 && ` + ${formatEuros(client.nutrition_fee)} nutrición`}</span>
                        {isAdmin && (
                          <button aria-label={`Cambiar la tarifa de ${name}`} title="Cambiar tarifa" onClick={() => startFeeEdit(client)} className={`p-0.5 rounded text-gray-600 hover:text-white transition-colors shrink-0 ${FOCUS}`}><Pencil size={12} /></button>
                        )}
                      </p>
                    )}
                  </div>

                  <div className="min-w-0">
                    <MonthRibbon
                      clientName={name}
                      months={ribbonMonths}
                      paid={paidByUser[client.id] ?? {}}
                      openMonth={openMonth}
                      thisMonth={thisMonth}
                      joinMonth={joinMonthOf(client)}
                      onOpenInvoice={setOpenInvoiceId}
                      onCharge={(month) => setCharging({ client, month })}
                    />
                  </div>

                  <div className="flex items-center justify-between lg:justify-end gap-2 lg:w-[264px]">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold border whitespace-nowrap ${STATUS[status].badge}`}>{STATUS[status].label}</span>
                    {paidMonth ? (
                      <button onClick={() => setOpenInvoiceId(paidMonth.invoice_id)} className={`w-[136px] px-3 py-2 rounded-lg border border-[#3f3f46] text-xs font-bold text-gray-200 hover:border-gray-400 hover:text-white transition-colors whitespace-nowrap truncate ${FOCUS}`}>
                        {invoiceReference({ id: paidMonth.invoice_id, invoice_number: paidMonth.invoice_number })}
                      </button>
                    ) : confirmUnfreezeId === client.id ? (
                      <div className="w-[136px] flex gap-1">
                        <button onClick={() => unfreeze(client)} className={`flex-1 py-2 rounded-lg bg-white text-zinc-900 text-xs font-bold hover:bg-gray-200 transition-colors ${FOCUS}`}>Reactivar</button>
                        <button aria-label="Cancelar" onClick={() => setConfirmUnfreezeId(null)} className={`px-2 rounded-lg text-gray-400 hover:bg-white/10 ${FOCUS}`}><X size={14} /></button>
                      </div>
                    ) : (
                      <div className="w-[136px] flex gap-1">
                        <button onClick={() => setCharging({ client, month: openMonth })} className={`flex-1 py-2 rounded-lg bg-[#E31C25] text-white text-xs font-bold hover:bg-[#c4161e] transition-colors ${FOCUS}`}>Cobrar</button>
                        {status === 'frozen' && (
                          <button aria-label={`Reactivar la cuenta de ${name} sin cobrar`} title="Reactivar la cuenta sin cobrar ni emitir factura" onClick={() => setConfirmUnfreezeId(client.id)} className={`px-2.5 rounded-lg border border-[#3f3f46] text-gray-300 hover:text-white hover:border-gray-400 transition-colors ${FOCUS}`}><Unlock size={14} /></button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === 'invoices' && (
        <div className={`bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl divide-y divide-[#2a2a2a] transition-opacity duration-200 ${isLoading ? 'opacity-60' : ''}`}>
          {issuedInvoices.length === 0 && (
            <p className="p-10 text-center text-gray-400">{isLoading ? 'Cargando facturas…' : `No se ha emitido ninguna factura en ${formatMonth(openMonth)}.`}</p>
          )}
          {issuedInvoices.map((invoice) => {
            const status = STATUS_STYLES[invoice.status] ?? { label: invoice.status, className: 'bg-gray-800 text-gray-400' };
            return (
              <div key={invoice.id} className="flex items-center gap-2 pr-3 hover:bg-white/[0.02] transition-colors">
                <button onClick={() => setOpenInvoiceId(invoice.id)} className={`flex-1 min-w-0 p-4 text-left grid gap-x-4 gap-y-1 grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)_100px_110px] items-center rounded-l-2xl ${FOCUS}`}>
                  <span className={`font-bold text-sm ${invoice.status === 'anulada' ? 'text-gray-500 line-through' : 'text-white'}`}>{invoiceReference(invoice)}</span>
                  <span className="text-sm text-gray-300 truncate order-3 sm:order-none">{invoice.client_name || '-'}</span>
                  <span className="text-xs text-gray-500 truncate order-4 sm:order-none">
                    {invoice.status === 'rectificativa' ? `Rectifica ${invoice.rectified_number}` : formatMonths(invoice.period_months ?? [])}
                  </span>
                  <span className={`text-sm text-right tabular-nums order-2 sm:order-none ${invoice.status === 'anulada' ? 'text-gray-500 line-through' : 'text-white'}`}>{formatEuros(invoice.amount)}</span>
                  <span className={`justify-self-end px-2.5 py-0.5 rounded-full text-xs font-bold order-5 sm:order-none ${status.className}`}>{status.label}</span>
                </button>
                <button aria-label={`Descargar ${invoiceReference(invoice)}`} title="Descargar PDF" onClick={() => downloadFromList(invoice)} className={`p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors shrink-0 ${FOCUS}`}><Download size={16} /></button>
              </div>
            );
          })}
        </div>
      )}

      {charging && (
        <ChargeDialog
          client={charging.client}
          initialMonth={charging.month}
          onClose={() => setCharging(null)}
          onIssued={handleIssued}
        />
      )}

      {openInvoiceId && (
        <InvoiceDrawer
          invoiceId={openInvoiceId}
          onClose={() => setOpenInvoiceId(null)}
          onVoided={handleVoided}
          onOpenInvoice={setOpenInvoiceId}
        />
      )}

      {toast && (
        <div role="status" className="fixed bottom-4 left-4 right-4 sm:left-auto sm:max-w-md z-[300] bg-[#121212] border border-[#3f3f46] rounded-xl shadow-2xl p-4 flex items-start gap-3 motion-safe:animate-in motion-safe:slide-in-from-bottom-4 motion-safe:fade-in duration-300">
          {toast.kind === 'success'
            ? <CheckCircle size={18} className="text-emerald-400 shrink-0 mt-0.5" />
            : <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />}
          <div className="min-w-0 flex-1">
            <p className="text-sm text-white">{toast.message}</p>
            {toast.invoice && (
              <button onClick={() => downloadFromList(toast.invoice)} className={`mt-1 text-sm font-bold text-gray-300 hover:text-white underline underline-offset-4 ${FOCUS}`}>Descargar PDF</button>
            )}
          </div>
          <button aria-label="Cerrar aviso" onClick={() => setToast(null)} className={`text-gray-500 hover:text-white rounded ${FOCUS}`}><X size={16} /></button>
        </div>
      )}

      {isLoading && hasLoaded && <Loader2 aria-label="Actualizando" className="fixed top-4 right-4 animate-spin text-[#E31C25] z-[100]" size={18} />}
    </div>
  );
}

function FilterChip({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors whitespace-nowrap ${FOCUS} ${
        active ? 'bg-white text-zinc-900 border-white' : 'bg-transparent text-gray-400 border-[#2a2a2a] hover:text-white hover:border-gray-500'
      }`}
    >
      {label} <span className={`tabular-nums ${active ? 'text-zinc-500' : 'text-gray-500'}`}>{count}</span>
    </button>
  );
}
