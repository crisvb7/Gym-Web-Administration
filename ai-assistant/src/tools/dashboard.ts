import { z } from "zod";
import { zodFunction } from "openai/helpers/zod";
import { supabase } from "../supabaseClient.js";

export const dashboardSummary = zodFunction({
  name: "dashboard_summary",
  description:
    "Devuelve un resumen general del gimnasio hoy: total de socios, clases de hoy, reservas de hoy, " +
    "entrenamientos registrados hoy y los últimos socios dados de alta. Útil para preguntas generales " +
    "como '¿cómo va el gimnasio hoy?'.",
  parameters: z.object({}),
  function: async () => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

    const [totalMembers, todaysClasses, todaysBookings, todaysWorkouts, recentMembers] = await Promise.all([
      supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "client"),
      supabase
        .from("classes")
        .select("id, title, start_time, trainer, max_capacity")
        .gte("start_time", todayStart)
        .lte("start_time", todayEnd),
      supabase
        .from("class_bookings")
        .select("id", { count: "exact", head: true })
        .gte("booked_at", todayStart)
        .lte("booked_at", todayEnd),
      supabase
        .from("workout_logs")
        .select("id", { count: "exact", head: true })
        .gte("logged_at", todayStart)
        .lte("logged_at", todayEnd),
      supabase
        .from("profiles")
        .select("id, first_name, last_name, created_at")
        .order("created_at", { ascending: false })
        .limit(3),
    ]);

    return JSON.stringify(
      {
        total_socios: totalMembers.count ?? 0,
        clases_hoy: todaysClasses.data ?? [],
        reservas_hoy: todaysBookings.count ?? 0,
        entrenamientos_registrados_hoy: todaysWorkouts.count ?? 0,
        ultimos_socios_dados_de_alta: recentMembers.data ?? [],
      },
      null,
      2,
    );
  },
});
