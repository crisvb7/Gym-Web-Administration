import OpenAI from "openai";
import { rl, askQuestion } from "./cli.js";
import {
  createConversation,
  runChatTurn,
  executeConfirmedAction,
  cancelPendingAction,
} from "./chatEngine.js";

const EXIT_WORDS = ["salir", "exit", "quit"];
const YES_WORDS = ["s", "si", "sí", "y", "yes", "confirmar", "confirmo"];

let messages = createConversation();

async function main() {
  console.log("🏋️  Asistente de administración del gimnasio");
  console.log(`Escribe tu petición (o "${EXIT_WORDS[0]}" para terminar).\n`);
  console.log("Tip: también puedes ejecutar `npm start` para usar la interfaz de chat en el navegador.\n");

  while (true) {
    const userInput = (await askQuestion("\nTú> ")).trim();
    if (EXIT_WORDS.includes(userInput.toLowerCase())) break;
    if (!userInput) continue;

    try {
      const result = await runChatTurn(messages, userInput);
      messages = result.messages;
      for (const toolName of result.toolsUsed) {
        console.log(`  ↳ usando herramienta: ${toolName}`);
      }
      console.log(`\nAsistente> ${result.reply}`);

      // Si el modelo dejó una o varias acciones pendientes de confirmar (p.ej. una rutina Y un
      // plan de comidas a la vez), las resolvemos aquí una a una, en vez de fiarnos de que el
      // modelo las repita bien.
      for (const pending of result.pendingActions) {
        const answer = (await askQuestion(`\n⚠️  ${pending.summary}\n¿Confirmas? (s/n) > `))
          .trim()
          .toLowerCase();
        const approved = YES_WORDS.includes(answer);
        const outcome = approved
          ? await executeConfirmedAction(pending, messages)
          : cancelPendingAction(pending, messages);
        messages = outcome.messages;
        console.log(`\nAsistente> ${outcome.reply}`);
      }
    } catch (err) {
      if (err instanceof OpenAI.AuthenticationError) {
        console.error("Error de autenticación: revisa tu OPENAI_API_KEY en .env");
      } else if (err instanceof OpenAI.RateLimitError) {
        console.error("Límite de peticiones alcanzado, inténtalo de nuevo en unos segundos.");
      } else if (err instanceof OpenAI.APIError) {
        console.error(`Error de la API de OpenAI: ${err.message}`);
      } else {
        console.error("Error inesperado:", err instanceof Error ? err.message : err);
      }
      messages.pop(); // no dejamos el turno fallido en el historial
    }
  }

  rl.close();
  console.log("\nHasta luego.");
}

main();
