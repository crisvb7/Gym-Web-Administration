import { supabase } from "../supabaseClient.js";

// Las marcas personales del socio se tienen en cuenta SIEMPRE al guardar una rutina (no depende de
// que el modelo se acuerde de consultarlas): si un peso se aleja más de un 10 % de su marca en ese
// ejercicio sin un motivo explicado, la rutina se rechaza enseñándole al modelo las marcas.
const TOLERANCE = 0.1;

interface PlannedExercise {
  exercise_id: string;
  target_weight?: number | null;
}

export interface RecordsCheck {
  /** Mensaje de rechazo (JSON) si hay pesos fuera de marca sin justificar; null si se puede guardar. */
  blocked: string | null;
  /** Nota para el resumen/resultado. */
  note: string;
}

export async function checkAgainstPersonalRecords(
  memberId: string,
  planned: PlannedExercise[],
  justification: string | null | undefined,
  userSetExerciseIds: string[] = [],
): Promise<RecordsCheck> {
  // Los pesos que el usuario ha dictado (chat o instrucción de la tarea) mandan sobre las marcas:
  // esos ejercicios no se comprueban.
  const userSet = new Set(userSetExerciseIds);
  const userNote = userSet.size > 0 ? ` ${userSet.size} ejercicio(s) con el peso indicado por el usuario.` : "";
  const exerciseIds = [...new Set(planned.map((p) => p.exercise_id))].filter((id) => !userSet.has(id));
  if (exerciseIds.length === 0) return { blocked: null, note: userNote };
  const { data: records, error } = await supabase
    .from("personal_records")
    .select("exercise_id, max_weight_kg")
    .eq("user_id", memberId)
    .in("exercise_id", exerciseIds);
  if (error) return { blocked: `Error consultando las marcas personales del socio: ${error.message}`, note: "" };

  const withRecord = (records ?? []).filter((r) => Number(r.max_weight_kg) > 0);
  if (withRecord.length === 0) {
    return { blocked: null, note: ` El socio no tiene marcas registradas en estos ejercicios.${userNote}` };
  }

  const { data: exercises } = await supabase
    .from("exercises")
    .select("id, name, category")
    .in("id", withRecord.map((r) => r.exercise_id));
  const info = new Map((exercises ?? []).map((e) => [e.id, e]));

  const deviations: string[] = [];
  for (const record of withRecord) {
    const pr = Number(record.max_weight_kg);
    const exercise = info.get(record.exercise_id);
    const weights = planned.filter((p) => p.exercise_id === record.exercise_id).map((p) => Number(p.target_weight ?? 0));
    // En cardio el "peso" no es una carga real: un 0 ahí no es un error.
    const relevant = exercise?.category?.toLowerCase().includes("cardio") ? weights.filter((w) => w > 0) : weights;
    const off = relevant.filter((w) => w < pr * (1 - TOLERANCE) || w > pr * (1 + TOLERANCE));
    if (off.length > 0) {
      deviations.push(
        `${exercise?.name?.trim() ?? record.exercise_id}: marca ${pr} kg, en el plan ${[...new Set(relevant)].join("/")} kg`,
      );
    }
  }

  if (deviations.length === 0) {
    return { blocked: null, note: ` Pesos coherentes con sus ${withRecord.length} marcas personales.${userNote}` };
  }
  if (justification?.trim()) {
    return { blocked: null, note: ` Pesos distintos de su marca (${deviations.join("; ")}): ${justification.trim()}${userNote}` };
  }
  return {
    blocked: JSON.stringify({
      error: true,
      motivo:
        "No se ha guardado nada: algunos pesos se alejan más de un 10 % de las marcas personales del socio " +
        `en esos ejercicios: ${deviations.join("; ")}. Ajusta esos pesos a partir de su marca (no por ` +
        "debajo salvo motivo, y progresando poco a poco) y vuelve a llamar. Si hay un motivo real para " +
        "apartarse (semana de descarga, lesión, la marca está registrada de otra forma, p.ej. la suma de " +
        "las dos mancuernas...), vuelve a llamar explicándolo en personal_records_justification. Si esos " +
        "pesos los ha dictado el usuario, incluye esos ejercicios en user_set_weight_exercise_ids.",
    }),
    note: "",
  };
}
