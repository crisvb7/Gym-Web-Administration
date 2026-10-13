import { z } from "zod";
import { zodFunction } from "openai/helpers/zod";
import { addTask, loadTasks, removeTask, describeSchedule } from "../scheduledTasks.js";
import { fichasStatus, syncNow } from "../cloud/sync.js";

export const listScheduledTasks = zodFunction({
  name: "list_scheduled_tasks",
  description: "Lista las tareas programadas (recurrentes) que ya tiene configuradas el asistente, con su id y frecuencia.",
  parameters: z.object({}),
  function: async () => {
    const tasks = await loadTasks();
    if (tasks.length === 0) return "No hay ninguna tarea programada configurada.";
    return JSON.stringify(
      tasks.map((t) => ({
        id: t.id,
        descripcion: t.description,
        frecuencia: describeSchedule(t),
        carpeta_fichas: t.clientFilesFolder ?? null,
        clientes: t.clients ?? null,
        pide_confirmacion: t.requireConfirmation ?? false,
        ultima_ejecucion: t.lastRunDate ?? "nunca",
        resultado_ultima_ejecucion: t.lastRunSummary ?? null,
      })),
      null,
      2,
    );
  },
});

export const createScheduledTask = zodFunction({
  name: "create_scheduled_task",
  description:
    "Crea una tarea recurrente que el asistente ejecutará solo, sin que el usuario tenga que " +
    "pedirlo cada vez (p.ej. 'cada día 31, prepara las rutinas de todos los clientes según el " +
    "Excel de la carpeta compartida'). El texto de 'description' es la instrucción que te vas a dar " +
    "a ti mismo cuando llegue el momento: escríbela completa y autocontenida, como si fuera un " +
    "mensaje nuevo de un usuario (qué hacer, dónde mirar los datos — usa list_local_files/" +
    "read_local_file si aplica —, y para quién). Para tareas que se hacen para CADA cliente de una " +
    "carpeta de fichas (p.ej. 'cada día 1, la rutina del mes de cada cliente según su ficha'), " +
    "indica client_files_folder (todas las fichas de esa carpeta) o clients (clientes concretos por " +
    "nombre): la tarea se ejecutará una vez por cliente, y " +
    "la description debe explicar qué hacer para UN cliente, sin mencionar dónde está la carpeta ni " +
    "la ficha (la tarea ya se la pasa leída en cada ejecución). Por defecto la tarea guarda los cambios " +
    "ella sola; solo si el usuario pide revisarlos antes, usa require_confirmation=true.",
  parameters: z.object({
    description: z
      .string()
      .describe("Instrucción completa y autocontenida que se ejecutará cuando toque, en español."),
    frequency: z.enum(["daily", "weekly", "monthly"]).describe("Frecuencia: daily, weekly o monthly."),
    day_of_month: z
      .number()
      .int()
      .min(1)
      .max(31)
      .nullable()
      .optional()
      .describe("Solo si frequency=monthly. Día del mes (1-31). Usa 31 para 'el último día del mes'."),
    day_of_week: z
      .number()
      .int()
      .min(0)
      .max(6)
      .nullable()
      .optional()
      .describe("Solo si frequency=weekly. 0=domingo, 1=lunes, ... 6=sábado."),
    time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable()
      .optional()
      .describe("Hora local HH:MM (24 h) si el usuario indica una, p.ej. '21:15'. Omitir si no dice hora."),
    clients: z
      .array(z.string())
      .nullable()
      .optional()
      .describe(
        "Nombres de clientes concretos si el usuario los enumera (p.ej. ['Cristian Villa', 'Alexia " +
          "Barrera']): la tarea se hace una vez por cada uno, con su ficha si la tiene en la carpeta.",
      ),
    client_files_folder: z
      .string()
      .nullable()
      .optional()
      .describe(
        "Carpeta de fichas (relativa a la carpeta compartida, p.ej. 'Fichas') si la tarea se repite " +
          "para cada cliente de esa carpeta. Usa '' para la carpeta compartida raíz. Omitir (null) si la " +
          "tarea no es por cliente.",
      ),
    require_confirmation: z
      .boolean()
      .nullable()
      .optional()
      .describe(
        "true SOLO si el usuario pide revisar/confirmar lo que prepare la tarea antes de guardarlo. " +
          "Si no lo dice, omítelo: la tarea guardará los cambios directamente.",
      ),
  }),
  function: async (input) => {
    const task = await addTask({
      description: input.description,
      frequency: input.frequency,
      dayOfMonth: input.day_of_month ?? undefined,
      dayOfWeek: input.day_of_week ?? undefined,
      clientFilesFolder: input.client_files_folder ?? undefined,
      time: input.time ?? undefined,
      clients: input.clients?.map((c) => c.trim()).filter(Boolean) || undefined,
      requireConfirmation: input.require_confirmation === true ? true : undefined,
    });
    // Sube ya las fichas que va a usar (y comprueba que cada una corresponde a un socio).
    await syncNow();
    let fichasNote = "";
    if (task.clients?.length || task.clientFilesFolder !== undefined) {
      const folder = task.clientFilesFolder ?? "";
      const fichas = (await fichasStatus().catch(() => [])).filter((f) => f.folder === folder);
      const problems = fichas.filter((f) => f.matchStatus !== "ok" || f.matchNote);
      fichasNote =
        ` Fichas subidas a la nube: ${fichas.length}.` +
        (problems.length
          ? ` AVISA AL USUARIO de estas fichas con problemas: ${problems.map((f) => `${f.clientName}: ${f.matchNote ?? f.matchStatus}`).join(" | ")}.`
          : "");
    }
    return (
      `Tarea programada creada en la nube (id ${task.id}): se ejecutará ${describeSchedule(task)}, aunque el ordenador esté apagado` +
      (task.clients?.length
        ? `, una vez por cada cliente (${task.clients.join(", ")}), con su ficha si la tiene`
        : task.clientFilesFolder !== undefined
          ? `, una vez por cada ficha de la carpeta "${task.clientFilesFolder || "(raíz)"}"`
          : "") +
      (task.requireConfirmation ? ", dejando los cambios pendientes de confirmar" : ", guardando los cambios directamente") +
      `. Instrucción guardada: "${task.description}".` +
      fichasNote
    );
  },
});

export const deleteScheduledTask = zodFunction({
  name: "delete_scheduled_task",
  description: "Elimina una tarea programada por su id (consíguelo con list_scheduled_tasks). No requiere confirmación adicional.",
  parameters: z.object({
    task_id: z.string().describe("id de la tarea a eliminar."),
  }),
  function: async (input) => {
    const ok = await removeTask(input.task_id);
    return ok ? "Tarea eliminada correctamente." : `No se encontró ninguna tarea con id ${input.task_id}.`;
  },
});
