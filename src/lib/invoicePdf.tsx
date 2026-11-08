import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { InvoicePDF } from '../../components/InvoicePDF';
import { supabase } from './supabase';
import { invoiceReference } from './billing';

// Genera el PDF de una factura ya emitida y lo guarda. Si falla, la factura sigue siendo válida
// y el PDF se vuelve a generar al descargarla.
export async function storeInvoicePdf(invoice: any): Promise<string> {
  const pdfBlob = await pdf(<InvoicePDF invoice={invoice} />).toBlob();
  const filePath = `${invoice.user_id ?? 'sin-cliente'}/${invoice.id}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from('invoices')
    .upload(filePath, pdfBlob, { contentType: 'application/pdf', upsert: true });
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from('invoices').getPublicUrl(filePath);
  const { error: updateError } = await supabase.from('invoices').update({ pdf_url: urlData.publicUrl }).eq('id', invoice.id);
  if (updateError) throw updateError;

  return urlData.publicUrl;
}

export async function downloadInvoice(invoice: any): Promise<void> {
  const pdfUrl: string = invoice.pdf_url || await storeInvoicePdf(invoice);

  try {
    const response = await fetch(pdfUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const url = window.URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Factura_${invoiceReference(invoice)}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error al descargar:', error);
    window.open(pdfUrl, '_blank');
  }
}
