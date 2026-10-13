import { readFile, rename, stat } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { supabase } from "../supabaseClient.js";
import { config, missingSettings } from "../config.js";
import { systemTimeZone } from "../dates.js";
import { addTask, loadTasks, normalizeName, sameName } from "../scheduledTasks.js";
import { loadOrCreateConversation, saveConversation, AUTOMATION_CONVERSATION_ID } from "../conversationStore.js";
import { listClientRecords, readFileAsText, resolveSafePath } from "../tools/localFiles.js";
import { isImageFile } from "../fileIngestion.js";
import type { PendingAction } from "../chatEngine.js";

// Lo que hace la app de escritorio para las tareas en la nube (ella ya no las ejecuta):
//   - sube a Supabase la clave/modelo de OpenAI y la zona horaria (la función los necesita),
//   - sube el texto de las fichas que usan las tareas, cuando cambian,
//   - trae los resultados de la nube al hilo "🕒 Tareas automáticas" (con sus botones Confirmar).
// Se hace al arrancar y luego cada minuto, mientras la app esté abierta.

const SYNC_INTERVAL_MS = 60 * 1000;

// La app de escritorio registra aquí una función para mostrar notificaciones del sistema.
type Notifier = (title: string, body: string) => void;
function notify(title: string, body: string): void {
  const fn = (globalThis as { __olimpiaNotify?: Notifier }).__olimpiaNotify;
  try {
    fn?.(title, body);
  } catch {
    // Las notificaciones son opcionales.
  }
}

// --- Ajustes --------------------------------------------------------------------------------------

let lastPushed = "";

export async function pushSettings(): Promise<void> {
  const rows = [
    { key: "openai_api_key", value: config.openaiApiKey ?? "" },
    { key: "openai_model", value: config.openaiModel },
    { key: "time_zone", value: systemTimeZone() },
    { key: "require_confirmation", value: String(config.requireConfirmation) },
  ].filter((r) => r.value);
  const fingerprint = JSON.stringify(rows);
  if (fingerprint === lastPushed) return;
  const { error } = await supabase
    .from("olimpia_settings")
    .upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })));
  if (error) throw new Error(`No se pudieron subir los ajustes: ${error.message}`);
  lastPushed = fingerprint;
}

// --- Fichas ---------------------------------------------------------------------------------------

export interface FichaStatus {
  folder: string;
  clientName: string;
  files: string[];
  matchStatus: string | null;
  matchNote: string | null;
  syncedAt: string;
}

/** Nombre, tamaño y fecha de cada archivo: si no cambia, la ficha no se vuelve a subir. */
async function signatureOf(files: string[]): Promise<string> {
  const parts = await Promise.all(
    files.map(async (f) => {
      const s = await stat(resolveSafePath(f)).catch(() => null);
      return `${f}:${s?.size ?? 0}:${Math.round(s?.mtimeMs ?? 0)}`;
    }),
  );
  return parts.sort().join("|");
}

