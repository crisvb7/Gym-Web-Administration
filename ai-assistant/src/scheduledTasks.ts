import { supabase } from "./supabaseClient.js";
import { daysInMonth, localDateStr, toAppTime } from "./dates.js";

// Las tareas programadas viven en Supabase (tabla olimpia_tasks), no en el ordenador: así las
// ejecuta la función olimpia-tasks de la nube aunque el ordenador esté apagado.

export type TaskFrequency = "daily" | "weekly" | "monthly";

export interface ScheduledTask {
  id: string;
  description: string;
  frequency: TaskFrequency;
  /** Solo para frequency="monthly". 1-31; si el mes tiene menos días, se ajusta al último día. */
  dayOfMonth?: number;
  /** Solo para frequency="weekly". 0=domingo ... 6=sábado. */
  dayOfWeek?: number;
  /** Hora local "HH:MM" a la que se ejecuta. Sin definir: en cuanto llega el día. */
  time?: string;
  /**
   * Clientes concretos (por nombre): la tarea se ejecuta una vez por cada uno, usando su ficha de
   * la carpeta compartida si la tiene.
   */
  clients?: string[];
  /**
   * Si está definida, la tarea se ejecuta UNA VEZ POR CLIENTE de esta carpeta de fichas (ruta
   * relativa a la carpeta compartida; "" = la propia carpeta compartida): cada archivo es la ficha
   * de un cliente (su nombre es el del archivo), o cada subcarpeta es un cliente.
   */
  clientFilesFolder?: string;
  /**
   * true: lo que prepare la tarea (rutinas, comidas...) queda pendiente del botón Confirmar.
   * false/sin definir: se guarda directamente.
   */
  requireConfirmation?: boolean;
  createdAt: string;
  /** Última ocurrencia (YYYY-MM-DD, hora del gimnasio) ya lanzada, para no repetirla. */
  lastRunDate?: string;
  /** Resumen de la última ejecución, para mostrarlo en la pantalla de Tareas. */
  lastRunSummary?: string;
}

export type NewTask = Pick<
  ScheduledTask,
  "description" | "frequency" | "dayOfMonth" | "dayOfWeek" | "clientFilesFolder" | "requireConfirmation" | "time" | "clients"
> &
  Partial<Pick<ScheduledTask, "id" | "createdAt" | "lastRunDate" | "lastRunSummary">>;

interface TaskRow {
  id: string;
  description: string;
  frequency: TaskFrequency;
  day_of_month: number | null;
  day_of_week: number | null;
  time: string | null;
  clients: string[] | null;
  client_files_folder: string | null;
  require_confirmation: boolean | null;
  created_at: string;
  last_run_date: string | null;
  last_run_summary: string | null;
}

export function fromRow(row: TaskRow): ScheduledTask {
  return {
    id: row.id,
    description: row.description,
    frequency: row.frequency,
    dayOfMonth: row.day_of_month ?? undefined,
    dayOfWeek: row.day_of_week ?? undefined,
    time: row.time ?? undefined,
    clients: row.clients?.length ? row.clients : undefined,
    clientFilesFolder: row.client_files_folder ?? undefined,
    requireConfirmation: row.require_confirmation ?? undefined,
    createdAt: row.created_at,
    lastRunDate: row.last_run_date ?? undefined,
    lastRunSummary: row.last_run_summary ?? undefined,
  };
}

/** Mensaje claro si las tablas de la nube todavía no existen (falta aplicar la migración). */
function tableError(message: string): Error {
  if (/olimpia_tasks|schema cache|does not exist/i.test(message)) {
    return new Error("Las tareas en la nube todavía no están instaladas en Supabase (falta la migración de OlimpIA).");
  }
  return new Error(`Error con las tareas en Supabase: ${message}`);
}

export async function loadTasks(): Promise<ScheduledTask[]> {
  const { data, error } = await supabase.from("olimpia_tasks").select("*").order("created_at");
  if (error) throw tableError(error.message);
  return (data as TaskRow[]).map(fromRow);
}

