import React, { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, CheckCircle, XCircle, Search, Loader2, Receipt, FileText, AlertCircle } from "lucide-react";
import { supabase } from "./lib/supabase";
import html2pdf from "html2pdf.js";

export function BillingManager() {
  const [clients, setClients] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  // --- CONFIGURACIÓN DEL GIMNASIO ---
  const DEFAULT_FEE = 50.00; 
  const PAYMENT_DEADLINE_DAY = 5;

  const fetchData = async () => {
    setLoading(true);

    const { data: clientsData } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .eq('role', 'client')
      .order('first_name', { ascending: true });
      
    if (clientsData) setClients(clientsData);

    const monthStr = currentMonth.toISOString().split('T')[0]; 
    // Ahora leemos por created_at o due_date para cuadrar con tu BD
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

  // --- PLANTILLA HTML SÚPER PROFESIONAL PARA EL PDF ---
  const getInvoiceHTML = (client: any, invoice: any, monthLabel: string) => {
    const dateObj = new Date(invoice.payment_date || new Date());
    const formattedDate = dateObj.toLocaleDateString('es-ES');
    const invoiceNumber = invoice.id.split('-')[0].toUpperCase();

    return `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 50px; color: #18181b; background: white; width: 800px; box-sizing: border-box; position: relative;">
        
        <div style="position: absolute; top: 0; left: 0; right: 0; height: 8px; background-color: #E31C25;"></div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 50px; margin-top: 10px;">
          <div>
            <img src="/logo.png" style="height: 65px; width: auto; max-width: 350px; object-fit: contain;" onerror="this.style.display='none'" />
          </div>
          <div style="text-align: right; color: #52525b; font-size: 13px; line-height: 1.6;">
            <strong style="color: #18181b; font-size: 15px;">Daniel Miranda - Expertos en Movimiento</strong><br>
            CIF/NIF: 12345678Z<br>
            Calle Gonzalez Besada 32, Oviedo<br>
            danimirandatrainer@gmail.com
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; margin-bottom: 40px;">
          
          <div style="background: #f4f4f5; padding: 24px; border-radius: 12px; min-width: 280px; border-left: 4px solid #E31C25;">
            <p style="margin: 0 0 8px 0; color: #71717a; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">Facturado a:</p>
            <h3 style="margin: 0; color: #18181b; font-size: 20px;">${client.first_name} ${client.last_name}</h3>
          </div>
          
          <div style="text-align: right; display: flex; flex-direction: column; justify-content: center;">
            <h2 style="margin: 0 0 12px 0; color: #E31C25; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">FACTURA</h2>
            <table style="margin-left: auto; text-align: left; font-size: 14px; color: #52525b;">
              <tr>
                <td style="padding-right: 16px; padding-bottom: 4px; text-align: right;"><strong>Nº:</strong></td>
                <td style="padding-bottom: 4px; color: #18181b; font-weight: 500;">FAC-${invoiceNumber}</td>
              </tr>
              <tr>
                <td style="padding-right: 16px; padding-bottom: 12px; text-align: right;"><strong>Fecha:</strong></td>
                <td style="padding-bottom: 12px; color: #18181b; font-weight: 500;">${formattedDate}</td>
              </tr>
              <tr>
                <td colspan="2" style="text-align: right;">
                  <span style="background: #10b981; color: white; padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: bold; letter-spacing: 1px;">PAGADA</span>
                </td>
              </tr>
            </table>
          </div>
        </div>

        <table style="width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 40px;">
          <thead>
            <tr>
              <th style="background: #18181b; color: white; text-align: left; padding: 16px; font-size: 13px; text-transform: uppercase; border-top-left-radius: 8px; border-bottom-left-radius: 8px; letter-spacing: 0.5px;">Concepto</th>
              <th style="background: #18181b; color: white; text-align: right; padding: 16px; font-size: 13px; text-transform: uppercase; border-top-right-radius: 8px; border-bottom-right-radius: 8px; letter-spacing: 0.5px;">Importe</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding: 24px 16px; border-bottom: 1px solid #e4e4e7; color: #3f3f46; font-size: 15px;">${invoice.description} - ${monthLabel}</td>
              <td style="text-align: right; padding: 24px 16px; border-bottom: 1px solid #e4e4e7; color: #18181b; font-size: 16px; font-weight: 600;">${invoice.amount.toFixed(2)} €</td>
            </tr>
          </tbody>
        </table>

        <div style="display: flex; justify-content: flex-end; margin-bottom: 60px;">
          <div style="background: #f4f4f5; padding: 24px 32px; border-radius: 12px; min-width: 250px; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 14px; color: #52525b; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Total</span>
            <span style="font-size: 28px; font-weight: 900; color: #E31C25;">${invoice.amount.toFixed(2)} €</span>
          </div>
        </div>

        <div style="text-align: center; color: #a1a1aa; font-size: 13px; border-top: 1px solid #e4e4e7; padding-top: 30px;">
          <p style="margin: 0 0 4px 0;">Este documento es un justificante de pago válido.</p>
          <p style="margin: 0;">Gracias por confiar en <strong style="color: #71717a;">Daniel Miranda - Expertos en Movimiento</strong>.</p>
        </div>
        
      </div>
    `;
  };

  // --- LÓGICA DE PAGO Y GENERACIÓN/SUBIDA DE PDF ---
  const togglePayment = async (client: any, existingInvoice: any) => {
    const monthStr = currentMonth.toISOString().split('T')[0];

    if (existingInvoice) {
      setInvoices(invoices.filter(inv => inv.id !== existingInvoice.id));
      await supabase.from('invoices').delete().eq('id', existingInvoice.id);
    } else {
      setIsProcessingPdf(true); // Bloqueamos la UI mientras fabrica el PDF

      try {
        // 1. Insertamos la factura en la Base de Datos para obtener su ID
        const { data: insertedData, error: insertError } = await supabase.from('invoices').insert([{
          user_id: client.id,
          amount: DEFAULT_FEE,
          description: 'Cuota Mensual',
          status: 'pagada', // 'pagada' para que cuadre con la app
          due_date: monthStr,
          payment_date: new Date().toISOString()
        }]).select();

        if (insertError || !insertedData) throw insertError;
        const newInvoice = insertedData[0];

        // 2. Preparamos el código HTML para el PDF
        const monthLabel = currentMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
        const htmlContent = getInvoiceHTML(client, newInvoice, monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1));
        const element = document.createElement('div');
        element.innerHTML = htmlContent;

        // 3. Generamos el PDF como un archivo (Blob)
        const opt = {
          margin: 0,
          filename: `Factura_${newInvoice.id}.pdf`,
          image: { type: 'jpeg', quality: 1 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        const pdfBlob = await html2pdf().set(opt).from(element).output('blob');

        // 4. Lo subimos al Storage de Supabase
        const filePath = `${client.id}/${newInvoice.id}.pdf`;
        const { error: uploadError } = await supabase.storage
          .from('invoices')
          .upload(filePath, pdfBlob, {
            contentType: 'application/pdf',
            upsert: true
          });

        // 5. Si se sube bien, actualizamos la tabla con la URL pública
        if (!uploadError) {
          const { data: publicUrlData } = supabase.storage.from('invoices').getPublicUrl(filePath);
          await supabase.from('invoices').update({ pdf_url: publicUrlData.publicUrl }).eq('id', newInvoice.id);
        }
        
      } catch (err) {
        console.error("Error al generar o subir la factura:", err);
        alert("El pago se guardó, pero hubo un error generando el PDF.");
      } finally {
        await fetchData(); 
        setIsProcessingPdf(false);
      }
    }
  };

  const handlePrintInvoice = (invoice: any) => {
    if (invoice.pdf_url) {
      window.open(invoice.pdf_url, '_blank');
    } else {
      alert("El PDF se está procesando o no se pudo generar.");
    }
  };

  const getDaysStatus = () => {
    const todayReal = new Date();
    const todayDate = new Date(todayReal.getFullYear(), todayReal.getMonth(), todayReal.getDate());
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

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* CAPA DE BLOQUEO DE CARGA */}
      {isProcessingPdf && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex flex-col items-center justify-center">
          <Loader2 className="w-12 h-12 animate-spin text-[#E31C25] mb-4" />
          <p className="text-white font-bold text-lg">Generando factura PDF y enlazando a la App...</p>
        </div>
      )}

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
                        
                        {isPaid && (
                          <button 
                            onClick={() => handlePrintInvoice(data.invoice)}
                            className="p-2 bg-[#2a2a2a] hover:bg-emerald-500/20 text-gray-300 hover:text-emerald-500 border border-[#3f3f46] hover:border-emerald-500/30 rounded-xl transition-colors flex items-center gap-2"
                            title="Ver Factura PDF"
                          >
                            <FileText size={18} />
                            <span className="text-xs font-bold hidden sm:block">PDF</span>
                          </button>
                        )}

                        <button 
                          onClick={() => togglePayment(data, data.invoice)}
                          disabled={isProcessingPdf}
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