/** Busca el socio de la ficha por su nombre, para avisar ya al subirla si no cuadra. */
async function matchMember(name: string): Promise<{ member_id: string | null; match_status: string; match_note: string | null }> {
  const words = name
    .replace(/[,.()%*\\]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return { member_id: null, match_status: "not_found", match_note: "El nombre del archivo está vacío." };

  let query = supabase.from("profiles").select("id, first_name, last_name, email").eq("role", "client").limit(20);
  for (const word of words) {
    query = query.or(`first_name.ilike.%${word}%,last_name.ilike.%${word}%,email.ilike.%${word}%`);
  }
  const { data, error } = await query;
  if (error) return { member_id: null, match_status: "not_found", match_note: `No se pudo comprobar: ${error.message}` };

  const candidates = data ?? [];
  const exact = candidates.filter((m) => sameName(`${m.first_name ?? ""} ${m.last_name ?? ""}`, name));
  const pool = exact.length > 0 ? exact : candidates;
  const label = (m: (typeof candidates)[number]) => `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim();

  if (pool.length === 1) {
    const m = pool[0];
    return {
      member_id: m.id,
      match_status: "ok",
      match_note: exact.length > 0 ? null : `Se usará "${label(m)}" (${m.email}): el nombre no coincide exactamente.`,
    };
  }
  if (pool.length === 0) {
    return { member_id: null, match_status: "not_found", match_note: `No hay ningún socio llamado "${name}" en la base de datos.` };
  }
  return {
    member_id: null,
    match_status: "duplicate",
    match_note:
      `Hay ${pool.length} socios que encajan con "${name}" (${pool.map((m) => `${label(m)} · ${m.email}`).join("; ")}). ` +
      "Renombra el archivo con el nombre completo para distinguirlos.",
  };
}

/** Qué carpetas (y, si la tarea es de clientes concretos, qué clientes) necesitan las tareas. */
function wantedFichas(tasks: Awaited<ReturnType<typeof loadTasks>>): Map<string, { all: boolean; names: string[] }> {
  const wanted = new Map<string, { all: boolean; names: string[] }>();
  for (const task of tasks) {
    if (!task.clients?.length && task.clientFilesFolder === undefined) continue;
    const folder = task.clientFilesFolder ?? "";
    const entry = wanted.get(folder) ?? { all: false, names: [] };
    if (task.clients?.length) entry.names.push(...task.clients);
    else entry.all = true;
    wanted.set(folder, entry);
  }
  return wanted;
}

export async function syncFichas(): Promise<{ uploaded: string[]; removed: number }> {
  const uploaded: string[] = [];
  let removed = 0;
  const tasks = await loadTasks();

  for (const [folder, want] of wantedFichas(tasks)) {
    let records;
    try {
      records = await listClientRecords(folder);
    } catch {
      // La carpeta no está (p.ej. un disco desconectado): se deja en la nube lo último que se subió.
      continue;
    }
    const selected = want.all ? records : records.filter((r) => want.names.some((n) => sameName(n, r.clientName)));

    const { data: remote, error } = await supabase
      .from("olimpia_fichas")
      .select("client_name, signature")
      .eq("folder", folder);
    if (error) throw new Error(`No se pudieron leer las fichas de la nube: ${error.message}`);
    const remoteSignatures = new Map((remote ?? []).map((r) => [r.client_name as string, r.signature as string]));

    for (const record of selected) {
      const signature = await signatureOf(record.files);
      if (remoteSignatures.get(record.clientName) === signature) continue;

      const texts: string[] = [];
      for (const file of record.files) {
        texts.push(`--- Ficha "${file}" ---\n${await readFileAsText(file)}`);
      }
      const onlyImages = record.files.every((f) => isImageFile(f));
      const match = onlyImages
        ? {
            member_id: null,
            match_status: "unreadable",
            match_note: "Es una imagen: en la nube no se puede leer. Pásala a PDF con texto o Word.",
          }
        : await matchMember(record.clientName);

      const { error: upsertError } = await supabase.from("olimpia_fichas").upsert({
        folder,
        client_name: record.clientName,
        files: record.files,
        content: texts.join("\n\n"),
        signature,
        ...match,
        synced_at: new Date().toISOString(),
      });
      if (upsertError) throw new Error(`No se pudo subir la ficha de ${record.clientName}: ${upsertError.message}`);
      uploaded.push(record.clientName);
    }

    // Fichas que ya no están en la carpeta: se quitan de la nube.
    const keep = new Set(selected.map((r) => normalizeName(r.clientName)));
    const gone = [...remoteSignatures.keys()].filter((name) => !keep.has(normalizeName(name)));
    if (gone.length > 0) {
      await supabase.from("olimpia_fichas").delete().eq("folder", folder).in("client_name", gone);
      removed += gone.length;
    }
  }

  // Carpetas que ya no usa ninguna tarea.
  const folders = [...wantedFichas(tasks).keys()];
  const { data: stale } = await supabase.from("olimpia_fichas").select("folder");
  const staleFolders = [...new Set((stale ?? []).map((r) => r.folder as string))].filter((f) => !folders.includes(f));
  // Una a una con eq(): in() no admite la carpeta principal ("").
  for (const folder of staleFolders) await supabase.from("olimpia_fichas").delete().eq("folder", folder);

  return { uploaded, removed };
}

export async function fichasStatus(): Promise<FichaStatus[]> {
  const { data, error } = await supabase
    .from("olimpia_fichas")
    .select("folder, client_name, files, match_status, match_note, synced_at")
    .order("folder")
    .order("client_name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    folder: r.folder,
    clientName: r.client_name,
    files: r.files,
    matchStatus: r.match_status,
    matchNote: r.match_note,
    syncedAt: r.synced_at,
  }));
}

// --- Resultados de la nube --------------------------------------------------------------------------

interface CloudJob {
  id: string;
  label: string;
  status: "done" | "failed";
  transcript: ChatCompletionMessageParam[];
  pending_actions: PendingAction[];
  error: string | null;
}

/** Trae al hilo "🕒 Tareas automáticas" lo que la nube haya terminado desde la última vez. */
export async function importResults(): Promise<number> {
  const { data, error } = await supabase
    .from("olimpia_task_jobs")
    .select("id, label, status, transcript, pending_actions, error")
    .in("status", ["done", "failed"])
    .is("imported_at", null)
    .order("updated_at");
  if (error) throw new Error(error.message);
  const jobs = (data ?? []) as CloudJob[];

  if (jobs.length > 0) {
    const conv = await loadOrCreateConversation(AUTOMATION_CONVERSATION_ID, "🕒 Tareas automáticas");
    for (const job of jobs) {
      conv.messages.push(...job.transcript);
      if (job.status === "failed" && job.error) {
        const last = job.transcript[job.transcript.length - 1];
        if (!(last?.role === "assistant" && typeof last.content === "string" && last.content.includes(job.error))) {
          conv.messages.push({
            role: "assistant",
            content: `⚠️ Error en la tarea${job.label ? ` para ${job.label}` : ""}: ${job.error}`,
          });
        }
      }
      for (const action of job.pending_actions) conv.pendingActions[randomUUID()] = action;
    }
    await saveConversation(conv);
    await supabase
      .from("olimpia_task_jobs")
      .update({ imported_at: new Date().toISOString() })
      .in(
        "id",
        jobs.map((j) => j.id),
      );
  }

  // Aviso del sistema por cada ejecución terminada.
  const { data: runs } = await supabase
    .from("olimpia_task_runs")
    .select("id, summary, task:olimpia_tasks(description)")
    .eq("status", "done")
    .is("notified_at", null);
  for (const run of runs ?? []) {
    const task = run.task as unknown as { description: string } | null;
    notify("OlimpIA · tarea completada", `${(task?.description ?? "").slice(0, 80)}\n${run.summary ?? ""}`);
    await supabase.from("olimpia_task_runs").update({ notified_at: new Date().toISOString() }).eq("id", run.id);
  }
  return jobs.length;
}

// --- Tareas -------------------------------------------------------------------------------------------

/** "Ejecutar ahora": la nube la empieza en el siguiente minuto. */
export async function runTaskNow(id: string): Promise<boolean> {
  const tasks = await loadTasks();
  if (!tasks.some((t) => t.id === id)) return false;
  await syncFichas().catch((err) => console.error("Error subiendo las fichas:", err));
  const { error } = await supabase.from("olimpia_task_runs").insert({ task_id: id, occurrence: `manual-${new Date().toISOString()}` });
  if (error) throw new Error(error.message);
  await supabase.from("olimpia_tasks").update({ last_run_summary: "⏳ En curso…" }).eq("id", id);
  return true;
}

/** Ids de las tareas que se están ejecutando ahora en la nube. */
export async function runningTaskIds(): Promise<Set<string>> {
  const { data } = await supabase.from("olimpia_task_runs").select("task_id").neq("status", "done");
  return new Set((data ?? []).map((r) => r.task_id as string));
}

/** Pasa a la nube las tareas que había en el ordenador (versiones anteriores de OlimpIA). */
async function migrateLocalTasks(): Promise<void> {
  const file = join(config.dataDir, "scheduled-tasks.json");
  let local: Array<Record<string, unknown>>;
  try {
    local = JSON.parse(await readFile(file, "utf-8"));
  } catch {
    return; // no hay tareas locales
  }
  const existing = new Set((await loadTasks()).map((t) => t.id));
  for (const t of local) {
    if (existing.has(t.id as string)) continue;
    const autoApply = t.autoApply as boolean | undefined;
    await addTask({
      id: t.id as string,
      createdAt: t.createdAt as string,
      description: t.description as string,
      frequency: t.frequency as "daily" | "weekly" | "monthly",
      dayOfMonth: t.dayOfMonth as number | undefined,
      dayOfWeek: t.dayOfWeek as number | undefined,
      time: t.time as string | undefined,
      clients: t.clients as string[] | undefined,
      clientFilesFolder: t.clientFilesFolder as string | undefined,
      requireConfirmation: (t.requireConfirmation as boolean | undefined) ?? (autoApply === undefined ? undefined : !autoApply),
      lastRunDate: t.lastRunDate as string | undefined,
      lastRunSummary: t.lastRunSummary as string | undefined,
    });
  }
  await rename(file, join(config.dataDir, "scheduled-tasks.migrated.json"));
  console.log(`☁️  ${local.length} tarea(s) del ordenador pasadas a la nube.`);
}

// --- Bucle ----------------------------------------------------------------------------------------------

let lastError = "";
let lastSyncAt: string | null = null;

export function cloudSyncStatus(): { lastSyncAt: string | null; error: string | null } {
  return { lastSyncAt, error: lastError || null };
}

let running = false;
let migrated = false;

export async function syncNow(): Promise<void> {
  if (running || missingSettings().length > 0) return;
  running = true;
  try {
    if (!migrated) {
      await migrateLocalTasks();
      migrated = true;
    }
    await pushSettings();
    const { uploaded } = await syncFichas();
    if (uploaded.length > 0) console.log(`☁️  Fichas subidas: ${uploaded.join(", ")}`);
    await importResults();
    lastError = "";
    lastSyncAt = new Date().toISOString();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message !== lastError) console.error("☁️  Error sincronizando con la nube:", message);
    lastError = message;
  } finally {
    running = false;
  }
}

export function startCloudSync(): void {
  void syncNow();
  setInterval(() => void syncNow(), SYNC_INTERVAL_MS);
  console.log("☁️  Sincronización con las tareas en la nube activa (cada minuto).");
}
