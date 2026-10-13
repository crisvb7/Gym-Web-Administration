import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionContentPart } from "openai/resources/chat/completions";
import { config } from "./config.js";
import { buildSystemPrompt } from "./systemPrompt.js";
import { tools } from "./tools/index.js";
import { writeToolImplementations } from "./tools/registry.js";
import type { IngestedFile } from "./fileIngestion.js";

// El cliente se crea al usarse (y se recrea si cambia la clave desde Ajustes), para que el
// servidor pueda arrancar aunque todavía no esté configurado.
let openai: OpenAI | null = null;
let openaiKey = "";

export function getOpenAI(): OpenAI {
  const key = config.openaiApiKey;
  if (!key) throw new Error("Falta la clave de OpenAI: configúrala en Ajustes.");
  if (!openai || key !== openaiKey) {
    openai = new OpenAI({ apiKey: key });
    openaiKey = key;
  }
  return openai;
}

export function createConversation(): ChatCompletionMessageParam[] {
  return [{ role: "system", content: buildSystemPrompt() }];
}

// Rondas máximas de llamadas a herramientas en un solo turno. Preparar el plan mensual de un
// cliente (leer su ficha, buscarlo, consultar récords, ejercicios, recetas, asignar rutina y
// comidas, reintentar si una herramienta lo rechaza...) necesita bastantes más que las 10 que
// trae por defecto la librería.
const MAX_TOOL_ROUNDS = 40;

// Tamaño máximo (en caracteres de JSON, ~4 por token) del historial que se manda al modelo en
// cada turno. Las conversaciones largas se siguen guardando enteras en disco, pero al modelo solo
// se le mandan los mensajes más recientes que quepan, para no superar su límite de contexto.
const MAX_CONTEXT_CHARS = 240_000;

/**
 * Recorta el historial a los mensajes más recientes que quepan en MAX_CONTEXT_CHARS, cortando
 * siempre justo antes de un mensaje del usuario (nunca a mitad de una llamada a herramienta, que
 * la API rechazaría). El primer mensaje (system) se sustituye por uno recién generado, con la
 * fecha de hoy: si no, una conversación antigua seguiría creyendo que "hoy" es el día en que se
 * creó.
 */
function buildContext(messages: ChatCompletionMessageParam[]): ChatCompletionMessageParam[] {
  const system: ChatCompletionMessageParam = { role: "system", content: buildSystemPrompt() };
  const rest = messages[0]?.role === "system" ? messages.slice(1) : messages;

  let size = 0;
  let cut = rest.length;
  for (let i = rest.length - 1; i >= 0; i--) {
    size += JSON.stringify(rest[i]).length;
    if (size > MAX_CONTEXT_CHARS && cut < rest.length) break;
    if (rest[i].role === "user") cut = i;
  }
  return [system, ...rest.slice(cut)];
}

export interface PendingAction {
  tool: string;
  args: Record<string, unknown>;
  summary: string;
}

export interface ChatTurnResult {
  reply: string;
  toolsUsed: string[];
  messages: ChatCompletionMessageParam[];
  pendingActions: PendingAction[];
}

/**
 * Busca, en TODOS los mensajes nuevos de un turno (no solo la última tanda de tool_calls), cada
 * llamada a una herramienta de escritura que haya terminado pidiendo confirmación
 * (requiere_confirmacion). Un mismo turno puede proponer varias acciones distintas (p.ej. una
 * rutina Y un plan de comidas a la vez): cada una necesita su propia confirmación independiente,
 * así que devolvemos TODAS, no solo la última.
 */
function findPendingActions(turnMessages: ChatCompletionMessageParam[]): PendingAction[] {
  const results: PendingAction[] = [];

  for (let i = 0; i < turnMessages.length; i++) {
    const msg = turnMessages[i];
    if (msg.role !== "assistant" || !("tool_calls" in msg) || !msg.tool_calls || msg.tool_calls.length === 0) {
      continue;
    }

    const toolCalls = msg.tool_calls as Array<{ id: string; type: string; function: { name: string; arguments: string } }>;

    for (const call of toolCalls) {
      if (call.type !== "function") continue;

      for (let j = i + 1; j < turnMessages.length; j++) {
        const m = turnMessages[j] as { role: string; tool_call_id?: string; content?: unknown };
        if (m.role !== "tool" || m.tool_call_id !== call.id) continue;

        const content = typeof m.content === "string" ? m.content : null;
        if (content) {
          try {
            const parsed = JSON.parse(content);
            if (parsed?.requiere_confirmacion) {
              results.push({ tool: call.function.name, args: JSON.parse(call.function.arguments), summary: parsed.resumen });
            }
          } catch {
            // No era un JSON de confirmación pendiente: no hay acción pendiente para esta tool_call.
          }
        }
        break;
      }
    }
  }

  return results;
}