export async function addTask(input: NewTask): Promise<ScheduledTask> {
  const { data, error } = await supabase
    .from("olimpia_tasks")
    .insert({
      ...(input.id ? { id: input.id } : {}),
      ...(input.createdAt ? { created_at: input.createdAt } : {}),
      description: input.description,
      frequency: input.frequency,
      day_of_month: input.dayOfMonth ?? null,
      day_of_week: input.dayOfWeek ?? null,
      time: input.time ?? null,
      clients: input.clients ?? null,
      client_files_folder: input.clientFilesFolder ?? null,
      require_confirmation: input.requireConfirmation ?? null,
      last_run_date: input.lastRunDate ?? null,
      last_run_summary: input.lastRunSummary ?? null,
    })
    .select()
    .single();
  if (error) throw tableError(error.message);
  return fromRow(data as TaskRow);
}

export async function removeTask(id: string): Promise<boolean> {
  const { data, error } = await supabase.from("olimpia_tasks").delete().eq("id", id).select("id");
  if (error) throw tableError(error.message);
  return (data ?? []).length > 0;
}

/** Día del mes en que toca la tarea mensual ese mes (31 → último día del mes, p.ej. 30 o 28). */
function monthlyTarget(task: ScheduledTask, year: number, monthIndex: number): Date {
  const day = Math.min(task.dayOfMonth ?? 1, daysInMonth(year, monthIndex));
  return new Date(year, monthIndex, day);
}

/** Fecha más reciente (hoy o anterior) en la que le tocaba ejecutarse a la tarea. */
function mostRecentOccurrence(task: ScheduledTask, today: Date): Date {
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (task.frequency === "daily") return base;
  if (task.frequency === "weekly") {
    const back = (base.getDay() - (task.dayOfWeek ?? 1) + 7) % 7;
    return new Date(base.getFullYear(), base.getMonth(), base.getDate() - back);
  }
  const thisMonth = monthlyTarget(task, base.getFullYear(), base.getMonth());
  if (base >= thisMonth) return thisMonth;
  return monthlyTarget(task, base.getFullYear(), base.getMonth() - 1);
}

function withTime(day: Date, time: string | undefined): Date {
  const [h, m] = (time ?? "00:00").split(":").map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h || 0, m || 0);
}

/**
 * Ocurrencia (YYYY-MM-DD) que toca ejecutar ahora, o null si no toca. Toca si su última fecha
 * programada ya ha llegado y todavía no se ha lanzado: si algo falló el día 1, la del día 1 se
 * lanza en cuanto se pueda, en vez de perderse hasta el mes siguiente. `now` va en hora del
 * gimnasio (appNow()).
 */
export function dueOccurrence(task: ScheduledTask, now: Date): string | null {
  let day = mostRecentOccurrence(task, now);
  // Si hoy toca pero aún no es la hora, la última ocurrencia es la anterior.
  if (task.time && withTime(day, task.time) > now) {
    day = mostRecentOccurrence(task, new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1));
  }
  const occurrence = localDateStr(day);
  // Una ocurrencia anterior a la creación de la tarea no cuenta (crear el día 15 una tarea "cada
  // día 1" no debe ejecutarla al momento por el día 1 que ya pasó). Con hora, se compara el
  // momento exacto: creada a las 21:30, la de las 21:15 de ese día ya no cuenta.
  const created = toAppTime(new Date(task.createdAt));
  if (task.time ? withTime(day, task.time) < created : occurrence < localDateStr(created)) return null;
  return !task.lastRunDate || task.lastRunDate < occurrence ? occurrence : null;
}

export function describeSchedule(task: ScheduledTask): string {
  const base = describeDay(task);
  return task.time ? `${base} a las ${task.time}` : base;
}

function describeDay(task: ScheduledTask): string {
  if (task.frequency === "daily") return "todos los días";
  if (task.frequency === "weekly") {
    const days = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
    return `cada ${days[task.dayOfWeek ?? 1]}`;
  }
  const day = task.dayOfMonth ?? 1;
  if (day >= 31) return "el último día de cada mes";
  if (day >= 29) return `el día ${day} de cada mes (o el último día, si el mes es más corto)`;
  return `el día ${day} de cada mes`;
}

/** Las tareas por cliente: de una carpeta de fichas o de una lista de clientes con nombre. */
export function isPerClient(task: ScheduledTask): boolean {
  return task.clientFilesFolder !== undefined || Boolean(task.clients?.length);
}

/** Compara nombres sin tildes, mayúsculas ni espacios de más ("alexia  barrera" = "Alexia Barrera"). */
export function sameName(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b);
}

export function normalizeName(x: string): string {
  return x.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}
