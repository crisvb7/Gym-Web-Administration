// Tareas automáticas de OlimpIA en la nube. Ahora mismo no la llama nada: el aviso periódico desde
// GitHub Actions se quitó el 16/10/2026 mientras se replantea OlimpIA. Se llama con el secreto
// x-olimpia-secret; responde al momento y hace el trabajo en segundo plano.
//
// La lógica está en ai-assistant/src/cloud/worker.ts; worker.bundle.js se genera con
// `npm run build:cloud` desde ai-assistant/. Despliegue:
//   npx supabase functions deploy olimpia-tasks --no-verify-jwt --use-api
import { overrideSettings, tick, verifySecret } from "./worker.bundle.js";

overrideSettings({
  SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
  SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
});

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

Deno.serve(async (req) => {
  if (!(await verifySecret(req.headers.get("x-olimpia-secret") ?? ""))) {
    return new Response("No autorizado", { status: 401 });
  }
  const work = tick()
    .then((log) => {
      if (log.length > 0) console.log(log.join("\n"));
    })
    .catch((err) => console.error("Error en las tareas de OlimpIA:", err));
  EdgeRuntime.waitUntil(work);
  return new Response("ok");
});
