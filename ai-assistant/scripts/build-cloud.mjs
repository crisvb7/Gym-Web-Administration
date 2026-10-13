// Empaqueta el worker de las tareas en la nube (src/cloud/edge.ts y todo lo que usa: herramientas,
// system prompt, comprobaciones...) en un solo archivo para la función olimpia-tasks de Supabase.
// Así la nube ejecuta exactamente el mismo código que la app de escritorio.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outfile = join(root, "..", "supabase", "functions", "olimpia-tasks", "worker.bundle.js");

await build({
  entryPoints: [join(root, "src", "cloud", "edge.ts")],
  outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "es2022",
  // En la nube no hay .env: las claves llegan por overrideSettings().
  alias: { dotenv: join(root, "scripts", "dotenv-stub.mjs") },
  banner: {
    js: [
      "// GENERADO por ai-assistant/scripts/build-cloud.mjs (npm run build:cloud). No editar a mano.",
      'import { createRequire as __createRequire } from "node:module";',
      'import __nodeProcess from "node:process";',
      "const require = __createRequire(import.meta.url);",
      "globalThis.process ??= __nodeProcess;",
    ].join("\n"),
  },
  logLevel: "info",
});
