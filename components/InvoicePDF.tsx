import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image, Font, Svg, Defs, RadialGradient, Stop, Rect, Polygon, Line } from '@react-pdf/renderer';
import { ISSUER, VAT_RATE, formatMonths, invoiceReference } from '../src/lib/billing';

// Registra las fuentes desde cero. Reutilizar una fuente ya usada en otro PDF corrompe letras (tras
// varias facturas, "Ana Ruiz" salía como "na Ruiz"), así que hay que llamarla antes de cada factura.
export function registerInvoiceFonts() {
  // Solo estas dos familias: la librería necesita conservar las suyas, como Helvetica.
  const registered = Font.getRegisteredFonts();
  delete registered.Sans;
  delete registered.Mono;
  Font.register({
    family: 'Sans',
    fonts: [
      { src: '/fonts/DejaVuSans.ttf', fontWeight: 400 },
      { src: '/fonts/DejaVuSans-Bold.ttf', fontWeight: 700 },
    ],
  });
  Font.register({
    family: 'Mono',
    fonts: [
      { src: '/fonts/DejaVuSansMono.ttf', fontWeight: 400 },
      { src: '/fonts/DejaVuSansMono-Bold.ttf', fontWeight: 700 },
    ],
  });
}
registerInvoiceFonts();
// Sin guiones de partición: nombres y números de factura no se cortan.
Font.registerHyphenationCallback((word) => [word]);

const BRAND_LINE = `${ISSUER.name} | Expertos en movimiento`;

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;

const BG = '#0F0F12';
const CARD = '#1A1A1F';
const BORDER = '#3A3A41';
const RULE = '#2E2E34';
const WHITE = '#FFFFFF';
const TEXT = '#D4D4D8';
const MUTED = '#9A9AA3';
const RED = '#F0083C';

// Rayas verticales muy tenues del fondo
const STRIPES = Array.from({ length: Math.floor(PAGE_WIDTH / 9) }, (_, i) => (i + 1) * 9);

