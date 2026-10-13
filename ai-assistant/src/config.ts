import dotenv from "dotenv";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

// Cuando la app de escritorio (Electron) arranca el servidor, le pasa OLIMPIA_DATA_DIR apuntando a
// la carpeta de datos del usuario del sistema operativo (p.ej. %APPDATA%\OlimpIA en Windows) en
// vez de la carpeta del proyecto — necesario porque una app instalada normalmente no puede
// escribir dentro de su propia carpeta de instalación (Archivos de programa). En `npm start`
// normal esta variable no existe, así que se sigue usando la carpeta del proyecto de siempre.
const DATA_ROOT = resolve(process.env.OLIMPIA_DATA_DIR || PROJECT_ROOT);

// Dónde vive la configuración (.env). La app de escritorio lo guarda en la carpeta de datos del
// usuario; en desarrollo es el .env del proyecto. Se puede editar desde la pantalla de Ajustes.
export const ENV_FILE = resolve(process.env.OLIMPIA_ENV_FILE || join(PROJECT_ROOT, ".env"));
dotenv.config({ path: ENV_FILE, quiet: true });

const DEFAULT_SUPABASE_URL = "https://vnockjqtkbhgytmmbdlb.supabase.co";
const DEFAULT_MODEL = "gpt-5.5";

// Carpeta por defecto para las fichas/archivos: la app de escritorio usa Documentos\OlimpIA (algo
// que el dueño del gimnasio ve y abre fácilmente); en desarrollo, ./shared-files.
const DEFAULT_FILES_DIR = resolve(process.env.OLIMPIA_DEFAULT_FILES_DIR || join(DATA_ROOT, "shared-files"));

// Valores fijados por código en vez de por el .env: los usa el worker de la nube (Supabase), que
// recibe sus claves de los secretos de la función y de la tabla olimpia_settings.
const overrides: Record<string, string | undefined> = {};

export function overrideSettings(values: Record<string, string | undefined>): void {
  Object.assign(overrides, values);
}

/** Lee una variable de entorno tratando el texto vacío ("CLAVE=" en el .env) como no definida. */
function env(name: string): string | undefined {
  const value = (overrides[name] ?? process.env[name])?.trim();
  return value ? value : undefined;
}

// Getters (no valores fijos): la configuración se puede cambiar desde la pantalla de Ajustes sin
// reiniciar, y todo el código lee siempre el valor actual.
export const config = {
  get openaiApiKey() {
    return env("OPENAI_API_KEY");
  },
  get openaiModel() {
    return env("OPENAI_MODEL") ?? DEFAULT_MODEL;
  },
  get supabaseUrl() {
    return env("SUPABASE_URL") ?? DEFAULT_SUPABASE_URL;
  },
  get supabaseServiceRoleKey() {
    return env("SUPABASE_SERVICE_ROLE_KEY");
  },
  // Por defecto OlimpIA hace directamente lo que se le pide; con REQUIRE_CONFIRMATION=true, los
  // cambios en la base de datos esperan al botón Confirmar.
  get requireConfirmation() {
    return env("REQUIRE_CONFIRMATION") === "true";
  },
  port: Number(env("PORT") ?? 3000),
  // Solo escucha en este ordenador: el servidor usa la service_role key (acceso total a la base de
  // datos) y no tiene login, así que NUNCA debe ser accesible desde otros equipos de la red.
  host: "127.0.0.1",
  // Carpeta que el asistente puede leer en cualquier momento (fichas de clientes, Excels...), sin
  // que el usuario tenga que adjuntarla cada vez desde el chat.
  get localFilesDir() {
    return resolve(env("LOCAL_FILES_DIR") ?? DEFAULT_FILES_DIR);
  },
  dataDir: join(DATA_ROOT, "data"),
};

/** Ajustes obligatorios que faltan para poder usar el asistente (vacío = todo listo). */
export function missingSettings(): string[] {
  const missing: string[] = [];
  if (!config.openaiApiKey) missing.push("OPENAI_API_KEY");
  if (!config.supabaseServiceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  return missing;
}

export const EDITABLE_SETTINGS = [
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "LOCAL_FILES_DIR",
  "REQUIRE_CONFIRMATION",
] as const;
export type EditableSetting = (typeof EDITABLE_SETTINGS)[number];

/**
 * Guarda ajustes en el .env (conservando comentarios y el resto de líneas) y los aplica al
 * proceso actual al momento.
 */
export async function saveSettings(updates: Partial<Record<EditableSetting, string>>): Promise<void> {
  let lines: string[] = [];
  try {
    lines = (await readFile(ENV_FILE, "utf-8")).split(/\r?\n/);
  } catch {
    // Aún no existe: se crea.
  }

  for (const [key, rawValue] of Object.entries(updates)) {
    if (rawValue === undefined) continue;
    const value = rawValue.replace(/[\r\n]/g, "").trim();
    const index = lines.findIndex((l) => l.trim().startsWith(`${key}=`));
    if (index >= 0) lines[index] = `${key}=${value}`;
    else lines.push(`${key}=${value}`);
    process.env[key] = value;
  }

  await mkdir(dirname(ENV_FILE), { recursive: true });
  await writeFile(ENV_FILE, lines.join("\n").replace(/\n*$/, "\n"), "utf-8");
}
