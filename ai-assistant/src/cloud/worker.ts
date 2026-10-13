import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { ResponseInput } from "openai/resources/responses/responses";
import { supabase } from "../supabaseClient.js";
import { config, overrideSettings } from "../config.js";
import { appNow, localDateStr, setAppTimeZone } from "../dates.js";
import { buildSystemPrompt } from "../systemPrompt.js";
import { withConfirmationMode } from "../writeMode.js";
import { describeSchedule, dueOccurrence, fromRow, isPerClient, sameName, type ScheduledTask } from "../scheduledTasks.js";
import { responseTools, runCloudTool } from "./cloudTools.js";

// Worker de las tareas automáticas en la nube. La función olimpia-tasks de Supabase lo llama cada
// minuto (pg_cron). En cada llamada:
//   1. lanza las tareas a las que les toca (una "run" por ocurrencia),
//   2. reparte cada run nueva en trabajos (uno por cliente),
//   3. avanza cada trabajo UNA ronda del modelo: OpenAI trabaja en modo background, así que
//      ninguna llamada espera minutos a que el modelo termine (las funciones tienen un límite de
//      tiempo); si la respuesta no está lista, se mira en el siguiente minuto,
//   4. cierra las runs cuyos trabajos ya han terminado y deja el resumen en la tarea.
// Todo el estado vive en la base de datos: si una llamada se corta a mitad, la siguiente continúa.

const MAX_ROUNDS = 40; // como MAX_TOOL_ROUNDS del chat
const MAX_ATTEMPTS = 4; // reintentos si OpenAI falla
const JOBS_PER_TICK = 8;
const LOCK_MS = 4 * 60 * 1000;
const STUCK_MS = 90 * 60 * 1000; // una respuesta que no termina en hora y media se da por perdida
const MAX_TOOL_OUTPUT_IN_TRANSCRIPT = 4000;

export const WRITE_TOOLS = new Set([
  "assign_workout_plan",
  "assign_meal_plan",
  "delete_workout_plan",
  "delete_meal_plan",
  "update_member",
  "register_payment",
  "create_class",
]);

const NUDGE =
  "[Recordatorio automático] No has guardado nada todavía. Esto es una tarea automática: nadie va a " +
  "revisar ni contestar este mensaje. Si NO hay un motivo que lo impida (cliente no encontrado, varios " +
  "socios con ese nombre, ya tiene plan en esas fechas, faltan datos imprescindibles), llama AHORA a las " +
  "herramientas necesarias (assign_workout_plan, assign_meal_plan...) con el plan COMPLETO que has " +
  "diseñado, incluyendo todos los días del periodo. Si hay un motivo que lo impide, responde solo con ese " +
  "motivo, sin llamar a ninguna herramienta.";

interface PendingAction {
  tool: string;
  args: Record<string, unknown>;
  summary: string;
}

interface JobRow {
  id: string;
  run_id: string;
  label: string;
  prompt: string;
  status: "pending" | "waiting" | "done" | "failed";
  response_id: string | null;
  request: { input: ResponseInput; previous_response_id: string | null } | null;
  rounds: number;
  attempts: number;
  nudged: boolean;
  tools_used: string[];
  transcript: ChatCompletionMessageParam[];
  pending_actions: PendingAction[];
  updated_at: string;
}

interface RunRow {
  id: string;
  task_id: string;
  occurrence: string;
  status: string;
}

interface FichaRow {
  folder: string;
  client_name: string;
  files: string[];
  content: string;
  member_id: string | null;
  match_status: string | null;
}

// --- Ajustes ------------------------------------------------------------------------------------

let defaultRequireConfirmation = false;

/** Lee de olimpia_settings la clave/modelo de OpenAI y la zona horaria que sube la app de escritorio. */
async function loadCloudSettings(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from("olimpia_settings").select("key, value");
  if (error) throw new Error(`No se pudieron leer los ajustes de OlimpIA: ${error.message}`);
  const settings = Object.fromEntries((data ?? []).map((r) => [r.key as string, r.value as string]));
  overrideSettings({
    OPENAI_API_KEY: settings.openai_api_key,
    OPENAI_MODEL: settings.openai_model,
  });
  setAppTimeZone(settings.time_zone || "Europe/Madrid");
  defaultRequireConfirmation = settings.require_confirmation === "true";
  return settings;
}

