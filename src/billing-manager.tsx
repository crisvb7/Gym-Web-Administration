import React, { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, CheckCircle, XCircle, Search, Loader2, Receipt } from "lucide-react";
import { supabase } from "./lib/supabase";

export function BillingManager() {
  const [clients, setClients] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Establecemos el mes actual (Día 1 para tener un ancla limpia)
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  // --- CONFIGURACIÓN DE PRECIO BASE ---
  // He puesto 50€ por defecto. Si cada cliente paga distinto, avísame y lo sacamos de la base de datos.
  const DEFAULT_FEE = 50.00; 

  const fetchData = async () => {
    setLoading(true);

    // 1. Traemos a TODOS los clientes
    const { data: clientsData } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .eq('role', 'client')
      .order('first_name', { ascending: true });
      
    if (clientsData) setClients(clientsData);

    // 2. Traemos SOLO las facturas del mes seleccionado
    // Usamos el 'due_date' (día 1 del mes) como ancla para saber de qué mes es la cuota
    const monthStr = currentMonth.toISOString().split('T')[0]; 
    const { data: invoicesData } = await supabase
      .from('invoices')
      .select('*')
      .eq('due_date', monthStr)
      .eq('description', 'Cuota Mensual');

    if (invoicesData) setInvoices(invoicesData);
    
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [currentMonth]); // Se vuelve a ejecutar cada vez que cambiamos de mes

  // --- NAVEGACIÓN DE MESES ---
  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  // --- LÓGICA DEL BOTÓN MÁGICO ---
  const togglePayment = async (clientId: string, existingInvoice: any) => {
    const monthStr = currentMonth.toISOString().split('T')[0];

    // Actualización optimista de la UI (para que sea instantáneo al clic)
    if (existingInvoice) {
      setInvoices(invoices.filter(inv => inv.id !== existingInvoice.id));
    } else {
      // Creamos una factura temporal en memoria mientras carga
      const tempInvoice = { id: 'temp', user_id: clientId, due_date: monthStr, status: 'paid' };
      setInvoices([...invoices, tempInvoice]);
    }

    if (existingInvoice) {
      // Si ya estaba pagado, DESMARCAMOS (Eliminamos la factura para que el cliente no la vea)
      await supabase.from('invoices').delete().eq('id', existingInvoice.id);
    } else {
      // Si no estaba pagado, MARCAMOS (Creamos la factura simplificada)
      const monthName = currentMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
      const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
      
      await supabase.from('invoices').insert([{
        user_id: clientId,
        amount: DEFAULT_FEE,
        description: 'Cuota Mensual', // Fijo para poder filtrarlo bien
        status: 'paid',
        due_date: monthStr, // El día 1 del mes como ancla
        payment_date: new Date().toISOString()
      }]);
    }
    
    // Recargamos la base de datos real por detrás para asegurar consistencia
    fetchData();
  };

  // Combinamos clientes con sus facturas de este mes y filtramos por búsqueda
  const displayData = clients.filter(client => 
    `${client.first_name} ${client.last_name}`.toLowerCase().includes(searchQuery.toLowerCase())
  ).map(client => {
    const invoice = invoices.find(inv => inv.user_id === client.id);
    return { ...client, invoice };
  });

  const monthLabel = currentMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  const capitalizedMonthLabel = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  // Estadísticas rápidas
  const totalPaid = displayData.filter(d => d.invoice).length;
  const expectedRevenue = clients.length * DEFAULT_FEE;
  const currentRevenue = totalPaid * DEFAULT_FEE;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Cabecera y Selector de Mes */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Facturación Mensual</h1>
          <p className="text-gray-400 mt-1">Generación automática de recibos por meses.</p>
        </div>

        <div className="flex items-center gap-4 bg-[#1a1a1a] p-2 rounded-2xl border border-[#2a2a2a]">
          <button onClick={handlePrevMonth} className="p-2 hover:bg-[#2a2a2a] rounded-xl text-gray-400 hover:text-white transition-colors">
            <ChevronLeft size={24} />
          </button>
          <div className="w-40 text-center font-bold text-white text-lg flex items-center justify-center gap-2">
            <CalendarIcon size={18} className="text-[#E31C25]" />
            {capitalizedMonthLabel}
          </div>
          <button onClick={handleNextMonth} className="p-2 hover:bg-[#2a2a2a] rounded-xl text-gray-400 hover:text-white transition-colors">
            <ChevronRight size={24} />
          </button>
        </div>
      </div>

      {/* Tarjetas de Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] p-5 rounded-2xl">
          <p className="text-gray-400 text-sm font-bold uppercase tracking-wider mb-1">Total Clientes</p>
          <p className="text-3xl font-black text-white">{clients.length}</p>
        </div>
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] p-5 rounded-2xl">
          <p className="text-gray-400 text-sm font-bold uppercase tracking-wider mb-1">Cuotas Cobradas</p>
          <p className="text-3xl font-black text-emerald-500">{totalPaid} <span className="text-lg text-gray-500">/ {clients.length}</span></p>
        </div>
        <div className="bg-[#1a1a1a] border border-emerald-500/20 p-5 rounded-2xl shadow-[0_0_15px_rgba(16,185,129,0.05)]">
          <p className="text-emerald-500/80 text-sm font-bold uppercase tracking-wider mb-1">Ingresos del Mes</p>
          <p className="text-3xl font-black text-white">{currentRevenue}€ <span className="text-lg text-gray-500 font-normal">de {expectedRevenue}€</span></p>
        </div>
      </div>

      {/* Buscador */}
      <div className="relative w-full">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
        <input 
          type="text" 
          placeholder="Buscar atleta por nombre..." 
          className="w-full bg-[#1a1a1a] border border-[#2a2a2a] pl-12 pr-4 py-4 rounded-2xl text-white focus:border-[#E31C25] outline-none transition-colors shadow-lg"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Lista de Clientes */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center flex flex-col items-center justify-center text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin text-[#E31C25] mb-4" />
            <p>Cargando estado de cuotas...</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-[#121212] border-b border-[#2a2a2a] text-gray-400 text-xs uppercase font-bold tracking-wider">
              <tr>
                <th className="p-4 pl-6">Atleta</th>
                <th className="p-4 text-center">Estado del Mes</th>
                <th className="p-4 text-right pr-6">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a2a2a]">
              {displayData.map((data) => {
                const isPaid = !!data.invoice;
                
                return (
                  <tr key={data.id} className="hover:bg-white/5 transition-colors group">
                    <td className="p-4 pl-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#121212] border border-[#2a2a2a] flex items-center justify-center font-bold text-[#E31C25]">
                          {data.first_name[0]}
                        </div>
                        <div>
                          <span className="font-bold text-white block">{data.first_name} {data.last_name}</span>
                          <span className="text-xs text-gray-500 mt-0.5 block flex items-center gap-1">
                            <Receipt size={12} /> {DEFAULT_FEE}€ / mes
                          </span>
                        </div>
                      </div>
                    </td>
                    
                    <td className="p-4 text-center">
                      <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase ${
                        isPaid 
                          ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
                          : 'bg-[#2a2a2a] text-gray-400 border border-[#3f3f46]'
                      }`}>
                        {isPaid ? <CheckCircle size={14} /> : <XCircle size={14} />}
                        {isPaid ? 'Pagado' : 'Sin Pagar'}
                      </div>
                    </td>

                    <td className="p-4 text-right pr-6">
                      <button 
                        onClick={() => togglePayment(data.id, data.invoice)}
                        className={`px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-lg active:scale-95 ${
                          isPaid 
                            ? 'bg-[#121212] text-red-500 hover:bg-red-500/10 border border-[#2a2a2a] hover:border-red-500/30' 
                            : 'bg-[#E31C25] text-white hover:bg-[#A6151B] shadow-[0_0_15px_rgba(227,28,37,0.3)]'
                        }`}
                      >
                        {isPaid ? 'Anular Pago' : 'Marcar Pagado'}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {displayData.length === 0 && (
                <tr><td colSpan={3} className="p-8 text-center text-gray-500">No se encontraron clientes.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// Icono extra
function CalendarIcon(props: any) {
  return <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
}