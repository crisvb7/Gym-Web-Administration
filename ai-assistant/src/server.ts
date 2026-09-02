import express from "express";
import multer from "multer";
import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { config } from "./config.js";
import { runChatTurn, executeConfirmedAction, cancelPendingAction } from "./chatEngine.js";
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
import { startScheduler } from "./scheduler.js";
import { supabase } from "./supabaseClient.js";

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

app.get("/api/stats", async (_req, res) => {
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
    const words = search.split(/\s+/).filter(Boolean);
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

  const conv = await loadConversation(activeConversationId);
  if (!conv) {
    res.status(500).json({ error: "No se encontró la conversación activa." });
    return;
  }

  try {
    const attachment = req.file ? await ingestFile(req.file) : null;
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
app.listen(config.port, () => {
  console.log(`🏋️  GymBot AI escuchando en http://localhost:${config.port}`);
  startScheduler();
});
