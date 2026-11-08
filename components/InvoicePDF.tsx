import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { ISSUER, VAT_RATE, formatMonths, invoiceReference } from '../src/lib/billing';

const INK = '#18181b';
const MUTED = '#71717a';
const RULE = '#e4e4e7';
const BOLD = 'Helvetica-Bold';

const styles = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 72, paddingHorizontal: 52, fontFamily: 'Helvetica', fontSize: 10, color: INK, lineHeight: 1.4 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 36 },
  logo: { width: 52, height: 62, objectFit: 'contain' },
  headerRight: { alignItems: 'flex-end' },
  title: { fontFamily: BOLD, fontSize: 20, letterSpacing: -0.3, lineHeight: 1.2, marginBottom: 12 },
  reference: { fontSize: 11, color: MUTED, lineHeight: 1.2 },

  parties: { flexDirection: 'row', borderTop: `1 solid ${INK}`, paddingTop: 14, marginBottom: 28 },
  party: { flex: 1, paddingRight: 16 },
  label: { fontFamily: BOLD, fontSize: 7.5, color: MUTED, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 5 },
  strong: { fontFamily: BOLD },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  metaKey: { color: MUTED },

  detail: { marginBottom: 24 },

  tableHead: { flexDirection: 'row', borderBottom: `1 solid ${INK}`, paddingBottom: 6 },
  tableRow: { flexDirection: 'row', borderBottom: `0.5 solid ${RULE}`, paddingVertical: 9 },
  colDesc: { flex: 1, paddingRight: 12 },
  colNum: { width: 76, textAlign: 'right' },
  colQty: { width: 44, textAlign: 'right' },

  totals: { alignSelf: 'flex-end', width: 210, marginTop: 16 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  grandTotal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTop: `1 solid ${INK}`, marginTop: 6, paddingTop: 10, marginBottom: 10 },
  grandLabel: { fontFamily: BOLD, fontSize: 10 },
  grandAmount: { fontFamily: BOLD, fontSize: 16, lineHeight: 1.2 },
  vatNote: { textAlign: 'right', fontSize: 8, color: MUTED },

  footer: { position: 'absolute', bottom: 32, left: 52, right: 52, borderTop: `0.5 solid ${RULE}`, paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: MUTED },
});

const euros = (value: number) =>
  `${Number(value).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

const STATUS_LABEL: Record<string, string> = { pagada: 'Pagada', anulada: 'Anulada' };

export const InvoicePDF = ({ invoice }: { invoice: any }) => {
  const isRectification = invoice.status === 'rectificativa';
  const issued = invoice.issue_date ? new Date(`${invoice.issue_date}T12:00:00`) : new Date(invoice.payment_date || Date.now());
  const issuedLabel = issued.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const lines: any[] = invoice.lines?.length
    ? invoice.lines
    : [{ desc: invoice.description || 'Cuota mensual', quantity: 1, unit_amount: invoice.amount, amount: invoice.amount }];
  const vatRate = Number(invoice.vat_rate ?? VAT_RATE);
  const total = Number(invoice.amount);
  const base = invoice.base_amount != null ? Number(invoice.base_amount) : Math.round((total / (1 + vatRate / 100)) * 100) / 100;
  const vat = invoice.vat_amount != null ? Number(invoice.vat_amount) : total - base;
  const months: string[] = invoice.period_months ?? [];

  return (
    <Document title={`${isRectification ? 'Factura rectificativa' : 'Factura'} ${invoiceReference(invoice)}`} author={ISSUER.name}>
      <Page size="A4" style={styles.page}>

        <View style={styles.header}>
          <Image src="/logo-invoice.png" style={styles.logo} />
          <View style={styles.headerRight}>
            <Text style={styles.title}>{isRectification ? 'Factura rectificativa' : 'Factura simplificada'}</Text>
            <Text style={styles.reference}>Nº {invoiceReference(invoice)}</Text>
          </View>
        </View>

        <View style={styles.parties}>
          <View style={styles.party}>
            <Text style={styles.label}>Emisor</Text>
            <Text style={styles.strong}>{ISSUER.name}</Text>
            <Text>{ISSUER.tradeName}</Text>
            <Text>NIF {ISSUER.nif}</Text>
            <Text>{ISSUER.city}</Text>
          </View>
          <View style={styles.party}>
            <Text style={styles.label}>Cliente</Text>
            <Text style={styles.strong}>{invoice.client_name || '-'}</Text>
          </View>
          <View style={{ width: 150 }}>
            <Text style={styles.label}>Datos</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaKey}>Fecha</Text>
              <Text>{issuedLabel}</Text>
            </View>
            {STATUS_LABEL[invoice.status] && (
              <View style={styles.metaRow}>
                <Text style={styles.metaKey}>Estado</Text>
                <Text>{STATUS_LABEL[invoice.status]}</Text>
              </View>
            )}
          </View>
        </View>

        {isRectification ? (
          <View style={styles.detail}>
            <Text style={styles.label}>Rectifica a la factura</Text>
            <Text style={styles.strong}>{invoice.rectified_number}</Text>
            <Text style={[styles.label, { marginTop: 10 }]}>Motivo</Text>
            <Text>{invoice.rectification_reason}</Text>
          </View>
        ) : months.length > 0 && (
          <View style={styles.detail}>
            <Text style={styles.label}>Periodo facturado</Text>
            <Text>{formatMonths(months)}</Text>
          </View>
        )}

        <View style={styles.tableHead}>
          <Text style={[styles.label, styles.colDesc, { marginBottom: 0 }]}>Concepto</Text>
          <Text style={[styles.label, styles.colQty, { marginBottom: 0 }]}>Cant.</Text>
          <Text style={[styles.label, styles.colNum, { marginBottom: 0 }]}>Precio</Text>
          <Text style={[styles.label, styles.colNum, { marginBottom: 0 }]}>Importe</Text>
        </View>
        {lines.map((line: any, index: number) => (
          <View style={styles.tableRow} key={index} wrap={false}>
            <Text style={styles.colDesc}>{line.desc}</Text>
            <Text style={styles.colQty}>{line.quantity ?? 1}</Text>
            <Text style={styles.colNum}>{euros(line.unit_amount ?? line.amount)}</Text>
            <Text style={[styles.colNum, styles.strong]}>{euros(line.amount)}</Text>
          </View>
        ))}

        <View style={styles.totals} wrap={false}>
          <View style={styles.totalRow}>
            <Text style={styles.metaKey}>Base imponible</Text>
            <Text>{euros(base)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.metaKey}>IVA ({vatRate} %)</Text>
            <Text>{euros(vat)}</Text>
          </View>
          <View style={styles.grandTotal}>
            <Text style={styles.grandLabel}>Total</Text>
            <Text style={styles.grandAmount}>{euros(total)}</Text>
          </View>
          <Text style={styles.vatNote}>IVA incluido</Text>
        </View>

        <View style={styles.footer} fixed>
          <Text>{ISSUER.name} · {ISSUER.tradeName}</Text>
          <Text>{ISSUER.email}</Text>
        </View>

      </Page>
    </Document>
  );
};
