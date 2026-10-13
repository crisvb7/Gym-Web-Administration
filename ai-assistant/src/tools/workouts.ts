import { z } from "zod";
import { zodFunction } from "openai/helpers/zod";
import { supabase } from "../supabaseClient.js";
import { pendingConfirmation, scopeWarning } from "./confirmation.js";
import { confirmationRequired } from "../writeMode.js";
import { checkExistingPlan, deletePlanRange, findMissingIds, saveReplacing } from "./existingPlan.js";
import { checkAgainstPersonalRecords } from "./personalRecordsCheck.js";

const EXERCISE_CATEGORIES = [
  "Pecho",
  "Espalda",
  "Pierna",
  "Hombro",
  "Brazo",
  "Core",
  "Cardio",
  "CrossFit",
  "Otros",
] as const;

export const listExercises = zodFunction({
  name: "list_exercises",
  description:
    "Busca ejercicios en la biblioteca del gimnasio, filtrando por categoría y/o nombre. Úsala " +
    "siempre para obtener los exercise_id reales antes de crear una rutina con " +
    "assign_workout_plan: nunca inventes ids ni nombres de ejercicios que no existan en la " +
    "biblioteca.",
  parameters: z.object({
    category: z
      .enum(EXERCISE_CATEGORIES)
      .nullable()
      .optional()
      .describe("Filtra por categoría exacta."),
    search: z.string().nullable().optional().describe("Texto a buscar en el nombre del ejercicio."),
    limit: z.number().int().min(1).max(100).nullable().optional().describe("Máximo de resultados (por defecto 50)."),
  }),
  function: async (input) => {
    let query = supabase
      .from("exercises")
      .select("id, name, category, description, kcal_estimate")
      .order("name")
      .limit(Math.max(input.limit ?? 50, 15)); // mínimo 15: con 1 resultado el modelo se queda con la primera variante que encaje
    if (input.category) query = query.eq("category", input.category);
    if (input.search) query = query.ilike("name", `%${input.search}%`);

    const { data, error } = await query;
    if (error) return `Error consultando ejercicios: ${error.message}`;
    if (!data || data.length === 0) return "No se encontraron ejercicios con esos filtros.";
    return JSON.stringify(data, null, 2);
  },
});

export const listPersonalRecords = zodFunction({
  name: "list_personal_records",
  description:
    "Consulta las marcas personales (récords de peso, PRs) de un socio: el peso máximo (kg) que ha " +
    "levantado en cada ejercicio, calculado a partir de sus entrenamientos registrados. Úsala SIEMPRE " +
    "antes de diseñar o ajustar una rutina (assign_workout_plan) cuando el objetivo sea mantener o " +
    "progresar la carga de un socio, para no asignar pesos por debajo de lo que ya levanta ni saltos " +
    "poco realistas: si no se indica lo contrario, mantén o incrementa progresivamente (p.ej. +2.5-5% " +
    "o el siguiente incremento razonable de disco) el peso de cada ejercicio respecto a su récord " +
    "actual, en vez de reiniciar desde cero.",
  parameters: z.object({
    member_id: z.string().uuid().describe("id (uuid) del socio."),
  }),
  function: async (input) => {
    // personal_records es una vista (logs + ajustes manuales con FULL OUTER JOIN) y PostgREST no
    // puede enlazarla con exercises: los nombres de los ejercicios se buscan en una segunda consulta.
    const { data, error } = await supabase
      .from("personal_records")
      .select("exercise_id, max_weight_kg, achieved_at, logs_count, is_manual_override")
      .eq("user_id", input.member_id)
      .order("max_weight_kg", { ascending: false });

    if (error) return `Error consultando las marcas personales: ${error.message}`;
    if (!data || data.length === 0) return "Este socio todavía no tiene ningún récord registrado (sin entrenamientos con peso guardados).";

    const { data: exercises, error: exError } = await supabase
      .from("exercises")
      .select("id, name, category")
      .in("id", [...new Set(data.map((r) => r.exercise_id))]);
    if (exError) return `Error consultando los ejercicios de las marcas: ${exError.message}`;
    const byId = new Map((exercises ?? []).map((e) => [e.id, e]));

    return JSON.stringify(
      data.map((r) => ({
        exercise_id: r.exercise_id,
        ejercicio: byId.get(r.exercise_id)?.name?.trim() ?? "(ejercicio desconocido)",
        categoria: byId.get(r.exercise_id)?.category ?? null,
        max_weight_kg: r.max_weight_kg,
        fecha: r.achieved_at ? String(r.achieved_at).slice(0, 10) : null,
        registros: r.logs_count,
        ajustado_a_mano_por_el_entrenador: r.is_manual_override,
      })),
      null,
      2,
    );
  },
});