/** Comprueba el secreto con el que llama pg_cron (guardado en olimpia_settings). */
export async function verifySecret(secret: string): Promise<boolean> {
  if (!secret) return false;
  const { data } = await supabase.from("olimpia_settings").select("value").eq("key", "cron_secret").maybeSingle();
  return Boolean(data?.value) && data!.value === secret;
}

function requiresConfirmation(task: ScheduledTask): boolean {
  return task.requireConfirmation ?? defaultRequireConfirmation;
}

// --- 1. Lanzar las tareas a las que les toca ----------------------------------------------------

async function scheduleDueTasks(tasks: ScheduledTask[], log: string[]): Promise<void> {
  const now = appNow();
  for (const task of tasks) {
    const occurrence = dueOccurrence(task, now);
    if (!occurrence) continue;
    // unique(task_id, occurrence): aunque dos llamadas coincidan, solo se crea una run.
    const { error } = await supabase
      .from("olimpia_task_runs")
      .upsert({ task_id: task.id, occurrence }, { onConflict: "task_id,occurrence", ignoreDuplicates: true });
    if (error) {
      log.push(`Error lanzando la tarea ${task.id}: ${error.message}`);
      continue;
    }
    await supabase
      .from("olimpia_tasks")
      .update({ last_run_date: occurrence, last_run_summary: "⏳ En curso…" })
      .eq("id", task.id);
    log.push(`Tarea ${task.id} lanzada (${occurrence}).`);
  }
}

// --- 2. Repartir cada run nueva en trabajos ------------------------------------------------------

function jobHeader(task: ScheduledTask): string {
  return (
    `[Tarea programada automática — se ejecuta ${describeSchedule(task)}. Hoy es ${localDateStr()}. ` +
    "Nadie está mirando el chat ahora mismo: no hagas preguntas, haz lo que puedas con los datos " +
    "disponibles y, si algo impide hacerlo (cliente no encontrado, duplicados, datos que faltan), " +
    "no asignes nada a ese cliente y explica claramente por qué.]\n"
  );
}

async function buildJobs(task: ScheduledTask): Promise<Array<{ label: string; prompt: string; error?: string }>> {
  const header = jobHeader(task);
  if (!isPerClient(task)) return [{ label: "", prompt: header + task.description }];

  const folder = task.clientFilesFolder ?? "";
  const { data, error } = await supabase.from("olimpia_fichas").select("*").eq("folder", folder).order("client_name");
  if (error) throw new Error(`No se pudieron leer las fichas: ${error.message}`);
  const fichas = (data ?? []) as FichaRow[];

  // Clientes concretos: cada uno con su ficha si la tiene; sin ficha, con sus datos del gimnasio.
  const targets: Array<{ name: string; ficha: FichaRow | null }> = task.clients?.length
    ? task.clients.map((name) => ({ name, ficha: fichas.find((f) => sameName(f.client_name, name)) ?? null }))
    : fichas.map((f) => ({ name: f.client_name, ficha: f }));

  if (targets.length === 0) {
    const message =
      `La carpeta de fichas "${folder || "(carpeta principal)"}" no tiene ninguna ficha subida a la nube: no se ha ` +
      "hecho nada. Abre OlimpIA en el ordenador para que suba las fichas (o revisa que la carpeta sea la correcta).";
    return [{ label: "", prompt: header + task.description, error: message }];
  }

  return targets.map(({ name, ficha }) => ({
    label: name,
    prompt:
      header +
      task.description +
      `\n\nEsta ejecución es SOLO para el cliente "${name}". Haz la tarea únicamente para ` +
      "este cliente. Si implica sus datos en el gimnasio (rutinas, comidas, pagos...), búscalo con " +
      "list_members por su nombre (si hay varios socios con ese nombre o no aparece, no asignes nada y " +
      "explícalo)." +
      (ficha?.match_status === "ok" && ficha.member_id
        ? ` Al subir su ficha se encontró un único socio con ese nombre (id ${ficha.member_id}).`
        : "") +
      "\n\n" +
      (ficha?.content.trim()
        ? `Su ficha, ya leída, está aquí abajo: no hace falta buscarla.\n\n${ficha.content}`
        : "No tiene ficha en la carpeta: básate en sus datos del gimnasio (marcas personales, " +
          "entrenamientos registrados, plan anterior, objetivo calórico...) y dilo en tu respuesta."),
  }));
}

