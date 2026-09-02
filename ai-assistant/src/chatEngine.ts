import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionContentPart } from "openai/resources/chat/completions";
import { config } from "./config.js";
import { buildSystemPrompt } from "./systemPrompt.js";
import { tools } from "./tools/index.js";
import { writeToolImplementations } from "./tools/registry.js";
import type { IngestedFile } from "./fileIngestion.js";

export const client = new OpenAI(config.openaiApiKey ? { apiKey: config.openaiApiKey } : {});

export function createConversation(): ChatCompletionMessageParam[] {
  return [{ role: "system", content: buildSystemPrompt() }];
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

function buildUserContent(userInput: string, attachment?: IngestedFile | null): string | ChatCompletionContentPart[] {
  if (!attachment) return userInput;

  if (attachment.kind === "image") {
    const text = userInput.trim() || "Interpreta esta imagen (contiene una tabla de ejercicios o comidas).";
    return [
      { type: "text", text: `${text}\n\n(Imagen adjunta: ${attachment.filename})` },
      { type: "image_url", image_url: { url: attachment.imageDataUrl!, detail: "high" } },
    ];
  }

  // Hoja de cálculo/CSV: el contenido ya se extrajo celda a celda en el servidor (más fiable que
  // pedirle al modelo que "lea" una captura de la hoja), se lo pasamos como texto.
  const text = userInput.trim() || "Interpreta el contenido de este archivo.";
  return (
    `${text}\n\n--- Contenido del archivo adjunto "${attachment.filename}" (extraído celda a celda, ` +
    `es el contenido EXACTO del archivo) ---\n${attachment.spreadsheetText}`
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
  const startIndex = messages.length;
  messages.push({ role: "user", content: buildUserContent(userInput, attachment) });

  const runner = client.chat.completions.runTools({
    model: config.openaiModel,
    messages,
    tools,
  });

  const toolsUsed: string[] = [];
  runner.on("functionToolCall", (call) => {
    toolsUsed.push(call.name);
  });

  const reply = await runner.finalContent();
  const updatedMessages = runner.messages;

  return {
    reply: reply ?? "(sin respuesta de texto)",
    toolsUsed,
    messages: updatedMessages,
    pendingActions: findPendingActions(updatedMessages.slice(startIndex)),
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
