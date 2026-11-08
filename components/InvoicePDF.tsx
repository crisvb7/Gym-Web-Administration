import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { ISSUER, VAT_RATE, formatMonths, invoiceReference } from '../src/lib/billing';

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', color: '#333' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 40 },
  companyInfo: { textAlign: 'right', fontSize: 10, lineHeight: 1.5 },
  boldText: { fontWeight: 'bold' },
  logo: { width: 140, height: 50, objectFit: 'contain' },
  billToContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 30 },
  clientBox: { backgroundColor: '#f4f4f4', padding: 15, borderLeft: '4px solid #E31C25', borderRadius: 4, width: '45%' },
  clientLabel: { fontSize: 9, color: '#777', textTransform: 'uppercase', marginBottom: 5, fontWeight: 'bold' },
  clientName: { fontSize: 14, fontWeight: 'bold' },
  invoiceMeta: { width: '50%', alignItems: 'flex-end' },
  invoiceTitle: { fontSize: 18, color: '#E31C25', fontWeight: 'bold', marginBottom: 6, textAlign: 'right' },
  badge: { backgroundColor: '#10b981', color: 'white', padding: '4px 8px', borderRadius: 4, fontSize: 10, fontWeight: 'bold', marginBottom: 10 },
  metaText: { fontSize: 12, marginBottom: 4 },

  notice: { backgroundColor: '#f4f4f5', padding: 12, borderRadius: 4, marginBottom: 20 },
  noticeLabel: { fontSize: 9, color: '#71717a', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 3 },
  noticeText: { fontSize: 11, color: '#18181b', marginBottom: 4 },

  table: { width: '100%', marginBottom: 20 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#000', padding: 10 },
  tableHeaderCol1: { width: '46%', color: '#fff', fontSize: 10, fontWeight: 'bold' },
  tableHeaderCol2: { width: '14%', color: '#fff', fontSize: 10, fontWeight: 'bold', textAlign: 'right' },
  tableHeaderCol3: { width: '20%', color: '#fff', fontSize: 10, fontWeight: 'bold', textAlign: 'right' },
  tableHeaderCol4: { width: '20%', color: '#fff', fontSize: 10, fontWeight: 'bold', textAlign: 'right' },

  tableRow: { flexDirection: 'row', borderBottom: '1px solid #ccc', padding: '12px 10px', alignItems: 'center' },
  tableCol1: { width: '46%', fontSize: 11, color: '#3f3f46' },
  tableCol2: { width: '14%', fontSize: 11, textAlign: 'right', color: '#52525b' },
  tableCol3: { width: '20%', fontSize: 11, textAlign: 'right', color: '#52525b' },
  tableCol4: { width: '20%', fontSize: 11, textAlign: 'right', fontWeight: 'bold', color: '#18181b' },

  summaryContainer: { alignItems: 'flex-end', marginTop: 10, marginBottom: 40 },
  summaryRow: { flexDirection: 'row', paddingVertical: 6, alignItems: 'center' },
  summaryLabel: { fontSize: 11, color: '#71717a', width: 120, textAlign: 'right', paddingRight: 15, fontWeight: 'bold' },
  summaryValue: { fontSize: 12, color: '#3f3f46', width: 80, textAlign: 'right' },
  totalBox: { flexDirection: 'row', backgroundColor: '#f4f4f5', padding: '12px 20px', borderRadius: 6, alignItems: 'center', marginTop: 8 },
  totalLabel: { fontSize: 14, fontWeight: 'bold', marginRight: 20, color: '#18181b' },
  totalAmount: { fontSize: 20, color: '#E31C25', fontWeight: 'bold' },
  footer: { position: 'absolute', bottom: 40, left: 40, right: 40, textAlign: 'center', color: '#a1a1aa', fontSize: 10, borderTop: '1px solid #e4e4e7', paddingTop: 20 },
});

const euros = (value: number) => `${Number(value).toFixed(2)} €`;

