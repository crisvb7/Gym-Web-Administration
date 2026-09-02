import { z } from "zod";
import { zodFunction } from "openai/helpers/zod";
import { supabase } from "../supabaseClient.js";
import { pendingConfirmation, scopeWarning } from "./confirmation.js";

const MEAL_TYPES = ["Desayuno", "Almuerzo", "Cena", "Snack", "Pre-Entreno", "Post-Entreno"] as const;

export const listRecipes = zodFunction({
  name: "list_recipes",
  description:
    "Busca platos/recetas en el catálogo de nutrición del gimnasio (tabla recipes), filtrando por " +
    "tipo de comida y/o nombre. Úsala siempre para obtener los recipe_id reales antes de asignar un " +
    "plan de comidas con assign_meal_plan: nunca inventes recipe_id ni nombres de platos que no " +
    "existan en el catálogo. Los campos calories/protein/carbs/fat casi siempre están a 0 porque no " +
    "se han rellenado en el sistema: si es así, ESTIMA tú los macros por el nombre del plato para " +
    "decidir cuáles encajan con el objetivo del cliente, no los ignores por estar a 0.",
  parameters: z.object({
    category: z.enum(MEAL_TYPES).nullable().optional().describe("Filtra por tipo de comida."),
    search: z.string().nullable().optional().describe("Texto a buscar en el nombre del plato."),
    limit: z.number().int().min(1).max(100).nullable().optional().describe("Máximo de resultados (por defecto 50)."),
  }),
  function: async (input) => {
    let query = supabase
      .from("recipes")
      .select("id, name, category, calories, protein, carbs, fat, description")
      .order("name")
      .limit(input.limit ?? 50);
    if (input.category) query = query.eq("category", input.category);
    if (input.search) query = query.ilike("name", `%${input.search}%`);

    const { data, error } = await query;
    if (error) return `Error consultando recetas: ${error.message}`;
    if (!data || data.length === 0) return "No se encontraron platos con esos filtros en el catálogo.";

    const allMacrosMissing = data.every((r) => !r.calories && !r.protein && !r.carbs && !r.fat);
    if (allMacrosMissing) {
      return JSON.stringify(
        {
          aviso:
            "Estos platos no tienen calories/protein/carbs/fat rellenados en el sistema (están a " +
            "0). ESTIMA tú los macros aproximados de cada uno por su nombre para poder elegir los " +
            "más adecuados al objetivo del cliente (p.ej. para bajar de peso, prioriza los de menor " +
            "caloría estimada y mayor proteína). Indica en tu resumen que son estimaciones tuyas, no " +
            "datos verificados del catálogo.",
          resultados: data,
        },
        null,
        2,
      );
    }

    return JSON.stringify(data, null, 2);
  },
});

export const listMealPlan = zodFunction({
  name: "list_meal_plan",
  description:
    "Lista los platos ya asignados a un socio en un rango de fechas (su plan de comidas). Úsala " +
    "para revisar si ya tiene un plan asignado, o para responder qué debe comer un socio.",
  parameters: z.object({
    member_id: z.string().uuid().describe("id (uuid) del socio."),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Fecha inicial, formato YYYY-MM-DD."),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Fecha final, formato YYYY-MM-DD."),
  }),
  function: async (input) => {
    const { data, error } = await supabase
      .from("assigned_meals")
      .select("assigned_date, meal_type, recipes ( name, category, calories )")
      .eq("user_id", input.member_id)
      .gte("assigned_date", input.from)
      .lte("assigned_date", input.to)
      .order("assigned_date", { ascending: true });

    if (error) return `Error consultando el plan de comidas: ${error.message}`;
    if (!data || data.length === 0) return "No hay platos asignados en ese rango de fechas.";
    return JSON.stringify(data, null, 2);
  },
});

const mealEntry = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Fecha del día, formato YYYY-MM-DD."),
  meal_type: z.enum(MEAL_TYPES).describe("Tipo de comida (Desayuno, Almuerzo, Cena, Snack, Pre-Entreno o Post-Entreno)."),
  recipe_id: z.string().uuid().describe("id real del plato, obtenido con list_recipes."),
});

const assignMealPlanParams = z.object({
  member_id: z.string().uuid().describe("id (uuid) del socio al que se le asigna el plan."),
  plan_description: z
    .string()
    .describe("Descripción breve del plan y su objetivo, p.ej. 'Déficit calórico - diciembre 2026'."),
  meals: z.array(mealEntry).min(1).describe("Lista de comidas a asignar (una entrada por día y tipo de comida)."),
  confirmed: z.boolean().nullable().optional(),
});

export async function assignMealPlanImpl(input: z.infer<typeof assignMealPlanParams>): Promise<string> {
  const { member_id, plan_description, meals, confirmed } = input;

  const warning = scopeWarning(plan_description, meals.map((m) => m.date));
  if (warning) return warning;

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", member_id)
    .single();
  const nombre = profile ? `${profile.first_name} ${profile.last_name}` : member_id;

  const dates = [...meals.map((m) => m.date)].sort();
  const rango = dates.length > 1 ? `${dates[0]} → ${dates[dates.length - 1]}` : dates[0];

  if (confirmed !== true) {
    return pendingConfirmation(
      `Asignar a ${nombre} el plan de comidas "${plan_description}": ${meals.length} comidas (${rango}).`,
    );
  }

  const inserts = meals.map((meal) => ({
    user_id: member_id,
    recipe_id: meal.recipe_id,
    assigned_date: meal.date,
    meal_type: meal.meal_type,
  }));

  const { error } = await supabase.from("assigned_meals").insert(inserts);
  if (error) return `Error asignando el plan de comidas: ${error.message}`;

  return (
    `Plan de comidas "${plan_description}" asignado correctamente a ${nombre}: ${inserts.length} comidas ` +
    `repartidas entre ${rango}.`
  );
}

export const assignMealPlan = zodFunction({
  name: "assign_meal_plan",
  description:
    "Crea/asigna un plan de comidas completo a un socio a partir de platos reales del catálogo " +
    "(tabla recipes): uno o varios días, cada uno con sus comidas (Desayuno, Almuerzo, Cena, etc.). " +
    "Sirve tanto para un solo día como para un mes completo — si se pide un mes, DEBES incluir " +
    "todos los días de ese mes en la misma llamada (no solo una semana de muestra), o la " +
    "herramienta la rechazará. Usa list_recipes primero para obtener recipe_id reales. NUNCA uses " +
    "update_member ni cambies la cuota (fee/nutrition_fee) para esto: asignar comidas y cobrar una " +
    "cuota son cosas distintas. Al llamarla siempre obtendrás un resumen pidiendo confirmación: " +
    "muéstraselo al usuario tal cual, el propio sistema se encarga de ejecutar o cancelar la acción.",
  parameters: assignMealPlanParams.omit({ confirmed: true }),
  function: (input) => assignMealPlanImpl({ ...input, confirmed: false }),
});
