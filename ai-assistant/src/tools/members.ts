import { z } from "zod";
import { zodFunction } from "openai/helpers/zod";
import { supabase } from "../supabaseClient.js";
import { pendingConfirmation } from "./confirmation.js";

export const listMembers = zodFunction({
  name: "list_members",
  description:
    "Busca socios (profiles) del gimnasio por nombre, apellido y/o email, y/o filtra por estado de " +
    "pago. Usa esto para encontrar el id de un socio antes de actualizarlo (o antes de usar " +
    "get_member/update_member/register_payment/assign_workout_plan/assign_meal_plan), o para " +
    'responder preguntas como "¿quién tiene el pago pendiente?". Si el usuario da el nombre ' +
    "completo, el email, o solo una parte, pásalo tal cual en 'search': la búsqueda es flexible y " +
    "no distingue mayúsculas. IMPORTANTE: puede haber socios distintos con el mismo nombre y " +
    "apellido (personas diferentes) — si la respuesta incluye un 'aviso' de nombres duplicados, NO " +
    "elijas ninguno por tu cuenta, pregunta al usuario cuál es (usando el email para diferenciarlos).",
  parameters: z.object({
    search: z
      .string()
      .nullable()
      .optional()
      .describe(
        "Texto a buscar: nombre, apellido, nombre completo, o email (búsqueda parcial, insensible " +
          "a mayúsculas). Si son varias palabras (p.ej. nombre y apellido), cada una debe " +
          "encontrarse en el nombre, apellido o email del socio.",
      ),
    payment_status: z
      .enum(["paid", "pending"])
      .nullable()
      .optional()
      .describe("Filtra por estado de pago."),
    role: z
      .enum(["client", "admin"])
      .nullable()
      .optional()
      .describe("Filtra por rol. Por defecto solo se listan clientes."),
    limit: z.number().int().min(1).max(100).nullable().optional().describe("Máximo de resultados (por defecto 20)."),
  }),
  function: async (input) => {
    let query = supabase
      .from("profiles")
      .select("id, first_name, last_name, email, role, fee, nutrition_fee, payment_status, created_at")
      .eq("role", input.role ?? "client")
      .order("first_name", { ascending: true })
      .limit(input.limit ?? 20);

    if (input.payment_status) {
      query = query.eq("payment_status", input.payment_status);
    }
    if (input.search) {
      // Si el usuario busca "Nombre Apellido" (o nombre + email), cada palabra debe aparecer en el
      // nombre, apellido o email (encadenar .or() por palabra las combina con AND), así
      // encontramos coincidencias aunque la búsqueda cruce varias columnas.
      const words = input.search.trim().split(/\s+/).filter(Boolean);
      for (const word of words) {
        query = query.or(`first_name.ilike.%${word}%,last_name.ilike.%${word}%,email.ilike.%${word}%`);
      }
    }

    const { data, error } = await query;
    if (error) return `Error consultando socios: ${error.message}`;
    if (!data || data.length === 0) return "No se encontraron socios con esos filtros.";

    // Si dos socios distintos comparten nombre y apellido, el modelo NO debe elegir uno al azar:
    // se lo marcamos explícitamente en el propio resultado para forzar la desambiguación.
    const nameCounts = new Map<string, number>();
    for (const m of data) {
      const key = `${m.first_name} ${m.last_name}`.trim().toLowerCase();
      nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
    }
    const hasDuplicateName = [...nameCounts.values()].some((count) => count > 1);

    if (hasDuplicateName) {
      return JSON.stringify(
        {
          aviso:
            "Hay varios socios distintos con el mismo nombre y apellido. NO elijas ninguno por tu " +
            "cuenta: muéstraselos todos al usuario (diferénciales por el email) y pregunta cuál de " +
            "ellos es antes de usar cualquier herramienta que lea o modifique sus datos.",
          resultados: data,
        },
        null,
        2,
      );
    }

    return JSON.stringify(data, null, 2);
  },
});

