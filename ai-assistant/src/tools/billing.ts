import { z } from "zod";
import { zodFunction } from "openai/helpers/zod";
import { supabase } from "../supabaseClient.js";
import { pendingConfirmation } from "./confirmation.js";

export const listInvoices = zodFunction({
  name: "list_invoices",
  description:
    "Lista las facturas de un mes concreto (todas o de un socio concreto). El mes se identifica " +
    "por su primer día, formato YYYY-MM-DD (p.ej. '2026-08-01' para agosto 2026).",
  parameters: z.object({
    month: z.string().regex(/^\d{4}-\d{2}-01$/).describe("Primer día del mes, formato YYYY-MM-01."),
    member_id: z.string().uuid().nullable().optional().describe("Filtra por un socio concreto."),
  }),
  function: async (input) => {
    let query = supabase
      .from("invoices")
      .select("id, user_id, amount, status, description, due_date, payment_date, profiles ( first_name, last_name )")
      .eq("due_date", input.month);
    if (input.member_id) query = query.eq("user_id", input.member_id);

    const { data, error } = await query;
    if (error) return `Error consultando facturas: ${error.message}`;
    if (!data || data.length === 0) return "No hay facturas registradas para ese mes.";
    return JSON.stringify(data, null, 2);
  },
});

const registerPaymentParams = z.object({
  member_id: z.string().uuid().describe("id (uuid) del socio."),
  amount: z.number().positive().describe("Importe total cobrado, en euros."),
  month: z.string().regex(/^\d{4}-\d{2}-01$/).describe("Mes que se cobra, formato YYYY-MM-01."),
  description: z.string().nullable().optional().describe("Concepto de la factura (por defecto 'Cuota mensual')."),
  confirmed: z.boolean().nullable().optional(),
});

export async function registerPaymentImpl(input: z.infer<typeof registerPaymentParams>): Promise<string> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", input.member_id)
    .single();
  const nombre = profile ? `${profile.first_name} ${profile.last_name}` : input.member_id;

  if (input.confirmed !== true) {
    return pendingConfirmation(
      `Registrar cobro de ${input.amount}€ a ${nombre} correspondiente a ${input.month}`,
    );
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert([
      {
        user_id: input.member_id,
        amount: input.amount,
        description: input.description ?? "Cuota mensual",
        status: "pagada",
        due_date: input.month,
        payment_date: new Date().toISOString(),
      },
    ])
    .select()
    .single();
  if (invoiceError) return `Error creando la factura: ${invoiceError.message}`;

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ payment_status: "paid" })
    .eq("id", input.member_id);
  if (profileError) {
    return `Factura creada (${invoice.id}) pero hubo un error al actualizar el estado de pago del socio: ${profileError.message}`;
  }

  return `Pago registrado: factura ${invoice.id} de ${input.amount}€ para ${nombre}, estado de pago actualizado a "paid".`;
}

export const registerPayment = zodFunction({
  name: "register_payment",
  description:
    "Registra el cobro de la cuota mensual de un socio: crea una factura marcada como pagada y " +
    "actualiza el estado de pago del socio a 'paid'. La generación del PDF de la factura se sigue " +
    "haciendo desde la web, esto solo registra el pago en la base de datos. Al llamarla siempre " +
    "obtendrás un resumen pidiendo confirmación: muéstraselo al usuario tal cual, el propio " +
    "sistema se encarga de ejecutar o cancelar la acción.",
  parameters: registerPaymentParams.omit({ confirmed: true }),
  function: (input) => registerPaymentImpl({ ...input, confirmed: false }),
});
