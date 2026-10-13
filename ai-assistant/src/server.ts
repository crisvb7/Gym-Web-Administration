import express from "express";
import multer from "multer";
import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { config, missingSettings, saveSettings, EDITABLE_SETTINGS, type EditableSetting } from "./config.js";
import { runChatTurn, executeConfirmedAction, cancelPendingAction, getOpenAI } from "./chatEngine.js";
import {
  listConversations,
  loadConversation,
  saveConversation,
  createNewConversation,
  deleteConversation,
  deriveTitle,
  AUTOMATION_CONVERSATION_ID,
  type StoredConversation,
} from "./conversationStore.js";
import { getDashboardStats } from "./stats.js";
import { ingestFile } from "./fileIngestion.js";
import { startCloudSync, syncNow, runTaskNow, runningTaskIds, fichasStatus, cloudSyncStatus } from "./cloud/sync.js";
import { supabase } from "./supabaseClient.js";
import { loadTasks, removeTask, describeSchedule } from "./scheduledTasks.js";
import { rememberUpload } from "./uploads.js";
import { ensureFilesDir, listFilesRecursive } from "./tools/localFiles.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const app = express();
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

// Herramienta local, un único administrador: en cada momento hay UNA conversación "activa" (la
// que se ve en la web), pero puede haber muchas más guardadas en disco (data/conversations/) que
// se pueden listar y retomar. La conversación de automatizaciones (tareas programadas) vive
// aparte, en su propio hilo fijo, para no mezclarse con el chat interactivo.
let activeConversationId: string;

async function pickInitialConversation(): Promise<void> {
  const all = await listConversations();
  const interactive = all.filter((c) => c.id !== AUTOMATION_CONVERSATION_ID);
  if (interactive.length > 0) {
    activeConversationId = interactive[0].id; // la más reciente (listConversations ya ordena por updatedAt desc)
  } else {
    const conv = await createNewConversation();
    activeConversationId = conv.id;
  }
}

function serializePendingActions(conv: StoredConversation) {
  return Object.entries(conv.pendingActions).map(([id, action]) => ({ id, summary: action.summary }));
}

function serializeHistory(messages: ChatCompletionMessageParam[]) {
  const out: Array<{ role: "user" | "assistant"; text: string }> = [];
  for (const msg of messages) {
    if (msg.role === "user") {
      const text =
        typeof msg.content === "string"
          ? msg.content
          : (msg.content ?? [])
              .map((part) => (part.type === "text" ? part.text : "📎 (imagen adjunta)"))
              .join("\n");
      if (text.trim()) out.push({ role: "user", text });
    } else if (msg.role === "assistant") {
      const text = typeof msg.content === "string" ? msg.content : "";
      if (text.trim()) out.push({ role: "assistant", text });
    }
  }
  return out;
}

// Mientras falten las claves, la interfaz muestra la pantalla de Ajustes en vez del chat.
app.get("/api/status", (_req, res) => {
  res.json({ missingSettings: missingSettings(), model: config.openaiModel, localFilesDir: config.localFilesDir });
});

function maskSecret(value: string | undefined): string | null {
  if (!value) return null;
  return value.length > 10 ? `${value.slice(0, 5)}…${value.slice(-4)}` : "••••";
}

app.get("/api/settings", (_req, res) => {
  res.json({
    openaiApiKey: maskSecret(config.openaiApiKey),
    openaiModel: config.openaiModel,
    supabaseUrl: config.supabaseUrl,
    supabaseServiceRoleKey: maskSecret(config.supabaseServiceRoleKey),
    localFilesDir: config.localFilesDir,
    requireConfirmation: config.requireConfirmation,
  });
});

