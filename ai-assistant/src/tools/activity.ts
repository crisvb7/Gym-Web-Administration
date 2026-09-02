import { z } from "zod";
import { zodFunction } from "openai/helpers/zod";
import { supabase } from "../supabaseClient.js";

const isoDate = () => z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Fecha, formato YYYY-MM-DD.");

export const listClassBookings = zodFunction({
  name: "list_class_bookings",
  description:
    "Lista reservas de clases: quién está apuntado a una clase concreta (usa class_id), o a qué " +
    "clases se ha apuntado un socio concreto (usa member_id). Pasa al menos uno de los dos. Útil " +
    "para '¿quién viene a la clase de las 18:00?' o '¿a qué clases se ha apuntado Juan esta semana?'.",
  parameters: z.object({
    class_id: z.string().uuid().nullable().optional().describe("Filtra por una clase concreta."),
    member_id: z.string().uuid().nullable().optional().describe("Filtra por un socio concreto."),
    status: z
      .enum(["ACTIVE", "CANCELLED"])
      .nullable()
      .optional()
      .describe("Filtra por estado de la reserva (por defecto todas)."),
    from: isoDate().nullable().optional().describe("Fecha inicial de la reserva (booked_at)."),
    to: isoDate().nullable().optional().describe("Fecha final de la reserva (booked_at)."),
    limit: z.number().int().min(1).max(200).nullable().optional().describe("Máximo de resultados (por defecto 50)."),
  }),
  function: async (input) => {
    if (!input.class_id && !input.member_id) {
      return "Especifica al menos class_id o member_id para no listar todas las reservas del sistema.";
    }
    let query = supabase
      .from("class_bookings")
      .select(
        "id, booked_at, status, booking_type, classes ( title, start_time ), profiles!class_bookings_user_id_fkey ( first_name, last_name, email )",
      )
      .order("booked_at", { ascending: false })
      .limit(input.limit ?? 50);

    if (input.class_id) query = query.eq("class_id", input.class_id);
    if (input.member_id) query = query.eq("user_id", input.member_id);
    if (input.status) query = query.eq("status", input.status);
    if (input.from) query = query.gte("booked_at", input.from);
    if (input.to) query = query.lte("booked_at", `${input.to}T23:59:59`);

    const { data, error } = await query;
    if (error) return `Error consultando reservas: ${error.message}`;
    if (!data || data.length === 0) return "No se encontraron reservas con esos filtros.";
    return JSON.stringify(data, null, 2);
  },
});

export const listWorkoutLogs = zodFunction({
  name: "list_workout_logs",
  description:
    "Lista los entrenamientos que un socio ha REGISTRADO como completados (distinto de " +
    "list_workout_plan, que muestra lo asignado/planificado). Útil para '¿ha entrenado esta " +
    "semana?' o '¿qué ejercicios ha hecho realmente?'.",
  parameters: z.object({
    member_id: z.string().uuid().describe("id (uuid) del socio."),
    from: isoDate().nullable().optional().describe("Fecha inicial (por defecto, últimos 30 días)."),
    to: isoDate().nullable().optional().describe("Fecha final (por defecto, hoy)."),
    limit: z.number().int().min(1).max(200).nullable().optional().describe("Máximo de resultados (por defecto 50)."),
  }),
  function: async (input) => {
    const to = input.to ?? new Date().toISOString().split("T")[0];
    const from = input.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const { data, error } = await supabase
      .from("workout_logs")
      .select("id, logged_at, exercises ( name, category )")
      .eq("user_id", input.member_id)
      .gte("logged_at", from)
      .lte("logged_at", `${to}T23:59:59`)
      .order("logged_at", { ascending: false })
      .limit(input.limit ?? 50);

    if (error) return `Error consultando entrenamientos registrados: ${error.message}`;
    if (!data || data.length === 0) return "No hay entrenamientos registrados en ese rango de fechas.";
    return JSON.stringify(data, null, 2);
  },
});

export const listNutritionLogs = zodFunction({
  name: "list_nutrition_logs",
  description:
    "Lista las comidas que un socio ha REGISTRADO (distinto de list_meal_plan, que muestra lo " +
    "asignado/planificado). Incluye tanto lo que el socio registra desde la app como lo planificado " +
    "por un entrenador (is_planned). Útil para '¿qué ha comido esta semana?' o '¿cuántas calorías " +
    "lleva hoy?'.",
  parameters: z.object({
    member_id: z.string().uuid().describe("id (uuid) del socio."),
    from: isoDate().nullable().optional().describe("Fecha inicial (por defecto, últimos 7 días)."),
    to: isoDate().nullable().optional().describe("Fecha final (por defecto, hoy)."),
    limit: z.number().int().min(1).max(200).nullable().optional().describe("Máximo de resultados (por defecto 50)."),
  }),
  function: async (input) => {
    const to = input.to ?? new Date().toISOString().split("T")[0];
    const from = input.from ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const { data, error } = await supabase
      .from("nutrition_logs")
      .select("id, food_name, calories, protein, carbs, fat, is_planned, logged_at")
      .eq("user_id", input.member_id)
      .gte("logged_at", from)
      .lte("logged_at", `${to}T23:59:59`)
      .order("logged_at", { ascending: false })
      .limit(input.limit ?? 50);

    if (error) return `Error consultando comidas registradas: ${error.message}`;
    if (!data || data.length === 0) return "No hay comidas registradas en ese rango de fechas.";
    return JSON.stringify(data, null, 2);
  },
});

export const listCalorieGoalHistory = zodFunction({
  name: "list_calorie_goal_history",
  description: "Muestra el histórico de objetivos calóricos diarios (daily_kcal_goal) de un socio, con la fecha desde la que aplica cada uno.",
  parameters: z.object({
    member_id: z.string().uuid().describe("id (uuid) del socio."),
  }),
  function: async (input) => {
    const { data, error } = await supabase
      .from("calorie_goal_history")
      .select("daily_kcal_goal, effective_date")
      .eq("user_id", input.member_id)
      .order("effective_date", { ascending: false });

    if (error) return `Error consultando el histórico de objetivo calórico: ${error.message}`;
    if (!data || data.length === 0) return "Este socio no tiene histórico de objetivo calórico.";
    return JSON.stringify(data, null, 2);
  },
});
