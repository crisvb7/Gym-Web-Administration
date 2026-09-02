import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

export const rl = readline.createInterface({ input: stdin, output: stdout });

// Si la entrada estándar se cierra (Ctrl+D, o el proceso que nos alimenta termina), evitamos
// que una nueva llamada a rl.question() lance ERR_USE_AFTER_CLOSE.
let closed = false;
rl.on("close", () => {
  closed = true;
});

export async function askQuestion(prompt: string): Promise<string> {
  if (closed) return "salir";
  try {
    return await rl.question(prompt);
  } catch {
    return "salir";
  }
}
