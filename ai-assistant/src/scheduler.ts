import { randomUUID } from "node:crypto";
import { loadTasks, markTaskRun, isTaskDue, describeSchedule, type ScheduledTask } from "./scheduledTasks.js";
import { runChatTurn } from "./chatEngine.js";
import { loadOrCreateConversation, saveConversation, AUTOMATION_CONVERSATION_ID } from "./conversationStore.js";

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // comprobar cada hora

async function runTask(task: ScheduledTask): Promise<void> {
  const marker = `[Tarea programada automática — se ejecuta ${describeSchedule(task)}]\n${task.description}`;
  console.log(`🕒 Ejecutando tarea programada ${task.id}: ${task.description}`);

  try {
    // Todas las tareas automáticas comparten su propio hilo de conversación fijo ("automation"),
    // separado del chat interactivo del usuario, para que su historial siempre esté accesible
    // aparte y no se mezcle con conversaciones ad hoc.
    const conv = await loadOrCreateConversation(AUTOMATION_CONVERSATION_ID, "🕒 Tareas automáticas");
    const result = await runChatTurn(conv.messages, marker);
    conv.messages = result.messages;
    for (const action of result.pendingActions) {
      conv.pendingActions[randomUUID()] = action;
    }
    await saveConversation(conv);
    console.log(`🕒 Tarea ${task.id} completada. Respuesta: ${result.reply.slice(0, 200)}`);
  } catch (err) {
    console.error(`🕒 Error ejecutando la tarea programada ${task.id}:`, err);
  } finally {
    await markTaskRun(task.id, new Date().toISOString().slice(0, 10));
  }
}

async function checkAndRunDueTasks(): Promise<void> {
  const tasks = await loadTasks();
  const now = new Date();
  const due = tasks.filter((t) => isTaskDue(t, now));

  // Se ejecutan una a una (no en paralelo): todas comparten la misma conversación de
  // automatizaciones, y ejecutarlas en paralelo podría mezclar sus resultados entre sí.
  for (const task of due) {
    await runTask(task);
  }
}

export function startScheduler(): void {
  // Comprobación inicial al arrancar el servidor, y luego cada hora. Esto SOLO funciona mientras
  // el proceso de Node (npm start) esté corriendo — no hace falta el navegador abierto, pero sí
  // que el servidor siga encendido (ver README).
  checkAndRunDueTasks().catch((err) => console.error("Error comprobando tareas programadas:", err));
  setInterval(() => {
    checkAndRunDueTasks().catch((err) => console.error("Error comprobando tareas programadas:", err));
  }, CHECK_INTERVAL_MS);
  console.log("🕒 Programador de tareas activo (comprobando cada hora).");
}
