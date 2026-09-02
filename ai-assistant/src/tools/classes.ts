import { z } from "zod";
import { zodFunction } from "openai/helpers/zod";
import { supabase } from "../supabaseClient.js";
import { pendingConfirmation } from "./confirmation.js";

// z.string().datetime() por defecto SOLO acepta el sufijo "Z"; el modelo a veces genera
// "+00:00" (igual de válido en ISO 8601), que sin `offset: true` Zod rechaza como inválido.
const isoDateTime = () => z.string().datetime({ offset: true });

export const listClasses = zodFunction({
  name: "list_classes",
  description:
    "Lista las clases programadas en un rango de fechas, con su disciplina y número de reservas. " +
    "Si no se indican fechas, muestra las clases desde ahora hasta dentro de 7 días.",
  parameters: z.object({
    from: isoDateTime().nullable().optional().describe("Fecha/hora ISO de inicio del rango."),
    to: isoDateTime().nullable().optional().describe("Fecha/hora ISO de fin del rango."),
  }),
  function: async (input) => {
    const from = input.from ?? new Date().toISOString();
    const to = input.to ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // OJO: "discipline" es una columna de texto en "classes" (el nombre, p.ej. "CrossFit"), NO
    // una relación con la tabla "disciplines" — no hay foreign key entre ambas, así que no se
    // puede pedir un embed tipo `disciplines ( name )` aquí.
    const { data, error } = await supabase
      .from("classes")
      .select("id, title, start_time, end_time, trainer, location, max_capacity, discipline, intensity_badge, access_type, class_bookings ( id, status )")
      .gte("start_time", from)
      .lte("start_time", to)
      .order("start_time", { ascending: true });

    if (error) return `Error consultando clases: ${error.message}`;
    if (!data || data.length === 0) return "No hay clases programadas en ese rango de fechas.";

    const resumen = data.map((c: any) => ({
      id: c.id,
      title: c.title,
      start_time: c.start_time,
      end_time: c.end_time,
      trainer: c.trainer,
      location: c.location,
      max_capacity: c.max_capacity,
      disciplina: c.discipline,
      intensidad: c.intensity_badge,
      tipo_acceso: c.access_type,
      reservas_confirmadas: (c.class_bookings ?? []).filter((b: any) => b.status !== "cancelled").length,
    }));
    return JSON.stringify(resumen, null, 2);
  },
});

export const listDisciplines = zodFunction({
  name: "list_disciplines",
  description:
    "Lista las disciplinas/actividades disponibles (nombre y color). Úsalo antes de crear una " +
    "clase para saber qué nombres de disciplina son válidos (create_class usa el nombre, no un id).",
  parameters: z.object({}),
  function: async () => {
    const { data, error } = await supabase.from("disciplines").select("name, color").order("name");
    if (error) return `Error consultando disciplinas: ${error.message}`;
    return JSON.stringify(data ?? [], null, 2);
  },
});

const INTENSITY_LEVELS = ["Baja", "Media", "Alta"] as const;
const ACCESS_TYPES = ["NORMAL", "TARIFF"] as const;

const createClassParams = z.object({
  title: z.string().describe("Título de la clase, p.ej. 'CrossFit intermedio'."),
  start_time: isoDateTime().describe("Fecha/hora de inicio en ISO 8601."),
  end_time: isoDateTime().describe("Fecha/hora de fin en ISO 8601."),
  trainer: z.string().describe("Nombre del entrenador/a."),
  location: z.string().nullable().optional().describe("Sala o ubicación (por defecto 'Zona Principal')."),
  max_capacity: z.number().int().positive().describe("Aforo máximo."),
  discipline: z.string().nullable().optional().describe("Nombre de la disciplina (ver list_disciplines), p.ej. 'CrossFit'."),
  intensity_badge: z.enum(INTENSITY_LEVELS).nullable().optional().describe("Intensidad (por defecto 'Media')."),
  access_type: z.enum(ACCESS_TYPES).nullable().optional().describe("NORMAL (abierta) o TARIFF (exclusiva de tarifa fija). Por defecto NORMAL."),
  confirmed: z.boolean().nullable().optional(),
});

export async function createClassImpl(input: z.infer<typeof createClassParams>): Promise<string> {
  const { confirmed, ...rest } = input;
  const classData = {
    title: rest.title,
    start_time: rest.start_time,
    end_time: rest.end_time,
    trainer: rest.trainer,
    location: rest.location ?? "Zona Principal",
    max_capacity: rest.max_capacity,
    discipline: rest.discipline ?? null,
    intensity_badge: rest.intensity_badge ?? "Media",
    access_type: rest.access_type ?? "NORMAL",
  };

  if (confirmed !== true) {
    return pendingConfirmation(
      `Crear clase "${classData.title}" el ${classData.start_time} con ${classData.trainer} en ${classData.location} (aforo ${classData.max_capacity})`,
    );
  }

  const { data, error } = await supabase.from("classes").insert([classData]).select().single();
  if (error) return `Error creando la clase: ${error.message}`;
  return `Clase creada correctamente: ${JSON.stringify(data, null, 2)}`;
}

export const createClass = zodFunction({
  name: "create_class",
  description:
    "Crea una nueva clase en el horario. Usa list_disciplines primero si necesitas saber qué " +
    "nombres de disciplina existen. Al llamarla siempre obtendrás un resumen pidiendo " +
    "confirmación: muéstraselo al usuario tal cual, el propio sistema se encarga de ejecutar o " +
    "cancelar la acción.",
  parameters: createClassParams.omit({ confirmed: true }),
  function: (input) => createClassImpl({ ...input, confirmed: false }),
});