export const listWorkoutPlan = zodFunction({
  name: "list_workout_plan",
  description:
    "Lista los ejercicios ya asignados a un socio en un rango de fechas (su rutina). Úsala para " +
    "revisar si ya tiene un plan asignado antes de crear uno nuevo, o para responder qué rutina " +
    "tiene un socio.",
  parameters: z.object({
    member_id: z.string().uuid().describe("id (uuid) del socio."),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Fecha inicial, formato YYYY-MM-DD."),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Fecha final, formato YYYY-MM-DD."),
  }),
  function: async (input) => {
    const { data, error } = await supabase
      .from("workout_assignments")
      .select("assigned_date, target_sets, target_reps, target_weight, coach_notes, exercises ( name, category )")
      .eq("user_id", input.member_id)
      .gte("assigned_date", input.from)
      .lte("assigned_date", input.to)
      .order("assigned_date", { ascending: true });

    if (error) return `Error consultando la rutina: ${error.message}`;
    if (!data || data.length === 0) return "No hay ejercicios asignados en ese rango de fechas.";
    return JSON.stringify(data, null, 2);
  },
});

const workoutExercise = z.object({
  exercise_id: z.string().uuid().describe("id real del ejercicio, obtenido con list_exercises."),
  target_sets: z.number().int().positive().describe("Número de series."),
  target_reps: z.number().int().positive().describe("Repeticiones por serie."),
  target_weight: z
    .number()
    .nonnegative()
    .nullable()
    .optional()
    .describe("Peso en kg (0 o vacío si es un ejercicio con peso corporal)."),
  coach_notes: z
    .string()
    .nullable()
    .optional()
    .describe("Nota breve del entrenador para el socio (técnica, descanso, adaptación por lesión...). Opcional."),
});

const workoutDay = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Fecha del día de entrenamiento, formato YYYY-MM-DD."),
  exercises: z.array(workoutExercise).min(1).describe("Ejercicios asignados ese día, en el orden en que se realizan."),
});

const assignWorkoutPlanParams = z.object({
  member_id: z.string().uuid().describe("id (uuid) del socio al que se le asigna la rutina."),
  plan_description: z
    .string()
    .describe("Descripción breve del plan y su objetivo, p.ej. 'Pérdida de peso - diciembre 2026'."),
  days: z.array(workoutDay).min(1).describe("Lista de días de entrenamiento con sus ejercicios."),
  replace_existing: z
    .boolean()
    .nullable()
    .optional()
    .describe("true SOLO si el usuario pide rehacer/sustituir un plan que el socio ya tiene en esas fechas."),
  personal_records_justification: z
    .string()
    .nullable()
    .optional()
    .describe(
      "Motivo por el que algún peso se aparta más de un 10 % de la marca personal del socio (descarga, " +
        "lesión...). Rellénalo solo si la herramienta te lo pide.",
    ),
  user_set_weight_exercise_ids: z
    .array(z.string().uuid())
    .nullable()
    .optional()
    .describe(
      "exercise_id de los ejercicios cuyo peso ha indicado el usuario explícitamente (en el chat o en la " +
        "instrucción de la tarea). Esos pesos mandan sobre sus marcas personales y no se comprueban.",
    ),
  ignore_personal_records: z
    .boolean()
    .nullable()
    .optional()
    .describe("true SOLO si el usuario ha pedido expresamente no tener en cuenta las marcas personales del socio."),
  confirmed: z.boolean().nullable().optional(),
});