// Guarda los ajustes y comprueba al momento que las claves funcionan. Las claves secretas que
// lleguen vacías se dejan como estaban (el formulario nunca recibe la clave real, solo una máscara).
app.post("/api/settings", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const fields: Record<string, EditableSetting> = {
    openaiApiKey: "OPENAI_API_KEY",
    openaiModel: "OPENAI_MODEL",
    supabaseUrl: "SUPABASE_URL",
    supabaseServiceRoleKey: "SUPABASE_SERVICE_ROLE_KEY",
    localFilesDir: "LOCAL_FILES_DIR",
    requireConfirmation: "REQUIRE_CONFIRMATION",
  };
  const updates: Partial<Record<EditableSetting, string>> = {};
  for (const [field, envName] of Object.entries(fields)) {
    const value = typeof body[field] === "boolean" ? String(body[field]) : body[field];
    if (typeof value !== "string" || !EDITABLE_SETTINGS.includes(envName)) continue;
    const isSecret = envName === "OPENAI_API_KEY" || envName === "SUPABASE_SERVICE_ROLE_KEY";
    if (isSecret && !value.trim()) continue;
    updates[envName] = value;
  }

  try {
    await saveSettings(updates);
  } catch (err) {
    res.status(500).json({ error: `No se pudo guardar la configuración: ${err instanceof Error ? err.message : err}` });
    return;
  }

  const checks: Record<string, string> = {};
  try {
    const { error, status } = await supabase.from("profiles").select("id", { count: "exact", head: true }).limit(1);
    const reason = status === 401 || status === 403 ? "la clave no es válida" : error?.message || `respuesta HTTP ${status}`;
    checks.supabase = error ? `Error: ${reason}` : "ok";
  } catch (err) {
    checks.supabase = `Error: ${err instanceof Error ? err.message : err}`;
  }
  try {
    await getOpenAI().models.retrieve(config.openaiModel);
    checks.openai = "ok";
  } catch (err) {
    checks.openai = `Error: ${err instanceof Error ? err.message : err}`;
  }
  try {
    await ensureFilesDir();
    checks.folder = "ok";
  } catch (err) {
    checks.folder = `Error: ${err instanceof Error ? err.message : err}`;
  }

  // La nube usa la misma clave y modelo de OpenAI: se suben al momento.
  if (checks.supabase === "ok") void syncNow();

  res.json({ ok: Object.values(checks).every((c) => c === "ok"), checks, missingSettings: missingSettings() });
});

// Contenido de la carpeta compartida (fichas...), para la pantalla de Tareas.
app.get("/api/files", async (_req, res) => {
  try {
    await ensureFilesDir();
    res.json({ root: config.localFilesDir, files: await listFilesRecursive(config.localFilesDir, 2) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "No se pudo leer la carpeta." });
  }
});

// Las tareas viven en Supabase y las ejecuta la nube; aquí solo se listan, se lanzan y se borran.
app.get("/api/tasks", async (_req, res) => {
  if (missingSettings().length > 0) {
    res.status(503).json({ error: "Completa primero la configuración en Ajustes." });
    return;
  }
  try {
    const [tasks, running] = await Promise.all([loadTasks(), runningTaskIds()]);
    res.json(
      tasks.map((t) => ({
        id: t.id,
        description: t.description,
        schedule: describeSchedule(t),
        clientFilesFolder: t.clientFilesFolder ?? null,
        clients: t.clients ?? null,
        requireConfirmation: t.requireConfirmation ?? config.requireConfirmation,
        lastRunDate: t.lastRunDate ?? null,
        lastRunSummary: t.lastRunSummary ?? null,
        running: running.has(t.id),
      })),
    );
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "No se pudieron cargar las tareas." });
  }
});

// Estado de las fichas en la nube (subida, socio encontrado o no...) para la pantalla de Tareas.
app.get("/api/fichas", async (req, res) => {
  if (missingSettings().length > 0) {
    res.status(503).json({ error: "Completa primero la configuración en Ajustes." });
    return;
  }
  try {
    if (req.query.sync === "1") await syncNow();
    res.json({ fichas: await fichasStatus(), sync: cloudSyncStatus() });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "No se pudo leer el estado de las fichas." });
  }
});

