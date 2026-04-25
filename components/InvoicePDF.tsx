import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', color: '#333' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 40 },
  companyInfo: { textAlign: 'right', fontSize: 10, lineHeight: 1.5 },
  boldText: { fontWeight: 'bold' },
  logo: { width: 140, height: 50, objectFit: 'contain' },
  billToContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 40 },
  clientBox: { backgroundColor: '#f4f4f4', padding: 15, borderLeft: '4px solid #E31C25', borderRadius: 4, width: '45%' },
  clientLabel: { fontSize: 9, color: '#777', textTransform: 'uppercase', marginBottom: 5, fontWeight: 'bold' },
  clientName: { fontSize: 14, fontWeight: 'bold' },
  invoiceMeta: { width: '45%', alignItems: 'flex-end' },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  invoiceTitle: { fontSize: 24, color: '#E31C25', fontWeight: 'bold', marginRight: 10 },
  badge: { backgroundColor: '#10b981', color: 'white', padding: '4px 8px', borderRadius: 4, fontSize: 10, fontWeight: 'bold' },
  metaText: { fontSize: 12, marginBottom: 4 },
  
  // Estilos de la nueva tabla de 4 columnas
  table: { width: '100%', marginBottom: 20 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#000', padding: 10 },
  tableHeaderCol1: { width: '40%', color: '#fff', fontSize: 10, fontWeight: 'bold' },
  tableHeaderCol2: { width: '20%', color: '#fff', fontSize: 10, fontWeight: 'bold', textAlign: 'right' },
  tableHeaderCol3: { width: '20%', color: '#fff', fontSize: 10, fontWeight: 'bold', textAlign: 'right' },
  tableHeaderCol4: { width: '20%', color: '#fff', fontSize: 10, fontWeight: 'bold', textAlign: 'right' },
  
  tableRow: { flexDirection: 'row', borderBottom: '1px solid #ccc', padding: '12px 10px', alignItems: 'center' },
  tableCol1: { width: '40%', fontSize: 11, color: '#3f3f46' },
  tableCol2: { width: '20%', fontSize: 11, textAlign: 'right', color: '#52525b' },
  tableCol3: { width: '20%', fontSize: 11, textAlign: 'right', color: '#52525b' },
  tableCol4: { width: '20%', fontSize: 11, textAlign: 'right', fontWeight: 'bold', color: '#18181b' },
  
  summaryContainer: { alignItems: 'flex-end', marginTop: 10, marginBottom: 40 },
  summaryRow: { flexDirection: 'row', paddingVertical: 6, alignItems: 'center' },
  summaryLabel: { fontSize: 11, color: '#71717a', width: 120, textAlign: 'right', paddingRight: 15, fontWeight: 'bold' },
  summaryValue: { fontSize: 12, color: '#3f3f46', width: 80, textAlign: 'right' },
  totalBox: { flexDirection: 'row', backgroundColor: '#f4f4f5', padding: '12px 20px', borderRadius: 6, alignItems: 'center', marginTop: 8 },
  totalLabel: { fontSize: 14, fontWeight: 'bold', marginRight: 20, color: '#18181b' },
  totalAmount: { fontSize: 20, color: '#E31C25', fontWeight: 'bold' },
  footer: { position: 'absolute', bottom: 40, left: 40, right: 40, textAlign: 'center', color: '#a1a1aa', fontSize: 10, borderTop: '1px solid #e4e4e7', paddingTop: 20 }
});

export const InvoicePDF = ({ client, invoice, monthLabel, items }: any) => {
  const formattedDate = new Date(invoice.payment_date || new Date()).toLocaleDateString('es-ES');
  const invoiceNumber = invoice.id.split('-')[0].toUpperCase();

  // Cálculos totales para el cuadro resumen final
  const totalAmount = items.reduce((acc: number, curr: any) => acc + (parseFloat(curr.amount) || 0), 0);
  const totalBaseAmount = totalAmount / 1.21;
  const totalIvaAmount = totalAmount - totalBaseAmount;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        
        {/* Cabecera */}
        <View style={styles.header}>
          <Image src="/logo.png" style={styles.logo} />
          <View style={styles.companyInfo}>
            <Text style={styles.boldText}>Daniel Miranda - Expertos en Movimiento</Text>
            <Text>CIF: 71729852M | Oviedo</Text>
            <Text>danimirandatrainer@gmail.com</Text>
          </View>
        </View>

        {/* Datos Cliente y Factura */}
        <View style={styles.billToContainer}>
          <View style={styles.clientBox}>
            <Text style={styles.clientLabel}>Facturado a:</Text>
            <Text style={styles.clientName}>{client.first_name} {client.last_name}</Text>
          </View>
          <View style={styles.invoiceMeta}>
            <View style={styles.titleRow}>
              <Text style={styles.invoiceTitle}>FACTURA</Text>
              <Text style={styles.badge}>PAGADA</Text>
            </View>
            <Text style={styles.metaText}>Nº: FAC-{invoiceNumber}</Text>
            <Text style={styles.metaText}>Fecha: {formattedDate}</Text>
          </View>
        </View>

        {/* TABLA DE CONCEPTOS DESGLOSADA LÍNEA POR LÍNEA */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.tableHeaderCol1}>CONCEPTO</Text>
            <Text style={styles.tableHeaderCol2}>BASE IMP.</Text>
            <Text style={styles.tableHeaderCol3}>IVA (21%)</Text>
            <Text style={styles.tableHeaderCol4}>TOTAL</Text>
          </View>
          
          {items.map((item: any, index: number) => {
            // Cálculos individuales para esta fila
            const itemTotal = parseFloat(item.amount) || 0;
            const itemBase = itemTotal / 1.21;
            const itemIva = itemTotal - itemBase;

            return (
              <View style={styles.tableRow} key={index}>
                {/* Añadimos el mes al concepto de forma elegante */}
                <Text style={styles.tableCol1}>{item.desc} ({monthLabel})</Text>
                <Text style={styles.tableCol2}>{itemBase.toFixed(2)} €</Text>
                <Text style={styles.tableCol3}>{itemIva.toFixed(2)} €</Text>
                <Text style={styles.tableCol4}>{itemTotal.toFixed(2)} €</Text>
              </View>
            );
          })}
        </View>

        {/* CUADRO RESUMEN TOTAL DESGLOSADO */}
        <View style={styles.summaryContainer}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Base Imponible:</Text>
            <Text style={styles.summaryValue}>{totalBaseAmount.toFixed(2)} €</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>IVA (21%):</Text>
            <Text style={styles.summaryValue}>{totalIvaAmount.toFixed(2)} €</Text>
          </View>
          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>TOTAL FACTURA</Text>
            <Text style={styles.totalAmount}>{totalAmount.toFixed(2)} €</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={{marginBottom: 4}}>Este documento es un justificante de pago válido.</Text>
          <Text>Gracias por confiar en Daniel Miranda - Expertos en Movimiento.</Text>
        </View>

      </Page>
    </Document>
  );
};