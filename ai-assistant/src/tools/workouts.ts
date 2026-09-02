import { z } from "zod";
import { zodFunction } from "openai/helpers/zod";
import { supabase } from "../supabaseClient.js";
import { pendingConfirmation, scopeWarning } from "./confirmation.js";

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
      .limit(input.limit ?? 50);
    if (input.category) query = query.eq("category", input.category);
    if (input.search) query = query.ilike("name", `%${input.search}%`);

    const { data, error } = await query;
    if (error) return `Error consultando ejercicios: ${error.message}`;
    if (!data || data.length === 0) return "No se encontraron ejercicios con esos filtros.";
    return JSON.stringify(data, null, 2);
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
      .select("assigned_date, target_sets, target_reps, target_weight, exercises ( name, category )")
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

  if (confirmed !== true) {
    return pendingConfirmation(
      `Asignar a ${nombre} el plan "${plan_description}": ${days.length} días de entrenamiento ` +
        `(${rango}), ${totalExercises} ejercicios en total.`,
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
      superset_id: null,
      order_index: index,
    })),
  );

  const { error } = await supabase.from("workout_assignments").insert(inserts);
  if (error) return `Error asignando la rutina: ${error.message}`;

  return (
    `Rutina "${plan_description}" asignada correctamente a ${nombre}: ${inserts.length} ejercicios ` +
    `repartidos en ${days.length} días (${rango}).`
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
  function: (input) => assignWorkoutPlanImpl({ ...input, confirmed: false }),
});