export const getMember = zodFunction({
  name: "get_member",
  description:
    "Obtiene el detalle completo de un socio por su id, incluyendo sus últimas facturas y sus " +
    "próximas reservas de clases. Usa list_members primero si no conoces el id.",
  parameters: z.object({
    member_id: z.string().uuid().describe("id (uuid) del socio."),
  }),
  function: async (input) => {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", input.member_id)
      .single();
    if (error || !profile) return `No se encontró ningún socio con id ${input.member_id}.`;

    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, amount, status, due_date, description")
      .eq("user_id", input.member_id)
      .order("due_date", { ascending: false })
      .limit(5);

    const { data: bookings } = await supabase
      .from("class_bookings")
      .select("id, status, classes ( title, start_time )")
      .eq("user_id", input.member_id)
      .order("booked_at", { ascending: false })
      .limit(5);

    return JSON.stringify({ profile, ultimas_facturas: invoices ?? [], ultimas_reservas: bookings ?? [] }, null, 2);
  },
});

const updateMemberParams = z.object({
  member_id: z.string().uuid().describe("id (uuid) del socio a actualizar."),
  fee: z.number().nonnegative().nullable().optional().describe("Nueva cuota mensual en euros."),
  nutrition_fee: z.number().nonnegative().nullable().optional().describe("Nueva cuota de nutrición en euros."),
  payment_status: z.enum(["paid", "pending"]).nullable().optional().describe("Nuevo estado de pago."),
  // Solo lo pone a true la ejecución directa del servidor tras el clic en "Confirmar"; nunca se
  // expone al modelo (ver parameters de updateMember más abajo).
  confirmed: z.boolean().nullable().optional(),
});

export async function updateMemberImpl(input: z.infer<typeof updateMemberParams>): Promise<string> {
  const { member_id, confirmed, ...changes } = input;
  const fieldsToUpdate = Object.fromEntries(
    Object.entries(changes).filter(([, v]) => v !== undefined && v !== null),
  );
  if (Object.keys(fieldsToUpdate).length === 0) {
    return "No se especificó ningún campo para actualizar.";
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", member_id)
    .single();
  const nombre = profile ? `${profile.first_name} ${profile.last_name}` : member_id;

  if (confirmed !== true) {
    return pendingConfirmation(`Actualizar a ${nombre} con ${JSON.stringify(fieldsToUpdate)}`);
  }

  const { error } = await supabase.from("profiles").update(fieldsToUpdate).eq("id", member_id);
  if (error) return `Error actualizando socio: ${error.message}`;
  return `Socio ${nombre} actualizado correctamente con ${JSON.stringify(fieldsToUpdate)}.`;
}

export const updateMember = zodFunction({
  name: "update_member",
  description:
    "Actualiza datos administrativos/de facturación de un socio: cuota (fee), cuota de nutrición " +
    "(nutrition_fee) o estado de pago (payment_status). Esto es solo dinero/facturación: NO uses " +
    "esta herramienta para asignar rutinas de ejercicio (usa assign_workout_plan) ni planes de " +
    "comidas (usa assign_meal_plan) — son cosas distintas. Pide confirmación al usuario antes de " +
    "aplicar el cambio. Usa list_members/get_member primero para confirmar el id correcto. Al " +
    "llamarla siempre obtendrás un resumen pidiendo confirmación: muéstraselo al usuario tal cual, " +
    "el propio sistema se encarga de ejecutar o cancelar la acción cuando el usuario responda — no " +
    "puedes ni necesitas volver a llamar esta herramienta para confirmarla.",
  // El modelo nunca ve ni puede rellenar "confirmed": toda llamada suya devuelve el resumen
  // pendiente. Solo el servidor ejecuta la acción real, con confirmed:true, fuera de este flujo.
  parameters: updateMemberParams.omit({ confirmed: true }),
  function: (input) => updateMemberImpl({ ...input, confirmed: false }),
});