app.post("/api/tasks/:id/run", async (req, res) => {
  if (missingSettings().length > 0) {
    res.status(400).json({ error: "Completa primero la configuración en Ajustes." });
    return;
  }
  let ok: boolean;
  try {
    ok = await runTaskNow(req.params.id);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "No se pudo lanzar la tarea." });
    return;
  }
  if (!ok) {
    res.status(404).json({ error: "Esa tarea ya no existe." });
    return;
  }
  res.json({ ok: true });
});

app.delete("/api/tasks/:id", async (req, res) => {
  try {
    res.json({ ok: await removeTask(req.params.id) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "No se pudo eliminar la tarea." });
  }
});

app.get("/api/stats", async (_req, res) => {
  if (missingSettings().length > 0) {
    res.status(503).json({ error: "Falta configuración.", missingSettings: missingSettings() });
    return;
  }
  try {
    const stats = await getDashboardStats();
    res.json({ ...stats, model: config.openaiModel });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudieron cargar las estadísticas." });
  }
});

// Lista de socios para la sección "Miembros" de la interfaz (no pasa por el modelo de IA: es una
// consulta directa, igual que /api/stats).
app.get("/api/members", async (req, res) => {
  const search = typeof req.query.q === "string" ? req.query.q.trim() : "";

  let query = supabase
    .from("profiles")
    .select("id, first_name, last_name, email")
    .eq("role", "client")
    .order("first_name", { ascending: true });

  if (search) {
    // Fuera los caracteres con significado especial en el filtro de PostgREST (, . ( ) %).
    const words = search
      .replace(/[,.()%*\\]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    for (const word of words) {
      query = query.or(`first_name.ilike.%${word}%,last_name.ilike.%${word}%,email.ilike.%${word}%`);
    }
  }

  const { data, error } = await query;
  if (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudieron cargar los socios." });
    return;
  }
  res.json(data ?? []);
});

// Lista todas las conversaciones guardadas (para el historial de la barra lateral).
app.get("/api/conversations", async (_req, res) => {
  const all = await listConversations();
  res.json(all.map((c) => ({ ...c, active: c.id === activeConversationId })));
});

// Crea una conversación nueva y la marca como activa ("Nuevo chat").
app.post("/api/conversations", async (_req, res) => {
  const conv = await createNewConversation();
  activeConversationId = conv.id;
  res.json({ id: conv.id, title: conv.title });
});

// Cambia cuál es la conversación activa (al hacer clic en el historial).
app.post("/api/conversations/:id/activate", async (req, res) => {
  const conv = await loadConversation(req.params.id);
  if (!conv) {
    res.status(404).json({ error: "Esa conversación ya no existe." });
    return;
  }
  activeConversationId = conv.id;
  res.json({ ok: true });
});

app.delete("/api/conversations/:id", async (req, res) => {
  await deleteConversation(req.params.id);
  if (req.params.id === activeConversationId) {
    await pickInitialConversation();
  }
  res.json({ ok: true, activeConversationId });
});

// Se llama al cargar la página: reconstruye la conversación activa (incluidas las tareas
// programadas que se hayan ejecutado solas) y sus acciones pendientes de confirmar.
app.get("/api/history", async (_req, res) => {
  const conv = await loadConversation(activeConversationId);
  if (!conv) {
    res.json({ conversationId: null, messages: [], pendingActions: [], model: config.openaiModel });
    return;
  }
  res.json({
    conversationId: conv.id,
    messages: serializeHistory(conv.messages),
    pendingActions: serializePendingActions(conv),
    model: config.openaiModel,
  });
});

// upload.single ignora silenciosamente las peticiones que no son multipart/form-data, así que
// esta misma ruta sirve tanto para mensajes normales (JSON) como para mensajes con un archivo
// adjunto (el frontend siempre envía FormData).
app.post("/api/chat", upload.single("file"), async (req, res) => {
  const userInput = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!userInput && !req.file) {
    res.status(400).json({ error: "Falta el mensaje o un archivo adjunto." });
    return;
  }
  if (missingSettings().length > 0) {
    res.status(400).json({ error: "Falta configurar las claves de OpenAI y Supabase: ve a Ajustes." });
    return;
  }

  const conv = await loadConversation(activeConversationId);
  if (!conv) {
    res.status(500).json({ error: "No se encontró la conversación activa." });
    return;
  }

  try {
    // multer decodifica el nombre del archivo como latin1: se recupera en UTF-8 (tildes, ñ).
    if (req.file) req.file.originalname = Buffer.from(req.file.originalname, "latin1").toString("utf8");
    const attachment = req.file ? await ingestFile(req.file) : null;
    if (req.file) await rememberUpload(req.file.originalname, req.file.buffer);
    const result = await runChatTurn(conv.messages, userInput, attachment);
    conv.messages = result.messages;
    if (conv.title === "Nueva conversación" && userInput) {
      conv.title = deriveTitle(userInput);
    }
    // Las acciones pendientes se ACUMULAN entre turnos: cada tarjeta "Confirmar/Cancelar" ya
    // mostrada en el chat sigue siendo válida hasta que el usuario la resuelva explícitamente,
    // sin importar qué más se hable mientras tanto.
    for (const action of result.pendingActions) {
      conv.pendingActions[randomUUID()] = action;
    }
    await saveConversation(conv);
    res.json({
      reply: result.reply,
      toolsUsed: result.toolsUsed,
      model: config.openaiModel,
      pendingActions: serializePendingActions(conv),
    });
  } catch (err) {
    if (err instanceof OpenAI.AuthenticationError) {
      res.status(401).json({ error: "Error de autenticación: revisa OPENAI_API_KEY en el servidor." });
    } else if (err instanceof OpenAI.RateLimitError) {
      res.status(429).json({ error: "Límite de peticiones alcanzado, inténtalo de nuevo en unos segundos." });
    } else if (err instanceof OpenAI.APIError) {
      res.status(502).json({ error: `Error de la API de OpenAI: ${err.message}` });
    } else if (err instanceof Error) {
      res.status(400).json({ error: err.message });
    } else {
      console.error(err);
      res.status(500).json({ error: "Error inesperado en el servidor." });
    }
  }
});