async function expandNewRuns(tasksById: Map<string, ScheduledTask>, log: string[]): Promise<void> {
  const { data: runs } = await supabase.from("olimpia_task_runs").select("*").eq("status", "new");
  for (const run of (runs ?? []) as RunRow[]) {
    // Se "reserva" la run para que otra llamada simultánea no la reparta otra vez.
    const { data: claimed } = await supabase
      .from("olimpia_task_runs")
      .update({ status: "expanding" })
      .eq("id", run.id)
      .eq("status", "new")
      .select("id");
    if (!claimed?.length) continue;

    const task = tasksById.get(run.task_id);
    if (!task) continue; // la tarea se borró (y con ella la run, en cascada)
    try {
      const jobs = await buildJobs(task);
      const { error } = await supabase.from("olimpia_task_jobs").insert(
        jobs.map((j) => ({
          run_id: run.id,
          label: j.label,
          prompt: j.prompt,
          ...(j.error
            ? { status: "failed", error: j.error, transcript: [{ role: "assistant", content: `⚠️ ${j.error}` }] }
            : { transcript: [{ role: "user", content: j.prompt }] }),
        })),
      );
      if (error) throw new Error(error.message);
      await supabase.from("olimpia_task_runs").update({ status: "running" }).eq("id", run.id);
      log.push(`Run ${run.id}: ${jobs.length} trabajo(s).`);
    } catch (err) {
      // Se devuelve a "new" para reintentarlo en la siguiente llamada.
      await supabase.from("olimpia_task_runs").update({ status: "new" }).eq("id", run.id);
      log.push(`Error repartiendo la run ${run.id}: ${err instanceof Error ? err.message : err}`);
    }
  }
}

// --- 3. Avanzar los trabajos --------------------------------------------------------------------

let openai: OpenAI | null = null;
function client(): OpenAI {
  const key = config.openaiApiKey;
  if (!key) throw new Error("Falta la clave de OpenAI en la nube: abre OlimpIA en el ordenador para que la suba.");
  if (!openai || openai.apiKey !== key) openai = new OpenAI({ apiKey: key });
  return openai;
}

async function submit(input: ResponseInput, previousResponseId: string | null): Promise<string> {
  const response = await client().responses.create({
    model: config.openaiModel,
    instructions: buildSystemPrompt({ cloud: true }),
    input,
    tools: responseTools,
    previous_response_id: previousResponseId,
    background: true,
    store: true,
  });
  return response.id;
}

function outputText(items: Array<{ type: string; content?: Array<{ type: string; text?: string }> }>): string {
  return items
    .filter((i) => i.type === "message")
    .flatMap((i) => i.content ?? [])
    .filter((c) => c.type === "output_text")
    .map((c) => c.text ?? "")
    .join("\n")
    .trim();
}

function clip(text: string): string {
  return text.length > MAX_TOOL_OUTPUT_IN_TRANSCRIPT
    ? `${text.slice(0, MAX_TOOL_OUTPUT_IN_TRANSCRIPT)}\n…(recortado)`
    : text;
}

type JobUpdate = Partial<Omit<JobRow, "id" | "run_id">> & { result?: string; error?: string; locked_until?: string | null };

async function saveJob(job: JobRow, update: JobUpdate): Promise<void> {
  await supabase
    .from("olimpia_task_jobs")
    .update({ ...update, locked_until: null, updated_at: new Date().toISOString() })
    .eq("id", job.id);
}

/** Envía una petición a OpenAI y deja el trabajo esperando su respuesta. */
async function send(job: JobRow, input: ResponseInput, previousId: string | null, extra: JobUpdate): Promise<void> {
  const request = { input, previous_response_id: previousId };
  try {
    const responseId = await submit(input, previousId);
    await saveJob(job, { ...extra, status: "waiting", response_id: responseId, request, attempts: 0 });
  } catch (err) {
    await retryOrFail(job, { ...extra, request }, err);
  }
}

async function retryOrFail(job: JobRow, extra: JobUpdate, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const attempts = job.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    await saveJob(job, { ...extra, status: "failed", error: `OpenAI falló ${attempts} veces: ${message}` });
  } else {
    // Sin response_id: en la siguiente llamada se reenvía la última petición guardada.
    await saveJob(job, { ...extra, status: "waiting", response_id: null, attempts });
  }
}