const ARCHIVE_HINT =
  "Si hay que guardarlo en la carpeta, usa save_attachment_to_folder con este nombre de adjunto, " +
  "para conservar el documento original";

function buildUserContent(userInput: string, attachment?: IngestedFile | null): string | ChatCompletionContentPart[] {
  if (!attachment) return userInput;

  if (attachment.kind === "image") {
    const text = userInput.trim() || "Interpreta esta imagen.";
    return [
      { type: "text", text: `${text}\n\n(Imagen adjunta: "${attachment.filename}". ${ARCHIVE_HINT})` },
      { type: "image_url", image_url: { url: attachment.imageDataUrl!, detail: "high" } },
    ];
  }

  // Documento (PDF, Word, Excel, CSV, texto): el contenido ya se extrajo en el servidor (más
  // fiable que pedirle al modelo que "lea" una captura), se lo pasamos como texto.
  const text = userInput.trim() || "Interpreta el contenido de este archivo.";
  return (
    `${text}\n\n(Archivo adjunto: "${attachment.filename}". ${ARCHIVE_HINT})\n\n` +
    `--- Contenido del archivo adjunto (texto extraído del archivo, es su contenido EXACTO) ---\n${attachment.text}`
  );
}

/**
 * Envía un mensaje del usuario, deja que el modelo llame a las herramientas necesarias, y
 * devuelve la respuesta final junto con el historial actualizado (incluye las llamadas a
 * herramientas, para que el siguiente turno mantenga contexto).
 */
export async function runChatTurn(
  messages: ChatCompletionMessageParam[],
  userInput: string,
  attachment?: IngestedFile | null,
): Promise<ChatTurnResult> {
  const userMessage: ChatCompletionMessageParam = { role: "user", content: buildUserContent(userInput, attachment) };
  const context = [...buildContext(messages), userMessage];

  const runner = getOpenAI().chat.completions.runTools(
    { model: config.openaiModel, messages: context, tools },
    { maxChatCompletions: MAX_TOOL_ROUNDS },
  );

  const toolsUsed: string[] = [];
  runner.on("functionToolCall", (call) => {
    toolsUsed.push(call.name);
  });

  const reply = await runner.finalContent();
  // Mensajes nuevos de este turno (llamadas a herramientas y respuesta), que se añaden al
  // historial COMPLETO (no al recortado que se le mandó al modelo).
  const turnMessages = [userMessage, ...runner.messages.slice(context.length)];

  return {
    reply: reply ?? "(sin respuesta de texto)",
    toolsUsed,
    messages: [...messages, ...turnMessages],
    pendingActions: findPendingActions(turnMessages),
  };
}

/**
 * Ejecuta DIRECTAMENTE (sin pasar por el modelo) una acción que quedó pendiente de confirmación,
 * usando exactamente los argumentos que el modelo propuso y que ya se le mostraron al usuario.
 * Esto es lo que dispara el botón "Confirmar" de la interfaz: el resultado que ve el usuario es
 * el texto real que devuelve la herramienta, nunca una frase generada por el modelo.
 */
export async function executeConfirmedAction(
  pending: PendingAction,
  messages: ChatCompletionMessageParam[],
): Promise<{ reply: string; messages: ChatCompletionMessageParam[] }> {
  const impl = writeToolImplementations[pending.tool];
  if (!impl) {
    return { reply: `No se reconoce la acción pendiente "${pending.tool}".`, messages };
  }

  const result = await impl({ ...pending.args, confirmed: true });

  const updated: ChatCompletionMessageParam[] = [
    ...messages,
    { role: "user", content: `(Confirmado mediante el botón de la interfaz: ${pending.summary})` },
    { role: "assistant", content: result },
  ];

  return { reply: result, messages: updated };
}

export function cancelPendingAction(
  pending: PendingAction,
  messages: ChatCompletionMessageParam[],
): { reply: string; messages: ChatCompletionMessageParam[] } {
  const reply = "Entendido, no se ha realizado ningún cambio.";
  const updated: ChatCompletionMessageParam[] = [
    ...messages,
    { role: "user", content: `(Cancelado mediante el botón de la interfaz: ${pending.summary})` },
    { role: "assistant", content: reply },
  ];
  return { reply, messages: updated };
}
