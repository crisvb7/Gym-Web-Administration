import "dotenv/config";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. Copia .env.example a .env y complétala.`,
    );
  }
  return value;
}

// Cuando la app de escritorio (Electron) arranca el servidor, le pasa GYMBOT_DATA_DIR apuntando a
// la carpeta de datos del usuario del sistema operativo (p.ej. %APPDATA%\GymBot AI en Windows) en
// vez de la carpeta del proyecto — necesario porque una app instalada normalmente no puede
// escribir dentro de su propia carpeta de instalación (Archivos de programa). En `npm start`
// normal esta variable no existe, así que se sigue usando la carpeta del proyecto de siempre.
const DATA_ROOT = process.env.GYMBOT_DATA_DIR ? resolve(process.env.GYMBOT_DATA_DIR) : PROJECT_ROOT;

export const config = {
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o",
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  port: Number(process.env.PORT ?? 3000),
  // Carpeta que el asistente puede leer en cualquier momento (p.ej. el Excel de rutinas), sin que
  // el usuario tenga que adjuntarla cada vez desde el chat. Por defecto, una carpeta dentro del
  // proyecto (o de los datos de usuario en la app de escritorio); puedes apuntarla a cualquier
  // carpeta real del equipo en .env.
  localFilesDir: resolve(process.env.LOCAL_FILES_DIR ?? join(DATA_ROOT, "shared-files")),
  dataDir: join(DATA_ROOT, "data"),
};