async function advanceJob(job: JobRow, requireConfirmation: boolean): Promise<string> {
  // Primera ronda.
  if (job.status === "pending") {
    await send(job, [{ role: "user", content: job.prompt }], null, {});
    return "enviado";
  }

  // Una petición anterior falló al enviarse: se reintenta tal cual.
  if (!job.response_id) {
    if (!job.request) {
      await saveJob(job, { status: "failed", error: "Estado inconsistente: no hay petición que reintentar." });
      return "fallido";
    }
    await send(job, job.request.input, job.request.previous_response_id, {});
    return "reintentado";
  }

  const response = await client().responses.retrieve(job.response_id);
  if (response.status === "queued" || response.status === "in_progress") {
    if (Date.now() - new Date(job.updated_at).getTime() > STUCK_MS) {
      await client().responses.cancel(job.response_id).catch(() => {});
      await retryOrFail(job, {}, new Error("la respuesta no terminó en hora y media"));
      return "atascado";
    }
    await saveJob(job, {});
    return "esperando";
  }
  if (response.status !== "completed") {
    const reason = response.error?.message ?? response.incomplete_details?.reason ?? response.status;
    await retryOrFail(job, {}, new Error(`respuesta ${response.status}: ${reason}`));
    return "reintento";
  }

  const output = response.output as unknown as Array<{
    type: string;
    call_id?: string;
    name?: string;
    arguments?: string;
    content?: Array<{ type: string; text?: string }>;
  }>;
  const text = outputText(output);
  const calls = output.filter((i) => i.type === "function_call");
  const transcript = [...job.transcript];
  const toolsUsed = [...job.tools_used];
  const pending = [...job.pending_actions];

  if (calls.length > 0) {
    transcript.push({
      role: "assistant",
      content: text || null,
      tool_calls: calls.map((c) => ({
        id: c.call_id!,
        type: "function" as const,
        function: { name: c.name!, arguments: c.arguments ?? "{}" },
      })),
    });
    const outputs: ResponseInput = [];
    // Las herramientas se ejecutan en orden (no en paralelo): asignar una rutina y luego
    // consultarla debe ver lo ya guardado.
    for (const call of calls) {
      const result = await withConfirmationMode(requireConfirmation, () => runCloudTool(call.name!, call.arguments ?? "{}"));
      toolsUsed.push(call.name!);
      try {
        const parsed = JSON.parse(result);
        if (parsed?.requiere_confirmacion) {
          pending.push({ tool: call.name!, args: JSON.parse(call.arguments ?? "{}"), summary: parsed.resumen });
        }
      } catch {
        // No era un JSON de confirmación.
      }
      transcript.push({ role: "tool", tool_call_id: call.call_id!, content: clip(result) });
      outputs.push({ type: "function_call_output", call_id: call.call_id!, output: result });
    }

    const rounds = job.rounds + 1;
    const progress: JobUpdate = { transcript, tools_used: toolsUsed, pending_actions: pending, rounds };
    if (rounds >= MAX_ROUNDS) {
      await saveJob(job, { ...progress, status: "failed", error: `Se alcanzó el máximo de ${MAX_ROUNDS} rondas sin terminar.` });
      return "fallido";
    }
    await send(job, outputs, response.id, progress);
    return `ronda ${rounds}`;
  }

  // El modelo ha terminado (respuesta de texto, sin herramientas).
  if (text) transcript.push({ role: "assistant", content: text });
  const savedSomething = pending.length > 0 || toolsUsed.some((t) => WRITE_TOOLS.has(t));
  if (!savedSomething && !job.nudged) {
    // A veces el modelo describe el plan en texto en vez de guardarlo (y nadie le va a
    // contestar): se le insiste una vez en la misma conversación.
    transcript.push({ role: "user", content: NUDGE });
    await send(job, [{ role: "user", content: NUDGE }], response.id, { transcript, nudged: true });
    return "insistido";
  }
  await saveJob(job, { transcript, status: "done", result: text || "(sin respuesta de texto)" });
  return "terminado";
}