export async function assignWorkoutPlanImpl(input: z.infer<typeof assignWorkoutPlanParams>): Promise<string> {
  const { member_id, plan_description, days, confirmed } = input;

  const dates = days.map((d) => d.date);
  const warning = scopeWarning(plan_description, dates);
  if (warning) return warning;

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", member_id)
    .single();
  const nombre = profile ? `${profile.first_name} ${profile.last_name}` : member_id;

  const totalExercises = days.reduce((sum, day) => sum + day.exercises.length, 0);
  const sortedDates = [...dates].sort();
  const rango = sortedDates.length > 1 ? `${sortedDates[0]} → ${sortedDates[sortedDates.length - 1]}` : sortedDates[0];

  const records = input.ignore_personal_records
    ? { blocked: null, note: " Marcas personales omitidas a petición del usuario." }
    : await checkAgainstPersonalRecords(
        member_id,
        days.flatMap((d) => d.exercises),
        input.personal_records_justification,
        input.user_set_weight_exercise_ids ?? [],
      );
  if (records.blocked) return records.blocked;

  const missing = await findMissingIds("exercises", days.flatMap((d) => d.exercises.map((e) => e.exercise_id)));
  if (missing.length > 0) {
    return JSON.stringify({
      error: true,
      motivo:
        `No se ha guardado nada: estos exercise_id no existen en la biblioteca: ${missing.join(", ")}. ` +
        "Usa solo ids reales obtenidos con list_exercises. (Para BORRAR una rutina usa delete_workout_plan, nunca esta herramienta.)",
    });
  }

  const existing = await checkExistingPlan("workout_assignments", member_id, dates, input.replace_existing === true);
  if (existing.blocked) return existing.blocked;

  if (confirmed !== true) {
    return pendingConfirmation(
      `Asignar a ${nombre} el plan "${plan_description}": ${days.length} días de entrenamiento ` +
        `(${rango}), ${totalExercises} ejercicios en total.${existing.note}${records.note}`,
    );
  }

  const inserts = days.flatMap((day) =>
    day.exercises.map((exercise, index) => ({
      user_id: member_id,
      exercise_id: exercise.exercise_id,
      assigned_date: day.date,
      target_sets: exercise.target_sets,
      target_reps: exercise.target_reps,
      target_weight: exercise.target_weight ?? 0,
      coach_notes: exercise.coach_notes?.trim() || null,
      superset_id: null,
      order_index: index,
    })),
  );

  const saveError = await saveReplacing("workout_assignments", member_id, existing.existingDates, inserts);
  if (saveError) return saveError;

  return (
    `Rutina "${plan_description}" asignada correctamente a ${nombre}: ${inserts.length} ejercicios ` +
    `repartidos en ${days.length} días (${rango}).${existing.note}${records.note}`
  );
}

export const assignWorkoutPlan = zodFunction({
  name: "assign_workout_plan",
  description:
    "Crea/asigna una rutina de entrenamiento completa a un socio: uno o varios días, cada uno con " +
    "sus ejercicios (sets, reps y peso). Sirve tanto para un solo día como para un plan de varias " +
    "semanas o un mes completo — si se pide un mes, DEBES incluir todos los días de entrenamiento " +
    "de ese mes en la misma llamada (no solo una semana de muestra), o la herramienta la rechazará. " +
    "Usa list_exercises primero para obtener exercise_id reales. Al llamarla siempre obtendrás un " +
    "resumen pidiendo confirmación: muéstraselo al usuario tal cual, el propio sistema se encarga " +
    "de ejecutar o cancelar la acción.",
  parameters: assignWorkoutPlanParams.omit({ confirmed: true }),
  function: (input) => assignWorkoutPlanImpl({ ...input, confirmed: !confirmationRequired() }),
});

const deleteWorkoutPlanParams = z.object({
  member_id: z.string().uuid().describe("id (uuid) del socio."),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Primer día a borrar, YYYY-MM-DD."),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Último día a borrar (incluido), YYYY-MM-DD."),
  confirmed: z.boolean().nullable().optional(),
});

export async function deleteWorkoutPlanImpl(input: z.infer<typeof deleteWorkoutPlanParams>): Promise<string> {
  const { member_id, from, to, confirmed } = input;
  const { data: profile } = await supabase.from("profiles").select("first_name, last_name").eq("id", member_id).single();
  const nombre = profile ? `${profile.first_name} ${profile.last_name}` : member_id;

  const result = await deletePlanRange("workout_assignments", member_id, from, to, confirmed === true);
  if (result.error) return `Error borrando la rutina: ${result.error}`;
  if (result.count === 0) return `${nombre} no tiene ejercicios asignados entre ${from} y ${to}: no hay nada que borrar.`;
  if (confirmed !== true) {
    return pendingConfirmation(`Borrar la rutina de ${nombre} entre ${from} y ${to}: ${result.count} ejercicios asignados.`);
  }
  return `Rutina borrada: ${result.count} ejercicios asignados a ${nombre} entre ${from} y ${to}.`;
}

export const deleteWorkoutPlan = zodFunction({
  name: "delete_workout_plan",
  description:
    "Borra los ejercicios asignados (la rutina) de un socio en un rango de fechas, p.ej. 'borra la " +
    "rutina de octubre de Juan'. Es la ÚNICA forma de borrar una rutina: nunca uses " +
    "assign_workout_plan para eso. No borra los entrenamientos que el socio ya registró.",
  parameters: deleteWorkoutPlanParams.omit({ confirmed: true }),
  function: (input) => deleteWorkoutPlanImpl({ ...input, confirmed: !confirmationRequired() }),
});
