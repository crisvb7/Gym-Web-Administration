import React, { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, CheckCircle, XCircle, Search, Loader2, Receipt, FileText, AlertCircle } from "lucide-react";
import { supabase } from "./lib/supabase";

export function BillingManager() {
  const [clients, setClients] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  // --- CONFIGURACIÓN DEL GIMNASIO ---
  const DEFAULT_FEE = 50.00; 
  const PAYMENT_DEADLINE_DAY = 5; // Día límite de pago de cada mes (ej: día 5)

  const fetchData = async () => {
    setLoading(true);

    const { data: clientsData } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .eq('role', 'client')
      .order('first_name', { ascending: true });
      
    if (clientsData) setClients(clientsData);

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
  }, [currentMonth]);

  const handlePrevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));

  const togglePayment = async (clientId: string, existingInvoice: any) => {
    const monthStr = currentMonth.toISOString().split('T')[0];

    if (existingInvoice) {
      setInvoices(invoices.filter(inv => inv.id !== existingInvoice.id));
      await supabase.from('invoices').delete().eq('id', existingInvoice.id);
    } else {
      const tempId = `temp-${Date.now()}`;
      const newInvoice = { 
        id: tempId, 
        user_id: clientId, 
        due_date: monthStr, 
        status: 'paid', 
        amount: DEFAULT_FEE, 
        description: 'Cuota Mensual',
        payment_date: new Date().toISOString()
      };
      setInvoices([...invoices, newInvoice]);

      await supabase.from('invoices').insert([{
        user_id: clientId,
        amount: DEFAULT_FEE,
        description: 'Cuota Mensual',
        status: 'paid',
        due_date: monthStr,
        payment_date: new Date().toISOString()
      }]);
      fetchData(); // Recargamos para obtener el ID real de Supabase
    }
  };

  // --- GENERADOR AUTOMÁTICO DE FACTURAS (PDF) ---
  const handlePrintInvoice = (client: any, invoice: any) => {
    const monthLabel = currentMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    const capitalizedMonth = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
    
    // Formateamos la fecha de pago
    const paymentDate = invoice.payment_date 
      ? new Date(invoice.payment_date).toLocaleDateString('es-ES') 
      : new Date().toLocaleDateString('es-ES');
    
    // Generamos un número de factura corto basado en el ID
    const invoiceNumber = invoice.id.split('-')[0].toUpperCase();

    // Creamos una ventana invisible para imprimir
    const printWindow = window.open('', '', 'width=800,height=600');
    if (!printWindow) return alert("Por favor, permite las ventanas emergentes para generar la factura.");

    const htmlContent = `
      <html>
        <head>
          <title>Factura_${client.first_name}_${capitalizedMonth.replace(' ', '_')}</title>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #1a1a1a; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #E31C25; padding-bottom: 20px; margin-bottom: 30px; }
            .brand h1 { color: #E31C25; margin: 0; font-size: 28px; text-transform: uppercase; }
            .brand p { margin: 4px 0 0 0; color: #666; font-size: 14px; }
            .company-details { text-align: right; color: #666; font-size: 14px; line-height: 1.5; }
            .invoice-info { display: flex; justify-content: space-between; margin-bottom: 40px; }
            .client-box { background: #f5f5f5; padding: 20px; border-radius: 8px; min-width: 250px; }
            .client-box h3 { margin: 0 0 10px 0; color: #333; }
            .client-box p { margin: 4px 0; color: #555; }
            .meta-box p { margin: 4px 0; text-align: right; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            th { background: #1a1a1a; color: white; text-align: left; padding: 12px; font-size: 14px; }
            td { padding: 12px; border-bottom: 1px solid #ddd; color: #333; }
            .total-row { font-weight: bold; font-size: 18px; }
            .total-amount { color: #E31C25; font-size: 24px; }
            .footer { margin-top: 50px; text-align: center; color: #888; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="brand">
              <h1>GYM APP</h1>
              <p>Factura Simplificada</p>
            </div>
            <div class="company-details">
              <strong>Centro Deportivo</strong><br>
              CIF/NIF: B12345678<br>
              Calle Principal 123, Oviedo<br>
              contacto@gymapp.com
            </div>
          </div>
          
          <div class="invoice-info">
            <div class="client-box">
              <h3>Datos del Cliente</h3>
              <p><strong>Nombre:</strong> ${client.first_name} ${client.last_name}</p>
            </div>
            <div class="meta-box">
              <p><strong>Nº Factura:</strong> FAC-${invoiceNumber}</p>
              <p><strong>Fecha de Emisión:</strong> ${paymentDate}</p>
              <p><strong>Estado:</strong> PAGADO</p>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Concepto</th>
                <th style="text-align: right;">Importe</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${invoice.description} - ${capitalizedMonth}</td>
                <td style="text-align: right;">${invoice.amount} €</td>
              </tr>
              <tr>
                <td style="text-align: right; border-bottom: none; padding-top: 20px;" class="total-row">TOTAL</td>
                <td style="text-align: right; border-bottom: none; padding-top: 20px;" class="total-row total-amount">${invoice.amount} €</td>
              </tr>
            </tbody>
          </table>

          <div class="footer">
            <p>Gracias por confiar en nosotros. Este documento es un justificante de pago válido.</p>
          </div>

          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            }
          </script>
        </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  // --- CÁLCULO DE DÍAS RESTANTES ---
  const getDaysStatus = () => {
    // Para asegurar precisión, usamos solo YYYY-MM-DD
    const todayReal = new Date();
    const todayDate = new Date(todayReal.getFullYear(), todayReal.getMonth(), todayReal.getDate());
    
    // Calculamos el límite para el mes que estamos visualizando
    const deadlineDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), PAYMENT_DEADLINE_DAY);
    
    const diffTime = deadlineDate.getTime() - todayDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 0) return { text: `Quedan ${diffDays} días`, color: 'text-gray-400' };
    if (diffDays === 0) return { text: '¡Último día!', color: 'text-orange-500 font-bold' };
    return { text: `Vencido hace ${Math.abs(diffDays)} días`, color: 'text-[#E31C25] font-bold' };
  };

  const displayData = clients.filter(client => 
    `${client.first_name} ${client.last_name}`.toLowerCase().includes(searchQuery.toLowerCase())
  ).map(client => {
    const invoice = invoices.find(inv => inv.user_id === client.id);
    return { ...client, invoice };
  });

  const monthLabel = currentMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  const capitalizedMonthLabel = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
  const totalPaid = displayData.filter(d => d.invoice).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Facturación Mensual</h1>
          <p className="text-gray-400 mt-1">Generación de facturas y control de morosidad.</p>
        </div>

        <div className="flex items-center gap-4 bg-[#1a1a1a] p-2 rounded-2xl border border-[#2a2a2a]">
          <button onClick={handlePrevMonth} className="p-2 hover:bg-[#2a2a2a] rounded-xl text-gray-400 hover:text-white transition-colors"><ChevronLeft size={24} /></button>
          <div className="w-40 text-center font-bold text-white text-lg">{capitalizedMonthLabel}</div>
          <button onClick={handleNextMonth} className="p-2 hover:bg-[#2a2a2a] rounded-xl text-gray-400 hover:text-white transition-colors"><ChevronRight size={24} /></button>
        </div>
      </div>

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

      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center flex flex-col items-center justify-center text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin text-[#E31C25] mb-4" />
            <p>Calculando fechas y cuotas...</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-[#121212] border-b border-[#2a2a2a] text-gray-400 text-xs uppercase font-bold tracking-wider">
              <tr>
                <th className="p-4 pl-6">Atleta</th>
                <th className="p-4 text-center">Estado del Mes</th>
                <th className="p-4 text-right pr-6">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a2a2a]">
              {displayData.map((data) => {
                const isPaid = !!data.invoice;
                const daysStatus = getDaysStatus();
                
                return (
                  <tr key={data.id} className="hover:bg-white/5 transition-colors group">
                    <td className="p-4 pl-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#121212] border border-[#2a2a2a] flex items-center justify-center font-bold text-[#E31C25]">
                          {data.first_name[0]}
                        </div>
                        <div>
                          <span className="font-bold text-white block">{data.first_name} {data.last_name}</span>
                          <span className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                            <Receipt size={12} /> {DEFAULT_FEE}€ / mes
                          </span>
                        </div>
                      </div>
                    </td>
                    
                    <td className="p-4 text-center">
                      <div className="flex flex-col items-center justify-center gap-1">
                        <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase ${
                          isPaid ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-[#2a2a2a] text-gray-400 border border-[#3f3f46]'
                        }`}>
                          {isPaid ? <CheckCircle size={14} /> : <XCircle size={14} />}
                          {isPaid ? 'Pagado' : 'Sin Pagar'}
                        </div>
                        
                        {/* Indicador de días si NO está pagado */}
                        {!isPaid && (
                          <div className={`text-[10px] flex items-center gap-1 mt-1 ${daysStatus.color}`}>
                            {daysStatus.text.includes('Vencido') && <AlertCircle size={10} />}
                            {daysStatus.text}
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="p-4 text-right pr-6">
                      <div className="flex items-center justify-end gap-2">
                        
                        {/* Botón de Factura (Solo aparece si está pagado) */}
                        {isPaid && (
                          <button 
                            onClick={() => handlePrintInvoice(data, data.invoice)}
                            className="p-2 bg-[#2a2a2a] hover:bg-emerald-500/20 text-gray-300 hover:text-emerald-500 border border-[#3f3f46] hover:border-emerald-500/30 rounded-xl transition-colors flex items-center gap-2"
                            title="Descargar Factura"
                          >
                            <FileText size={18} />
                            <span className="text-xs font-bold hidden sm:block">Factura</span>
                          </button>
                        )}

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
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}