export const InvoicePDF = ({ invoice }: { invoice: any }) => {
  const isRectification = invoice.status === 'rectificativa';
  const issued = invoice.issue_date ? new Date(`${invoice.issue_date}T12:00:00`) : new Date(invoice.payment_date || Date.now());
  const lines: any[] = invoice.lines?.length
    ? invoice.lines
    : [{ desc: invoice.description || 'Cuota mensual', quantity: 1, unit_amount: invoice.amount, amount: invoice.amount }];
  const vatRate = Number(invoice.vat_rate ?? VAT_RATE);
  const total = Number(invoice.amount);
  const base = invoice.base_amount != null ? Number(invoice.base_amount) : Math.round((total / (1 + vatRate / 100)) * 100) / 100;
  const vat = invoice.vat_amount != null ? Number(invoice.vat_amount) : total - base;
  const months: string[] = invoice.period_months ?? [];

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        <View style={styles.header}>
          <Image src="/logo.png" style={styles.logo} />
          <View style={styles.companyInfo}>
            <Text style={styles.boldText}>{ISSUER.name}</Text>
            <Text>{ISSUER.tradeName}</Text>
            <Text>NIF: {ISSUER.nif} | {ISSUER.city}</Text>
            <Text>{ISSUER.email}</Text>
          </View>
        </View>

        <View style={styles.billToContainer}>
          <View style={styles.clientBox}>
            <Text style={styles.clientLabel}>Cliente:</Text>
            <Text style={styles.clientName}>{invoice.client_name || '-'}</Text>
          </View>
          <View style={styles.invoiceMeta}>
            <Text style={styles.invoiceTitle}>{isRectification ? 'FACTURA RECTIFICATIVA' : 'FACTURA SIMPLIFICADA'}</Text>
            {!isRectification && <Text style={styles.badge}>PAGADA</Text>}
            <Text style={styles.metaText}>Nº: {invoiceReference(invoice)}</Text>
            <Text style={styles.metaText}>Fecha de expedición: {issued.toLocaleDateString('es-ES')}</Text>
          </View>
        </View>

        {isRectification ? (
          <View style={styles.notice}>
            <Text style={styles.noticeLabel}>Factura rectificada</Text>
            <Text style={styles.noticeText}>{invoice.rectified_number}</Text>
            <Text style={styles.noticeLabel}>Motivo</Text>
            <Text style={styles.noticeText}>{invoice.rectification_reason}</Text>
          </View>
        ) : months.length > 0 && (
          <View style={styles.notice}>
            <Text style={styles.noticeLabel}>Periodo facturado</Text>
            <Text style={styles.noticeText}>{formatMonths(months)}</Text>
          </View>
        )}

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.tableHeaderCol1}>CONCEPTO</Text>
            <Text style={styles.tableHeaderCol2}>CANT.</Text>
            <Text style={styles.tableHeaderCol3}>PRECIO</Text>
            <Text style={styles.tableHeaderCol4}>IMPORTE</Text>
          </View>
          {lines.map((line: any, index: number) => (
            <View style={styles.tableRow} key={index}>
              <Text style={styles.tableCol1}>{line.desc}</Text>
              <Text style={styles.tableCol2}>{line.quantity ?? 1}</Text>
              <Text style={styles.tableCol3}>{euros(line.unit_amount ?? line.amount)}</Text>
              <Text style={styles.tableCol4}>{euros(line.amount)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.summaryContainer}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Base Imponible:</Text>
            <Text style={styles.summaryValue}>{euros(base)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>IVA ({vatRate}%):</Text>
            <Text style={styles.summaryValue}>{euros(vat)}</Text>
          </View>
          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>TOTAL (IVA incluido)</Text>
            <Text style={styles.totalAmount}>{euros(total)}</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text>Gracias por confiar en {ISSUER.name} - {ISSUER.tradeName}.</Text>
        </View>

      </Page>
    </Document>
  );
};