async function advanceJobs(tasksById: Map<string, ScheduledTask>, log: string[]): Promise<void> {
  const { data } = await supabase
    .from("olimpia_task_jobs")
    .select("*, run:olimpia_task_runs(task_id)")
    .in("status", ["pending", "waiting"])
    .or(`locked_until.is.null,locked_until.lt."${new Date().toISOString()}"`)
    .order("created_at")
    .limit(JOBS_PER_TICK);

  await Promise.all(
    ((data ?? []) as Array<JobRow & { run: { task_id: string } | null }>).map(async (job) => {
      // Reserva el trabajo: si otra llamada simultánea ya lo tiene, se salta.
      const now = new Date();
      const { data: claimed } = await supabase
        .from("olimpia_task_jobs")
        .update({ locked_until: new Date(now.getTime() + LOCK_MS).toISOString() })
        .eq("id", job.id)
        .or(`locked_until.is.null,locked_until.lt."${now.toISOString()}"`)
        .select("id");
      if (!claimed?.length) return;

      const task = job.run ? tasksById.get(job.run.task_id) : undefined;
      try {
        const step = await advanceJob(job, task ? requiresConfirmation(task) : defaultRequireConfirmation);
        log.push(`Trabajo ${job.label || job.id}: ${step}.`);
      } catch (err) {
        await retryOrFail(job, {}, err);
        log.push(`Trabajo ${job.label || job.id}: error (${err instanceof Error ? err.message : err}).`);
      }
    }),
  );
}

// --- 4. Cerrar las runs terminadas ---------------------------------------------------------------

interface FinishedJob {
  label: string;
  status: string;
  tools_used: string[];
  pending_actions: PendingAction[];
}

function summarize(task: ScheduledTask | undefined, jobs: FinishedJob[]): string {
  const perClient = task ? isPerClient(task) : jobs.length > 1;
  const failed = jobs.filter((j) => j.status === "failed");
  const ok = jobs.length - failed.length;
  const pending = jobs.reduce((n, j) => n + j.pending_actions.length, 0);
  const changed = jobs.filter(
    (j) => j.status === "done" && j.pending_actions.length === 0 && j.tools_used.some((t) => WRITE_TOOLS.has(t)),
  ).length;
  const noChanges = jobs
    .filter((j) => j.status === "done" && j.pending_actions.length === 0 && !j.tools_used.some((t) => WRITE_TOOLS.has(t)))
    .map((j) => j.label || "tarea");
  return [
    perClient ? `${ok}/${jobs.length} clientes procesados` : ok ? "Ejecutada" : "Falló",
    changed ? (perClient ? `${changed} con cambios guardados` : "cambios guardados") : "",
    pending ? `${pending} pendientes de confirmar` : "",
    failed.length ? `${failed.length} con error${perClient ? ` (${failed.map((j) => j.label || "tarea").join(", ")})` : ""}` : "",
    perClient && noChanges.length ? `sin cambios: ${noChanges.join(", ")} (revisa el hilo 🕒 Tareas automáticas)` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

async function finishRuns(tasksById: Map<string, ScheduledTask>, log: string[]): Promise<void> {
  const { data: runs } = await supabase.from("olimpia_task_runs").select("*").eq("status", "running");
  for (const run of (runs ?? []) as RunRow[]) {
    const { data: jobs } = await supabase
      .from("olimpia_task_jobs")
      .select("label, status, tools_used, pending_actions")
      .eq("run_id", run.id);
    const list = (jobs ?? []) as FinishedJob[];
    if (list.some((j) => j.status === "pending" || j.status === "waiting")) continue;

    const summary = summarize(tasksById.get(run.task_id), list);
    await supabase
      .from("olimpia_task_runs")
      .update({ status: "done", summary, finished_at: new Date().toISOString() })
      .eq("id", run.id);
    await supabase.from("olimpia_tasks").update({ last_run_summary: summary }).eq("id", run.task_id);
    log.push(`Run ${run.id} terminada: ${summary}`);
  }
}

// --- Entrada --------------------------------------------------------------------------------------

/** Una vuelta completa del worker. Devuelve un registro de lo que ha hecho (para los logs). */
export async function tick(): Promise<string[]> {
  const log: string[] = [];
  const settings = await loadCloudSettings();
  if (!settings.openai_api_key) {
    log.push("Sin clave de OpenAI en olimpia_settings: no se ejecuta nada.");
    return log;
  }
  const { data, error } = await supabase.from("olimpia_tasks").select("*");
  if (error) throw new Error(`No se pudieron leer las tareas: ${error.message}`);
  const tasks = (data ?? []).map(fromRow);
  const tasksById = new Map(tasks.map((t) => [t.id, t]));

  await scheduleDueTasks(tasks, log);
  await expandNewRuns(tasksById, log);
  await advanceJobs(tasksById, log);
  await finishRuns(tasksById, log);
  return log;
}