// Ejecuta (o cancela) UNA acción concreta (identificada por id) que quedó pendiente de confirmar
// en la conversación activa, DIRECTAMENTE contra la base de datos, sin volver a pasar por el
// modelo. Usa los argumentos exactos que ya se le mostraron al usuario en su resumen.
app.post("/api/confirm", async (req, res) => {
  const id = typeof req.body?.id === "string" ? req.body.id : null;
  const conv = await loadConversation(activeConversationId);
  const pending = id && conv ? conv.pendingActions[id] : undefined;
  if (!conv || !pending) {
    res.status(409).json({ error: "Esa acción ya no está pendiente de confirmar (puede que se haya resuelto o caducado)." });
    return;
  }

  const approve = req.body?.approve !== false;

  try {
    const outcome = approve
      ? await executeConfirmedAction(pending, conv.messages)
      : cancelPendingAction(pending, conv.messages);

    conv.messages = outcome.messages;
    delete conv.pendingActions[id!];
    await saveConversation(conv);
    res.json({ reply: outcome.reply, model: config.openaiModel, pendingActions: serializePendingActions(conv) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error ejecutando la acción confirmada." });
  }
});

await pickInitialConversation();
app.listen(config.port, config.host, () => {
  console.log(`🏋️  OlimpIA escuchando en http://localhost:${config.port}`);
  if (missingSettings().length > 0) {
    console.log(`⚙️  Falta configuración (${missingSettings().join(", ")}): ábrela en Ajustes.`);
  }
  startCloudSync();
});
