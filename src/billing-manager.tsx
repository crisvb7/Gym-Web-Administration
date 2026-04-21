import React, { useState, useEffect } from "react";
import { Plus, Search, Filter, CheckCircle, Clock, DollarSign, X, Loader2, Trash2 } from "lucide-react";
import { supabase } from "./lib/supabase";

export function BillingManager() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos'); // 'Todos', 'pending', 'paid'

  // Modal de Crear Cobro
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newInvoice, setNewInvoice] = useState({
    user_id: '',
    amount: '',
    description: 'Cuota Mensual',
    due_date: new Date().toISOString().split('T')[0]
  });

  const fetchData = async () => {
    setLoading(true);
    // Traemos las facturas y el nombre del cliente cruzando las tablas
    const { data: invoicesData, error } = await supabase
      .from('invoices')
      .select(`*, profiles:user_id (first_name, last_name)`)
      .order('due_date', { ascending: false });

    if (invoicesData) setInvoices(invoicesData);

    // Traemos los clientes para el desplegable
    const { data: clientsData } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .eq('role', 'client');
      
    if (clientsData) setClients(clientsData);
    
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filtrado
  const processedInvoices = invoices.filter(inv => {
    const matchesStatus = statusFilter === 'Todos' || inv.status === statusFilter;
    const clientName = `${inv.profiles?.first_name} ${inv.profiles?.last_name}`.toLowerCase();
    const matchesSearch = clientName.includes(searchQuery.toLowerCase()) || inv.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const { error } = await supabase.from('invoices').insert([{
      user_id: newInvoice.user_id,
      amount: parseFloat(newInvoice.amount),
      description: newInvoice.description,
      due_date: newInvoice.due_date,
      status: 'pending'
    }]);

    if (!error) {
      setIsModalOpen(false);
      setNewInvoice({ user_id: clients[0]?.id || '', amount: '', description: 'Cuota Mensual', due_date: new Date().toISOString().split('T')[0] });
      fetchData();
    } else {
      alert("Error al crear el cobro: " + error.message);
    }
    setIsSubmitting(false);
  };

  // MAGIA: Cambiar estado a Pagado o Pendiente
  const togglePaymentStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'pending' ? 'paid' : 'pending';
    const paymentDate = newStatus === 'paid' ? new Date().toISOString() : null;

    // Actualizamos la UI al instante para que se sienta súper rápido
    setInvoices(invoices.map(inv => inv.id === id ? { ...inv, status: newStatus, payment_date: paymentDate } : inv));

    // Actualizamos en Supabase en segundo plano
    await supabase.from('invoices').update({ status: newStatus, payment_date: paymentDate }).eq('id', id);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("¿Seguro que quieres borrar este registro?")) {
      await supabase.from('invoices').delete().eq('id', id);
      fetchData();
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Facturación</h1>
          <p className="text-gray-400 mt-1">Control manual de pagos y cuotas de atletas.</p>
        </div>
        <button 
          onClick={() => {
            setNewInvoice(prev => ({ ...prev, user_id: clients[0]?.id || '' }));
            setIsModalOpen(true);
          }} 
          className="bg-[#E31C25] text-white px-6 py-3 rounded-xl font-bold hover:bg-[#A6151B] transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(227,28,37,0.3)] shrink-0"
        >
          <Plus size={20} /> Nuevo Cobro
        </button>
      </div>

      {/* Barra de Búsqueda y Filtros */}
      <div className="flex flex-col sm:flex-row gap-4 bg-[#1a1a1a] p-4 rounded-2xl border border-[#2a2a2a] shadow-lg">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input 
            type="text" 
            placeholder="Buscar por atleta o concepto..." 
            className="w-full bg-[#121212] border border-[#2a2a2a] pl-10 pr-4 py-3 rounded-xl text-white focus:border-[#E31C25] outline-none transition-colors"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="relative w-full sm:w-48">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <select 
            className="w-full bg-[#121212] border border-[#2a2a2a] pl-10 pr-8 py-3 rounded-xl text-white focus:border-[#E31C25] outline-none appearance-none"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="Todos">Todos</option>
            <option value="pending">Pendientes</option>
            <option value="paid">Pagados</option>
          </select>
        </div>
      </div>

      {/* Tabla de Facturas */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl overflow-hidden shadow-xl">
        <table className="w-full text-left">
          <thead className="bg-[#121212] border-b border-[#2a2a2a] text-gray-400 text-xs uppercase font-bold tracking-wider">
            <tr>
              <th className="p-4">Atleta y Concepto</th>
              <th className="p-4 hidden sm:table-cell">Vencimiento</th>
              <th className="p-4">Importe</th>
              <th className="p-4 text-center">Estado</th>
              <th className="p-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2a2a2a]">
            {loading ? (
              <tr><td colSpan={5} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-[#E31C25]" /></td></tr>
            ) : processedInvoices.map((inv) => (
              <tr key={inv.id} className="hover:bg-white/5 transition-colors group">
                <td className="p-4">
                  <span className="font-bold text-white block">{inv.profiles?.first_name} {inv.profiles?.last_name}</span>
                  <span className="text-xs text-gray-400 mt-1 block">{inv.description}</span>
                </td>
                <td className="p-4 hidden sm:table-cell text-sm text-gray-300">
                  {new Date(inv.due_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                </td>
                <td className="p-4 font-bold text-white text-lg">
                  {inv.amount}€
                </td>
                <td className="p-4 text-center">
                  <button 
                    onClick={() => togglePaymentStatus(inv.id, inv.status)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all hover:scale-105 ${
                      inv.status === 'paid' 
                        ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/20' 
                        : 'bg-orange-500/10 text-orange-500 border border-orange-500/20 hover:bg-orange-500/20'
                    }`}
                  >
                    {inv.status === 'paid' ? <CheckCircle size={14} /> : <Clock size={14} />}
                    {inv.status === 'paid' ? 'Pagado' : 'Pendiente'}
                  </button>
                </td>
                <td className="p-4 text-right">
                  <button onClick={() => handleDelete(inv.id)} className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors" title="Eliminar">
                    <Trash2 size={18}/>
                  </button>
                </td>
              </tr>
            ))}
            {!loading && processedInvoices.length === 0 && (
              <tr><td colSpan={5} className="p-8 text-center text-gray-500">No se encontraron registros.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Crear Cobro */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[#121212] border border-[#2a2a2a] w-full max-w-md rounded-3xl p-8 relative shadow-2xl animate-in zoom-in-95 duration-200">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-6 right-6 text-gray-400 hover:text-white transition-colors">
              <X size={24} />
            </button>
            <h2 className="text-2xl font-bold mb-6 text-white flex items-center gap-2">
              <DollarSign className="text-[#E31C25]" /> Nuevo Cobro
            </h2>
            
            <form onSubmit={handleCreateInvoice} className="space-y-5">
              <div>
                <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Atleta</label>
                <select required className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" value={newInvoice.user_id} onChange={e => setNewInvoice({...newInvoice, user_id: e.target.value})}>
                  <option value="" disabled>Selecciona un cliente...</option>
                  {clients.map(client => (
                    <option key={client.id} value={client.id}>{client.first_name} {client.last_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Concepto</label>
                <input required type="text" className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" value={newInvoice.description} onChange={e => setNewInvoice({...newInvoice, description: e.target.value})} placeholder="Ej: Cuota Mayo" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Importe (€)</label>
                  <input required type="number" step="0.01" min="0" className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" value={newInvoice.amount} onChange={e => setNewInvoice({...newInvoice, amount: e.target.value})} placeholder="Ej: 49.99" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Fecha de Pago</label>
                  <input required type="date" className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none [color-scheme:dark]" value={newInvoice.due_date} onChange={e => setNewInvoice({...newInvoice, due_date: e.target.value})} />
                </div>
              </div>

              <button type="submit" disabled={isSubmitting} className="w-full bg-[#E31C25] text-white font-bold py-4 rounded-xl mt-6 hover:bg-[#A6151B] transition-colors flex items-center justify-center gap-2">
                {isSubmitting ? <Loader2 className="animate-spin w-5 h-5" /> : 'Añadir al registro'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}