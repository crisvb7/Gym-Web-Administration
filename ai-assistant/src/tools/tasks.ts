import { z } from "zod";
import { zodFunction } from "openai/helpers/zod";
import { addTask, loadTasks, removeTask, describeSchedule } from "../scheduledTasks.js";

export const listScheduledTasks = zodFunction({
  name: "list_scheduled_tasks",
  description: "Lista las tareas programadas (recurrentes) que ya tiene configuradas el asistente, con su id y frecuencia.",
  parameters: z.object({}),
  function: async () => {
    const tasks = await loadTasks();
    if (tasks.length === 0) return "No hay ninguna tarea programada configurada.";
    return JSON.stringify(
      tasks.map((t) => ({ id: t.id, descripcion: t.description, frecuencia: describeSchedule(t), ultima_ejecucion: t.lastRunDate ?? "nunca" })),
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
    "read_local_file si aplica —, y para quién). No requiere confirmación del usuario porque solo " +
    "crea una instrucción para el futuro: las escrituras reales de esa tarea (asignar rutinas, " +
    "comidas, etc.) sí pedirán confirmación cuando se ejecuten, igual que cualquier otra.",
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
  }),
  function: async (input) => {
    const task = await addTask({
      description: input.description,
      frequency: input.frequency,
      dayOfMonth: input.day_of_month ?? undefined,
      dayOfWeek: input.day_of_week ?? undefined,
    });
    return `Tarea programada creada (id ${task.id}): se ejecutará ${describeSchedule(task)}. Instrucción guardada: "${task.description}"`;
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
