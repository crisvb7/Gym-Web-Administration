import { listMembers, getMember, updateMember } from "../tools/members.js";
import { listClasses, listDisciplines, createClass } from "../tools/classes.js";
import { listInvoices, registerPayment } from "../tools/billing.js";
import { dashboardSummary } from "../tools/dashboard.js";
import { listExercises, listWorkoutPlan, assignWorkoutPlan, listPersonalRecords, deleteWorkoutPlan } from "../tools/workouts.js";
import { listRecipes, listMealPlan, assignMealPlan, deleteMealPlan } from "../tools/nutrition.js";
import { listClassBookings, listWorkoutLogs, listNutritionLogs, listCalorieGoalHistory } from "../tools/activity.js";

// Las mismas herramientas que el chat, menos las que necesitan el ordenador (carpeta de archivos)
// o gestionan las propias tareas. Son exactamente el mismo código: mismas comprobaciones de marcas
// personales, de planes duplicados y de ids inventados.
const tools = [
  listMembers,
  getMember,
  updateMember,
  listClasses,
  listDisciplines,
  createClass,
  listInvoices,
  registerPayment,
  dashboardSummary,
  listExercises,
  listWorkoutPlan,
  assignWorkoutPlan,
  deleteWorkoutPlan,
  listPersonalRecords,
  listRecipes,
  listMealPlan,
  assignMealPlan,
  deleteMealPlan,
  listClassBookings,
  listWorkoutLogs,
  listNutritionLogs,
  listCalorieGoalHistory,
];

interface RunnableTool {
  function: { name: string; description?: string; parameters?: Record<string, unknown>; strict?: boolean | null };
  $parseRaw(args: string): unknown;
  $callback?: (args: unknown) => unknown;
}

const byName = new Map((tools as unknown as RunnableTool[]).map((t) => [t.function.name, t]));

/** Definiciones para la Responses API de OpenAI. */
export const responseTools = (tools as unknown as RunnableTool[]).map((t) => ({
  type: "function" as const,
  name: t.function.name,
  description: t.function.description ?? null,
  parameters: t.function.parameters ?? {},
  strict: t.function.strict ?? true,
}));

/** Ejecuta una herramienta con los argumentos (JSON) que ha dado el modelo. Nunca lanza. */
export async function runCloudTool(name: string, args: string): Promise<string> {
  const tool = byName.get(name);
  if (!tool?.$callback) return `La herramienta "${name}" no está disponible en las tareas automáticas.`;
  try {
    const output = await tool.$callback(tool.$parseRaw(args));
    return typeof output === "string" ? output : JSON.stringify(output);
  } catch (err) {
    return `Error ejecutando ${name}: ${err instanceof Error ? err.message : String(err)}`;
  }
}
