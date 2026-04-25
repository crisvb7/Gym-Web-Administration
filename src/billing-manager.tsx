import React, { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, CheckCircle, XCircle, Search, Loader2, Receipt, FileText, Settings, Check, X, Plus, Trash2, Lock } from "lucide-react";
import { supabase } from "./lib/supabase";
import { pdf } from '@react-pdf/renderer';
import { InvoicePDF } from '../components/InvoicePDF';

export function BillingManager() {
  const [clients, setClients] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Seguridad y Edición Fija
  const [isAdmin, setIsAdmin] = useState(false);
  const [editingFeesId, setEditingFeesId] = useState<string | null>(null);
  const [tempBaseFee, setTempBaseFee] = useState<string>('');
  const [tempNutriFee, setTempNutriFee] = useState<string>('');
  
  // Estados para el Modal Dinámico
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [clientToBill, setClientToBill] = useState<any>(null);
  const [currentInvoiceItems, setCurrentInvoiceItems] = useState<{desc: string, amount: string, isFixed: boolean}[]>([]);
  
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const DEFAULT_FEE = 50.00; 

  const fetchData = async () => {
    setLoading(true);
    
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
      setIsAdmin(profile?.role === 'admin');
    }
    
    const { data: clientsData } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, fee, nutrition_fee')
      .eq('role', 'client')
      .order('first_name', { ascending: true });
    if (clientsData) setClients(clientsData);
    
    const monthStr = currentMonth.toISOString().split('T')[0]; 
    const { data: invoicesData } = await supabase.from('invoices').select('*').eq('due_date', monthStr);
    if (invoicesData) setInvoices(invoicesData);
    
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [currentMonth]);

  const handlePrevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));

  // --- CONFIGURACIÓN FIJA DE TARIFAS (Solo Admin) ---
  const openFeeConfig = (client: any) => {
    setEditingFeesId(client.id);
    setTempBaseFee((client.fee || DEFAULT_FEE).toString());
    setTempNutriFee((client.nutrition_fee || 0).toString());
  };

  const saveFeeConfig = async (clientId: string) => {
    const base = parseFloat(tempBaseFee) || 0;
    const nutri = parseFloat(tempNutriFee) || 0;

    const { error } = await supabase.from('profiles').update({ fee: base, nutrition_fee: nutri }).eq('id', clientId);

    if (!error) {
      setClients(clients.map(c => c.id === clientId ? { ...c, fee: base, nutrition_fee: nutri } : c));
      setEditingFeesId(null);
    } else {
      alert("Error al guardar la configuración.");
    }
  };

  // --- MODAL DE FACTURACIÓN DINÁMICA ---
  const openBillingModal = (client: any) => {
    setClientToBill(client);
    
    const initialItems = [];
    initialItems.push({ desc: 'Cuota Mensual', amount: (client.fee || DEFAULT_FEE).toString(), isFixed: true });
    
    if (client.nutrition_fee && client.nutrition_fee > 0) {
      initialItems.push({ desc: 'Servicio de Nutrición', amount: client.nutrition_fee.toString(), isFixed: true });
    }

    setCurrentInvoiceItems(initialItems);
    setIsModalOpen(true);
  };

  const addExtraItem = () => {
    setCurrentInvoiceItems([...currentInvoiceItems, { desc: '', amount: '0', isFixed: false }]);
  };

  const removeInvoiceItem = (index: number) => {
    setCurrentInvoiceItems(currentInvoiceItems.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: 'desc' | 'amount', value: string) => {
    const newItems = [...currentInvoiceItems];
    newItems[index][field] = value;
    setCurrentInvoiceItems(newItems);
  };

  // Cálculos de Total e IVA
  const calculateTotal = () => currentInvoiceItems.reduce((acc, item) => acc + (parseFloat(item.amount) || 0), 0);
  const totalAmount = calculateTotal();
  const baseAmount = totalAmount / 1.21;
  const ivaAmount = totalAmount - baseAmount;

  const confirmPayment = async () => {
    if (currentInvoiceItems.some(i => i.desc.trim() === '')) {
      alert("Todos los conceptos extra deben tener un nombre.");
      return;
    }

    setIsProcessingPdf(true);
    const monthStr = currentMonth.toISOString().split('T')[0];
    const combinedDesc = currentInvoiceItems.map(i => i.desc).join(' + ');

    try {
      const { data: insertedData, error: insertError } = await supabase.from('invoices').insert([{
        user_id: clientToBill.id,
        amount: totalAmount,
        description: combinedDesc,
        status: 'pagada',
        due_date: monthStr,
        payment_date: new Date().toISOString()
      }]).select();

      if (insertError || !insertedData) throw insertError;
      const newInvoice = insertedData[0];

      const monthLabel = currentMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
      const capitalizedMonthLabel = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

      const pdfBlob = await pdf(
        <InvoicePDF client={clientToBill} invoice={newInvoice} monthLabel={capitalizedMonthLabel} items={currentInvoiceItems} />
      ).toBlob();

      const filePath = `${clientToBill.id}/${newInvoice.id}.pdf`;
      await supabase.storage.from('invoices').upload(filePath, pdfBlob, { contentType: 'application/pdf', upsert: true });

      const { data: urlData } = supabase.storage.from('invoices').getPublicUrl(filePath);
      await supabase.from('invoices').update({ pdf_url: urlData.publicUrl }).eq('id', newInvoice.id);
      
      setIsModalOpen(false);
      fetchData();
    } catch (err) {
      console.error(err);
      alert("Error al generar la factura.");
    } finally {
      setIsProcessingPdf(false);
    }
  };

  // --- OTRAS FUNCIONES ---
  const handlePrintInvoice = (invoice: any) => invoice.pdf_url && window.open(invoice.pdf_url, '_blank');
  const deleteInvoice = async (invoice: any) => {
    if(confirm("¿Anular pago y borrar factura?")) {
      await supabase.from('invoices').delete().eq('id', invoice.id);
      fetchData();
    }
  };

  const displayData = clients.filter(c => `${c.first_name} ${c.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()))
    .map(c => ({ ...c, invoice: invoices.find(inv => inv.user_id === c.id) }));

  const capitalizedMonthLabel = currentMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase());

  return (
    <div className="space-y-6">
      
      {/* MODAL EDITOR DE FACTURA */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-[#2a2a2a] flex justify-between items-center bg-[#121212]">
              <h2 className="text-xl font-bold text-white">Facturar a: {clientToBill.first_name}</h2>
              <button onClick={() => setIsModalOpen(false)}><X size={20} className="text-gray-500 hover:text-white"/></button>
            </div>
            
            <div className="p-6 space-y-4 max-h-[50vh] overflow-y-auto">
              <p className="text-xs text-gray-400 uppercase font-bold tracking-widest mb-2">Conceptos de la factura</p>
              
              {currentInvoiceItems.map((item, index) => (
                <div key={index} className="flex gap-2 items-center animate-in slide-in-from-top-2">
                  {item.isFixed ? (
                    <>
                      <div className="flex-1 bg-[#121212] border border-[#2a2a2a] rounded-xl p-3 flex items-center gap-2 cursor-not-allowed">
                        <Lock size={14} className="text-gray-600" />
                        <span className="text-sm text-gray-500 font-medium select-none">{item.desc}</span>
                      </div>
                      <div className="w-32 bg-[#121212] border border-[#2a2a2a] rounded-xl p-3 text-right cursor-not-allowed">
                        <span className="text-sm text-gray-500 font-medium select-none">{Number(item.amount).toFixed(2)} €</span>
                      </div>
                      <div className="w-[40px]"></div>
                    </>
                  ) : (
                    <>
                      <input 
                        type="text" 
                        placeholder="Nombre del concepto extra" 
                        className="flex-1 bg-black border border-[#3f3f46] rounded-xl p-3 text-sm text-white outline-none focus:border-[#E31C25] transition-colors"
                        value={item.desc}
                        onChange={(e) => updateItem(index, 'desc', e.target.value)}
                      />
                      <input 
                        type="number" 
                        placeholder="0.00" 
                        className="w-32 bg-black border border-[#3f3f46] rounded-xl p-3 text-sm text-white text-right outline-none focus:border-[#E31C25] transition-colors"
                        value={item.amount}
                        onChange={(e) => updateItem(index, 'amount', e.target.value)}
                      />
                      <button onClick={() => removeInvoiceItem(index)} className="p-3 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-colors">
                        <Trash2 size={18}/>
                      </button>
                    </>
                  )}
                </div>
              ))}
              
              <button onClick={addExtraItem} className="w-full mt-4 py-4 border-2 border-dashed border-[#2a2a2a] rounded-xl text-gray-500 hover:text-white hover:border-gray-500 transition-all flex items-center justify-center gap-2 text-sm font-bold bg-white/5">
                <Plus size={16}/> AÑADIR CONCEPTO EXTRA
              </button>
            </div>

            {/* SECCIÓN DE TOTALES CON IVA */}
            <div className="p-6 bg-[#121212] border-t border-[#2a2a2a] flex justify-between items-center">
              <div>
                <div className="flex gap-4 mb-1">
                  <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Base: <span className="text-gray-300">{baseAmount.toFixed(2)}€</span></p>
                  <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">IVA (21%): <span className="text-gray-300">{ivaAmount.toFixed(2)}€</span></p>
                </div>
                <p className="text-xs text-gray-400 uppercase font-bold mb-1 mt-2">Total Factura</p>
                <p className="text-3xl font-black text-[#E31C25]">{totalAmount.toFixed(2)} €</p>
              </div>
              <button 
                onClick={confirmPayment} 
                disabled={isProcessingPdf}
                className="bg-[#E31C25] text-white px-8 py-3 rounded-2xl font-bold hover:bg-[#A6151B] transition-all flex items-center gap-2 shadow-lg disabled:opacity-50"
              >
                {isProcessingPdf ? <Loader2 className="animate-spin" size={18}/> : <CheckCircle size={18}/>}
                CONFIRMAR FACTURA
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VISTA PRINCIPAL */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Facturación</h1>
          <p className="text-gray-400 mt-1">Configuración de tarifas y emisión de recibos.</p>
        </div>
        <div className="flex items-center gap-4 bg-[#1a1a1a] p-2 rounded-2xl border border-[#2a2a2a]">
          <button onClick={handlePrevMonth} className="p-2 text-gray-400 hover:text-white"><ChevronLeft size={24} /></button>
          <div className="w-40 text-center font-bold text-white uppercase tracking-wider">{capitalizedMonthLabel}</div>
          <button onClick={handleNextMonth} className="p-2 text-gray-400 hover:text-white"><ChevronRight size={24} /></button>
        </div>
      </div>

      <div className="relative w-full">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
        <input 
          type="text" 
          placeholder="Buscar atleta..." 
          className="w-full bg-[#1a1a1a] border border-[#2a2a2a] pl-12 pr-4 py-4 rounded-2xl text-white outline-none focus:border-[#E31C25] transition-colors"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-[#121212] border-b border-[#2a2a2a] text-gray-400 text-xs uppercase font-bold">
            <tr>
              <th className="p-4 pl-6">Atleta</th>
              <th className="p-4">Tarifas Fijas</th>
              <th className="p-4 text-center">Estado Mes</th>
              <th className="p-4 text-right pr-6">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2a2a2a]">
            {displayData.map((data) => (
              <tr key={data.id} className="hover:bg-white/5 transition-colors">
                
                <td className="p-4 pl-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#121212] border border-[#2a2a2a] flex items-center justify-center font-bold text-[#E31C25] shrink-0">
                      {data.first_name[0]}
                    </div>
                    <span className="font-bold text-white block">{data.first_name} {data.last_name}</span>
                  </div>
                </td>
                
                <td className="p-4">
                  {editingFeesId === data.id ? (
                    <div className="flex items-center gap-3 bg-[#121212] p-2 rounded-xl border border-[#3f3f46] w-fit">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-500 w-12 uppercase font-bold">Cuota:</span>
                          <input type="number" className="w-16 bg-black border border-[#2a2a2a] rounded px-2 py-1 text-white text-xs outline-none focus:border-[#E31C25]" value={tempBaseFee} onChange={(e) => setTempBaseFee(e.target.value)} />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-500 w-12 uppercase font-bold">Nutri:</span>
                          <input type="number" className="w-16 bg-black border border-[#2a2a2a] rounded px-2 py-1 text-white text-xs outline-none focus:border-[#E31C25]" value={tempNutriFee} onChange={(e) => setTempNutriFee(e.target.value)} />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 border-l border-[#2a2a2a] pl-3">
                        <button onClick={() => saveFeeConfig(data.id)} className="p-1 bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500 hover:text-white rounded transition-colors"><Check size={14} /></button>
                        <button onClick={() => setEditingFeesId(null)} className="p-1 bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white rounded transition-colors"><X size={14} /></button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-4 group/fees">
                      <div className="text-xs text-gray-400">
                        <p><strong className="text-gray-300">{data.fee || DEFAULT_FEE}€</strong> <span className="text-[10px]">BASE</span></p>
                        {data.nutrition_fee > 0 && <p><strong className="text-gray-300">{data.nutrition_fee}€</strong> <span className="text-[10px]">NUTRI</span></p>}
                      </div>
                      {isAdmin && (
                        <button 
                          onClick={() => openFeeConfig(data)} 
                          className="p-1.5 bg-[#2a2a2a] text-gray-400 hover:text-white rounded-lg opacity-0 group-hover/fees:opacity-100 transition-all flex items-center gap-1 text-[10px] font-bold"
                        >
                          <Settings size={12} /> CONFIGURAR
                        </button>
                      )}
                    </div>
                  )}
                </td>

                <td className="p-4 text-center">
                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${data.invoice ? 'bg-emerald-500/10 text-emerald-500' : 'bg-gray-800 text-gray-400'}`}>
                    {data.invoice ? 'PAGADO' : 'PENDIENTE'}
                  </span>
                </td>

                <td className="p-4 text-right pr-6">
                  <div className="flex justify-end gap-2">
                    {data.invoice ? (
                      <>
                        <button onClick={() => handlePrintInvoice(data.invoice)} className="p-2 bg-[#2a2a2a] text-gray-400 hover:text-white rounded-xl"><FileText size={18}/></button>
                        <button onClick={() => deleteInvoice(data.invoice)} className="px-4 py-2 bg-[#121212] text-red-500 border border-[#2a2a2a] rounded-xl text-xs font-bold hover:bg-red-500/10">ANULAR</button>
                      </>
                    ) : (
                      <button onClick={() => openBillingModal(data)} className="px-6 py-2 bg-[#E31C25] text-white rounded-xl text-xs font-bold hover:bg-[#A6151B] transition-all shadow-lg">MARCAR PAGADO</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}