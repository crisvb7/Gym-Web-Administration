// Las herramientas que escriben en la base de datos exponen al modelo un esquema SIN el campo
// "confirmed": el modelo nunca puede pasarlo, así que cada llamada que hace la IA siempre termina
// en pendingConfirmation() (nunca escribe nada). El campo "confirmed" solo existe en la
// implementación interna, y el ÚNICO sitio que lo pone a true es el servidor, al ejecutar
// directamente la acción cuando el usuario pulsa "Confirmar" (o responde s/n en la CLI) — nunca a
// través de una llamada a la API de OpenAI. Así, ni un fallo de instrucciones ni una alucinación
// del modelo pueden ejecutar una escritura sin ese clic explícito del usuario.

export function pendingConfirmation(summary: string): string {
  return JSON.stringify({ requiere_confirmacion: true, resumen: summary });
}

// Solo cuenta como "pidió el mes completo" cuando lo dice explícitamente. Un simple nombre de mes
// en la descripción (p.ej. "Comida de mañana - agosto 2026") NO implica por sí solo que se
// quisiera cubrir el mes entero — eso causaba falsos positivos en peticiones de uno o pocos días.
const EXPLICIT_FULL_MONTH_PATTERN = /\btodo el mes\b|\bmes completo\b|\bmensual\b|\btodos los días del mes\b/i;

const MONTH_NAMES: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

/** Busca un nombre de mes en español en el texto (con año opcional cerca) y lo resuelve a {year, month}. */
function detectTargetMonth(planDescription: string): { year: number; month: number } | null {
  const lower = planDescription.toLowerCase();
  for (const [name, month] of Object.entries(MONTH_NAMES)) {
    const match = lower.match(new RegExp(`\\b${name}\\b(?:[^\\d]{0,10}(\\d{4}))?`));
    if (match) {
      const year = match[1] ? Number(match[1]) : new Date().getFullYear();
      return { year, month };
    }
  }
  return null;
}

/**
 * Si hay una señal fuerte de que se pretendía cubrir un mes completo (se dice explícitamente
 * "todo el mes"/"mensual", o ya se generaron bastantes días junto con un nombre de mes, lo que
 * sugiere un intento de plan largo que se quedó corto) pero las fechas dadas abarcan mucho menos
 * que eso, el modelo probablemente generó solo una muestra (p.ej. una semana) en vez del mes
 * completo. Devuelve un aviso de rechazo (sin guardar nada) o null si el alcance parece correcto.
 * Una petición de uno o pocos días que solo menciona un mes de pasada (p.ej. una fecha concreta)
 * NO debe activar este rechazo.
 */
export function scopeWarning(planDescription: string, dates: string[]): string | null {
  if (dates.length === 0) return null;

  const sorted = [...dates].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const spanDays = (new Date(last).getTime() - new Date(first).getTime()) / 86_400_000;

  const explicitFullMonth = EXPLICIT_FULL_MONTH_PATTERN.test(planDescription);
  const targetMonth = detectTargetMonth(planDescription);
  const impliesFullMonth = explicitFullMonth || (targetMonth !== null && dates.length >= 4);
  if (!impliesFullMonth) return null;

  if (targetMonth) {
    const { year, month } = targetMonth;
    const daysInMonth = new Date(year, month, 0).getDate();
    // Margen de ~10 días por si el plan no entrena/come el primer o último día del mes.
    if (spanDays >= daysInMonth - 10) return null;

    const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("es-ES", {
      month: "long",
      year: "numeric",
    });
    const lastDayStr = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
    const firstDayStr = `${year}-${String(month).padStart(2, "0")}-01`;
    return JSON.stringify({
      error: true,
      motivo:
        `El plan menciona ${monthLabel} (${daysInMonth} días) pero las fechas dadas solo abarcan ` +
        `${Math.round(spanDays)} días (${first} → ${last}). No se ha guardado nada todavía. Vuelve ` +
        `a llamar a esta misma herramienta con días repartidos por TODO el mes, desde aproximadamente ` +
        `${firstDayStr} hasta ${lastDayStr}, no solo los primeros días, y luego vuelve a pedir ` +
        "confirmación con el plan completo.",
    });
  }

  if (spanDays >= 21) return null;

  return JSON.stringify({
    error: true,
    motivo:
      `El plan dice cubrir "un mes" pero las fechas dadas solo abarcan ${Math.round(spanDays)} días ` +
      `(${first} → ${last}). No se ha guardado nada todavía. Vuelve a llamar a esta misma ` +
      "herramienta incluyendo TODOS los días de entrenamiento/comidas de ese mes completo " +
      "(normalmente desde el día 1 hasta el último día del mes), no solo la primera semana, y " +
      "luego vuelve a pedir confirmación con el plan completo.",
  });
}