const styles = StyleSheet.create({
  page: { backgroundColor: BG, paddingTop: 44, paddingBottom: 92, paddingHorizontal: MARGIN, fontFamily: 'Sans', fontSize: 8, color: TEXT, lineHeight: 1.35 },

  glow: { position: 'absolute', top: 0, left: 0 },
  watermark: { position: 'absolute', left: 300, top: 318, width: 305, height: 390 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 26, borderBottom: `0.75 solid ${RULE}`, marginBottom: 28 },
  brand: { flexDirection: 'row', alignItems: 'center' },
  plate: { width: 45, height: 56, marginRight: 14 },
  plateLogo: { position: 'absolute', left: 4, top: 5, width: 37, height: 46, objectFit: 'contain' },
  brandName: { fontWeight: 700, fontSize: 10.5, color: WHITE, lineHeight: 1.2 },
  brandTag: { fontFamily: 'Mono', fontSize: 6.5, color: MUTED, letterSpacing: 1, marginTop: 4 },
  docRight: { alignItems: 'flex-end' },
  docType: { fontFamily: 'Mono', fontWeight: 700, fontSize: 6.5, color: RED, letterSpacing: 1.3 },
  docNumber: { fontFamily: 'Mono', fontWeight: 700, fontSize: 22, color: WHITE, lineHeight: 1.2, marginTop: 6 },
  docDate: { fontFamily: 'Mono', fontSize: 7, color: MUTED, letterSpacing: 1, marginTop: 4 },

  cards: { flexDirection: 'row', marginBottom: 14 },
  card: { backgroundColor: CARD, border: `0.75 solid ${BORDER}`, paddingHorizontal: 14, paddingTop: 15, paddingBottom: 14, minHeight: 86 },
  cardAccent: { position: 'absolute', top: -0.75, left: -0.75, width: 22, height: 2, backgroundColor: RED },
  cardLabel: { fontFamily: 'Mono', fontWeight: 700, fontSize: 6.5, color: RED, letterSpacing: 1.2, marginBottom: 8 },
  cardName: { fontWeight: 700, fontSize: 11, color: WHITE, lineHeight: 1.2, marginBottom: 4 },
  cardText: { fontSize: 7.5, color: MUTED, lineHeight: 1.5 },
  dataRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 },
  dataValue: { fontWeight: 700, fontSize: 7.5, color: WHITE },
  badge: { alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 7 },
  badgeText: { fontFamily: 'Mono', fontWeight: 700, fontSize: 6.5, color: WHITE, letterSpacing: 1 },

  band: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: CARD, border: `0.75 solid ${BORDER}`, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 26 },
  bandAccent: { position: 'absolute', bottom: -0.75, left: -0.75, width: 98, height: 2.5, backgroundColor: RED },
  bandMain: { flex: 1, paddingRight: 16 },
  bandLabel: { fontFamily: 'Mono', fontWeight: 700, fontSize: 6.5, color: RED, letterSpacing: 1.2, marginBottom: 4 },
  bandTitle: { fontWeight: 700, fontSize: 10.5, color: WHITE, lineHeight: 1.3 },
  bandSide: { fontFamily: 'Mono', fontSize: 6.5, color: MUTED, letterSpacing: 1 },

  sectionLabel: { fontFamily: 'Mono', fontWeight: 700, fontSize: 6.5, color: MUTED, letterSpacing: 1.2, marginBottom: 7 },
  tableHead: { flexDirection: 'row', paddingHorizontal: 6, paddingBottom: 7, borderBottom: `0.75 solid ${BORDER}` },
  headCell: { fontFamily: 'Mono', fontSize: 6.5, color: MUTED, letterSpacing: 1 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 12, borderBottom: `0.75 solid ${RULE}` },
  colDesc: { flex: 1, paddingRight: 12 },
  colQty: { width: 38, textAlign: 'right' },
  colNum: { width: 78, textAlign: 'right' },
  lineTitle: { fontWeight: 700, fontSize: 9, color: WHITE },
  lineNote: { fontFamily: 'Mono', fontSize: 6.5, color: MUTED, marginTop: 3 },
  cell: { fontSize: 8.5, color: TEXT },
  cellStrong: { fontWeight: 700, fontSize: 8.5, color: WHITE },

  closing: { flexDirection: 'row', alignItems: 'stretch', marginTop: 26 },
  notes: { flex: 1, borderLeft: `2 solid ${RED}`, paddingLeft: 12, paddingTop: 12, marginRight: 34 },
  notesTitle: { fontFamily: 'Mono', fontWeight: 700, fontSize: 7, color: MUTED, letterSpacing: 1.2, marginBottom: 1 },
  notesText: { fontSize: 7.5, color: MUTED, lineHeight: 1.5 },
  totals: { width: 190, backgroundColor: CARD, border: `0.75 solid ${BORDER}`, paddingHorizontal: 14, paddingTop: 13, paddingBottom: 11 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  totalKey: { fontSize: 7.5, color: MUTED },
  totalValue: { fontWeight: 700, fontSize: 7.5, color: WHITE },
  grandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTop: `0.75 solid ${BORDER}`, marginTop: 6, paddingTop: 11 },
  grandKey: { fontFamily: 'Mono', fontWeight: 700, fontSize: 7, color: WHITE, letterSpacing: 1.2 },
  grandValue: { fontFamily: 'Mono', fontWeight: 700, fontSize: 18, color: RED, lineHeight: 1.2 },
  vatNote: { fontFamily: 'Mono', fontSize: 6, color: MUTED, textAlign: 'right', marginTop: 2 },

  footer: { position: 'absolute', bottom: 28, left: MARGIN, right: MARGIN, borderTop: `0.75 solid ${RULE}`, paddingTop: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  footerName: { fontWeight: 700, fontSize: 7.5, color: WHITE },
  footerText: { fontSize: 6.5, color: MUTED, marginTop: 4 },
  footerTag: { fontFamily: 'Mono', fontWeight: 700, fontSize: 6.5, color: RED, letterSpacing: 1.3 },
});

const euros = (value: number) =>
  // En español el navegador no separa los miles con 4 cifras (4680,00), pero sí con 5 (11.950,50).
  `${Number(value).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' as any })} €`;

