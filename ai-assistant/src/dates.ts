// Fechas en la hora LOCAL del gimnasio. toISOString() da la fecha en UTC, que en España va 1-2
// horas por detrás: entre las 00:00 y las 02:00 devolvería todavía el día anterior.
//
// En el ordenador, la hora local es la del sistema. En la nube (Supabase) el reloj va en UTC, así
// que el worker fija la zona horaria del gimnasio con setAppTimeZone() y toAppTime() convierte
// cualquier instante a un Date cuyos getters locales (getDate, getHours...) dan la hora del
// gimnasio.
let appTimeZone: string | undefined;

export function setAppTimeZone(timeZone: string | undefined): void {
  appTimeZone = timeZone || undefined;
}

/** Zona horaria del sistema (p.ej. "Europe/Madrid"), para guardarla con las tareas. */
export function systemTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Madrid";
}

/** El mismo instante, expresado en la hora local del gimnasio (sin zona fijada: tal cual). */
export function toAppTime(date: Date): Date {
  if (!appTimeZone) return date;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: appTimeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return new Date(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
}

/** Ahora mismo, en la hora local del gimnasio. */
export function appNow(): Date {
  return toAppTime(new Date());
}

/** YYYY-MM-DD de la fecha local. */
export function localDateStr(date: Date = appNow()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}
