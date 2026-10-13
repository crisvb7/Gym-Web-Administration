import { supabase } from "../supabaseClient.js";

type PlanTable = "workout_assignments" | "assigned_meals";

// Evita duplicar planes: antes de asignar rutina/comidas, mira si el socio ya tiene algo en esas
// mismas fechas. Sin replace_existing, no se guarda nada y se avisa al modelo; con él, lo de esas
// fechas se sustituye (para "rehazle la rutina de octubre") en saveReplacing().
export async function checkExistingPlan(
  table: PlanTable,
  memberId: string,
  dates: string[],
  replaceExisting: boolean,
): Promise<{ blocked: string | null; note: string; existingDates: string[] }> {
  const unique = [...new Set(dates)];
  const { data, error } = await supabase
    .from(table)
    .select("assigned_date")
    .eq("user_id", memberId)
    .in("assigned_date", unique);
  if (error) return { blocked: `Error comprobando el plan actual: ${error.message}`, note: "", existingDates: [] };

  const existingDates = [...new Set((data ?? []).map((r) => r.assigned_date as string))].sort();
  if (existingDates.length === 0) return { blocked: null, note: "", existingDates };

  const what = table === "workout_assignments" ? "ejercicios" : "comidas";
  if (!replaceExisting) {
    return {
      blocked: JSON.stringify({
        error: true,
        motivo:
          `El socio ya tiene ${data!.length} ${what} asignados en ${existingDates.length} de esas fechas ` +
          `(${existingDates.slice(0, 6).join(", ")}${existingDates.length > 6 ? "…" : ""}). No se ha guardado nada. ` +
          "Si el usuario ha pedido rehacer o sustituir el plan, vuelve a llamar con replace_existing=true. " +
          "Si no (p.ej. una tarea automática que ya se hizo), no asignes nada y explícalo.",
      }),
      note: "",
      existingDates,
    };
  }
  return {
    blocked: null,
    note: ` Sustituye ${data!.length} ${what} que ya tenía en ${existingDates.length} de esas fechas.`,
    existingDates,
  };
}

/**
 * Comprueba que todos los ids existen de verdad (el modelo a veces se los inventa). Se hace ANTES
 * de tocar nada, para que un id falso no deje el plan a medias.
 */
export async function findMissingIds(table: "exercises" | "recipes", ids: string[]): Promise<string[]> {
  const unique = [...new Set(ids)];
  const { data, error } = await supabase.from(table).select("id").in("id", unique);
  if (error) throw new Error(`Error comprobando ${table}: ${error.message}`);
  const found = new Set((data ?? []).map((r) => r.id as string));
  return unique.filter((id) => !found.has(id));
}

/**
 * Guarda las filas nuevas sustituyendo lo que hubiera en existingDates. Si la inserción falla tras
 * borrar, se restaura lo anterior: nunca se pierde el plan antiguo sin que quede el nuevo.
 */
export async function saveReplacing(
  table: PlanTable,
  memberId: string,
  existingDates: string[],
  inserts: Record<string, unknown>[],
): Promise<string | null> {
  let previous: Record<string, unknown>[] = [];
  if (existingDates.length > 0) {
    const { data, error } = await supabase.from(table).select("*").eq("user_id", memberId).in("assigned_date", existingDates);
    if (error) return `Error leyendo el plan anterior: ${error.message}`;
    previous = data ?? [];
    const { error: delError } = await supabase.from(table).delete().eq("user_id", memberId).in("assigned_date", existingDates);
    if (delError) return `Error sustituyendo el plan anterior: ${delError.message}`;
  }

  const { error } = await supabase.from(table).insert(inserts);
  if (!error) return null;

  if (previous.length > 0) {
    const { error: restoreError } = await supabase.from(table).insert(previous);
    if (restoreError) {
      return `Error guardando el plan nuevo (${error.message}) y NO se pudo restaurar el anterior (${restoreError.message}). Avisa al usuario.`;
    }
    return `Error guardando el plan nuevo: ${error.message}. No se ha cambiado nada (se ha restaurado el plan anterior).`;
  }
  return `Error guardando el plan: ${error.message}`;
}

/** Borra el plan de un socio en un rango de fechas. Devuelve cuántas filas había (o borró). */
export async function deletePlanRange(
  table: PlanTable,
  memberId: string,
  from: string,
  to: string,
  apply: boolean,
): Promise<{ count: number; error: string | null }> {
  if (!apply) {
    const { count, error } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("user_id", memberId)
      .gte("assigned_date", from)
      .lte("assigned_date", to);
    return { count: count ?? 0, error: error?.message ?? null };
  }
  const { count, error } = await supabase
    .from(table)
    .delete({ count: "exact" })
    .eq("user_id", memberId)
    .gte("assigned_date", from)
    .lte("assigned_date", to);
  return { count: count ?? 0, error: error?.message ?? null };
}