// "Noviembre 2026 y Febrero 2027" → "Noviembre 2026 y febrero 2027"
const sentenceCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();

const NUMBER_WORDS: Record<number, string> = { 2: 'dos', 3: 'tres', 4: 'cuatro', 5: 'cinco', 6: 'seis', 7: 'siete', 8: 'ocho', 9: 'nueve', 10: 'diez', 11: 'once', 12: 'doce' };

const notesFor = (isRectification: boolean, reason: string | undefined, monthCount: number) => {
  if (isRectification) return `Motivo de la rectificación: ${reason || 'no indicado'}.`;
  const issuedBy = `Documento emitido por ${ISSUER.tradeName}.`;
  if (monthCount === 0) return issuedBy;
  const fees = monthCount === 1 ? 'una cuota mensual' : `${NUMBER_WORDS[monthCount] ?? monthCount} cuotas mensuales`;
  return `Factura correspondiente a ${fees}. ${issuedBy}`;
};

const Card = ({ label, style, children }: { label: string; style: any; children: React.ReactNode }) => (
  <View style={[styles.card, style]}>
    <View style={styles.cardAccent} />
    <Text style={styles.cardLabel}>{label}</Text>
    {children}
  </View>
);

export const InvoicePDF = ({ invoice }: { invoice: any }) => {
  const isRectification = invoice.status === 'rectificativa';
  const isVoid = invoice.status === 'anulada';
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
  const badge = isRectification ? 'RECTIFICATIVA' : isVoid ? 'ANULADA' : invoice.status === 'pagada' ? 'PAGADA' : null;

  return (
    <Document title={`${isRectification ? 'Factura rectificativa' : 'Factura'} ${invoiceReference(invoice)}`} author={ISSUER.name}>
      <Page size="A4" style={styles.page}>

        {/* Fondo: se repite en todas las páginas si la factura ocupa más de una. */}
        <View style={styles.glow} fixed>
          <Svg width={PAGE_WIDTH} height={PAGE_HEIGHT}>
            <Defs>
              <RadialGradient id="glow" cx={PAGE_WIDTH} cy={PAGE_HEIGHT} r={460} gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor={RED} stopOpacity={0.13} />
                <Stop offset="1" stopColor={RED} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            {STRIPES.map((x) => <Line key={x} x1={x} y1={0} x2={x} y2={PAGE_HEIGHT} stroke={WHITE} strokeWidth={0.5} strokeOpacity={0.022} />)}
            <Rect x={0} y={0} width={PAGE_WIDTH} height={PAGE_HEIGHT} fill="url(#glow)" />
          </Svg>
        </View>
        <Image src="/logo-invoice-mark.png" style={styles.watermark} fixed />

        <View style={styles.header}>
          <View style={styles.brand}>
            {/* El logo lleva partes oscuras: sobre la placa blanca se lee completo. */}
            <View style={styles.plate}>
              <Svg width={45} height={56}>
                <Polygon points="0,0 45,0 45,47 36,56 0,56" fill={WHITE} />
              </Svg>
              <Image src="/logo-invoice.png" style={styles.plateLogo} />
            </View>
            <View>
              <Text style={styles.brandName}>{BRAND_LINE}</Text>
              <Text style={styles.brandTag}>TRAINING SYSTEMS / {ISSUER.city.toUpperCase()}</Text>
            </View>
          </View>
          <View style={styles.docRight}>
            <Text style={styles.docType}>{isRectification ? 'FACTURA RECTIFICATIVA' : 'FACTURA SIMPLIFICADA'}</Text>
            <Text style={styles.docNumber}>{invoiceReference(invoice)}</Text>
            <Text style={styles.docDate}>{issuedLabel.replace(/\//g, ' / ')}</Text>
          </View>
        </View>

        <View style={styles.cards}>
          <Card label="01 / EMISOR" style={{ flex: 1.1, marginRight: 9 }}>
            <Text style={styles.cardName}>{ISSUER.name}</Text>
            <Text style={styles.cardText}>{ISSUER.tradeName}</Text>
            <Text style={styles.cardText}>NIF {ISSUER.nif} · {ISSUER.city}</Text>
          </Card>
          <Card label="02 / CLIENTE" style={{ flex: 1, marginRight: 9 }}>
            <Text style={styles.cardName}>{invoice.client_name || '-'}</Text>
            <Text style={styles.cardText}>Cliente particular</Text>
          </Card>
          <Card label="03 / DATOS" style={{ width: 133 }}>
            <View style={styles.dataRow}>
              <Text style={styles.cardText}>Fecha</Text>
              <Text style={styles.dataValue}>{issuedLabel}</Text>
            </View>
            {badge && (
              <View style={[styles.badge, { backgroundColor: isVoid ? '#52525B' : RED }]}>
                <Text style={styles.badgeText}>{badge}</Text>
              </View>
            )}
          </Card>
        </View>

        {isRectification ? (
          <View style={styles.band} wrap={false}>
            <View style={styles.bandMain}>
              <Text style={styles.bandLabel}>RECTIFICA A LA FACTURA</Text>
              <Text style={styles.bandTitle}>{invoice.rectified_number}</Text>
            </View>
            <View style={styles.bandAccent} />
          </View>
        ) : months.length > 0 ? (
          <View style={styles.band} wrap={false}>
            <View style={styles.bandMain}>
              <Text style={styles.bandLabel}>PERIODO FACTURADO</Text>
              <Text style={styles.bandTitle}>{sentenceCase(formatMonths(months))}</Text>
            </View>
            <Text style={styles.bandSide}>{months.length === 1 ? '1 MENSUALIDAD' : `${months.length} MENSUALIDADES`}</Text>
            <View style={styles.bandAccent} />
          </View>
        ) : null}

        <Text style={styles.sectionLabel}>DETALLE / SERVICIOS</Text>
        <View style={styles.tableHead} fixed>
          <Text style={[styles.headCell, styles.colDesc]}>CONCEPTO</Text>
          <Text style={[styles.headCell, styles.colQty]}>CANT.</Text>
          <Text style={[styles.headCell, styles.colNum]}>PRECIO</Text>
          <Text style={[styles.headCell, styles.colNum]}>IMPORTE</Text>
        </View>
        {lines.map((line: any, index: number) => (
          <View style={styles.tableRow} key={index} wrap={false}>
            <View style={styles.colDesc}>
              <Text style={styles.lineTitle}>{line.desc}</Text>
              {/^cuota/i.test(line.desc ?? '') && <Text style={styles.lineNote}>Servicios de entrenamiento</Text>}
            </View>
            <Text style={[styles.cell, styles.colQty]}>{line.quantity ?? 1}</Text>
            <Text style={[styles.cell, styles.colNum]}>{euros(line.unit_amount ?? line.amount)}</Text>
            <Text style={[styles.cellStrong, styles.colNum]}>{euros(line.amount)}</Text>
          </View>
        ))}

        <View style={styles.closing} wrap={false}>
          <View style={styles.notes}>
            <Text style={styles.notesTitle}>OBSERVACIONES</Text>
            <Text style={styles.notesText}>{notesFor(isRectification, invoice.rectification_reason, months.length)}</Text>
          </View>
          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text style={styles.totalKey}>Base imponible</Text>
              <Text style={styles.totalValue}>{euros(base)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalKey}>IVA / {vatRate} %</Text>
              <Text style={styles.totalValue}>{euros(vat)}</Text>
            </View>
            <View style={styles.grandRow}>
              <Text style={styles.grandKey}>TOTAL</Text>
              <Text style={styles.grandValue}>{euros(total)}</Text>
            </View>
            <Text style={styles.vatNote}>IVA incluido</Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <View>
            <Text style={styles.footerName}>{BRAND_LINE}</Text>
            <Text style={styles.footerText}>{ISSUER.email} · {ISSUER.city}</Text>
          </View>
          <Text style={styles.footerTag}>MOVE / TRAIN / EVOLVE</Text>
        </View>

      </Page>
    </Document>
  );
};
