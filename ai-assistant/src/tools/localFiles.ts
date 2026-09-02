import { z } from "zod";
import { zodFunction } from "openai/helpers/zod";
import { readdir, readFile, stat, mkdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { config } from "../config.js";
import { ingestFile } from "../fileIngestion.js";

// Todo el acceso a archivos locales queda restringido a esta única carpeta (configurable con
// LOCAL_FILES_DIR en .env): el modelo nunca puede leer ni listar nada fuera de ella.
async function ensureDir(): Promise<void> {
  await mkdir(config.localFilesDir, { recursive: true });
}

function resolveSafePath(filename: string): string {
  const target = resolve(config.localFilesDir, filename);
  if (target !== config.localFilesDir && !target.startsWith(config.localFilesDir + sep)) {
    throw new Error("Ruta no permitida: solo se puede acceder a archivos dentro de la carpeta compartida.");
  }
  return target;
}

export const listLocalFiles = zodFunction({
  name: "list_local_files",
  description:
    "Lista los archivos disponibles en la carpeta compartida del equipo (donde el usuario deja " +
    "Excels, CSVs u otros documentos para que los uses, p.ej. el Excel con las notas de cada " +
    "cliente). Úsala siempre que el usuario mencione 'el Excel', 'la carpeta', 'el archivo de...' " +
    "sin haberlo adjuntado en el chat: así puedes encontrarlo tú mismo sin que te lo tengan que " +
    "volver a subir cada vez.",
  parameters: z.object({}),
  function: async () => {
    await ensureDir();
    const entries = await readdir(config.localFilesDir, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((e) => e.isFile())
        .map(async (e) => {
          const s = await stat(join(config.localFilesDir, e.name));
          return { filename: e.name, size_kb: Math.round(s.size / 1024), modified: s.mtime.toISOString() };
        }),
    );
    if (files.length === 0) {
      return `La carpeta compartida (${config.localFilesDir}) está vacía. Pide al usuario que deje ahí el archivo, o pregúntale la ruta.`;
    }
    return JSON.stringify(files, null, 2);
  },
});

export const readLocalFile = zodFunction({
  name: "read_local_file",
  description:
    "Lee el contenido de un archivo de la carpeta compartida (obtén el nombre exacto con " +
    "list_local_files primero). Funciona con hojas de cálculo (XLSX/XLS/CSV, se extrae celda a " +
    "celda) y archivos de texto plano (.txt, .md, .json). No puede leer imágenes ni PDFs por esta " +
    "vía: si el usuario necesita que interpretes una imagen, pídele que la adjunte en el chat.",
  parameters: z.object({
    filename: z.string().describe("Nombre exacto del archivo, tal como aparece en list_local_files."),
  }),
  function: async (input) => {
    let path: string;
    try {
      path = resolveSafePath(input.filename);
    } catch (err) {
      return err instanceof Error ? err.message : "Ruta no permitida.";
    }

    let buffer: Buffer;
    try {
      buffer = await readFile(path);
    } catch {
      return `No se encontró el archivo "${input.filename}" en la carpeta compartida. Usa list_local_files para ver los disponibles.`;
    }

    const lower = input.filename.toLowerCase();
    if (lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".json")) {
      return buffer.toString("utf-8");
    }

    try {
      const ingested = await ingestFile({ originalname: input.filename, mimetype: "", buffer });
      if (ingested.kind === "spreadsheet") return ingested.spreadsheetText ?? "";
      return "Este archivo es una imagen: pide al usuario que la adjunte directamente en el chat, no se puede leer por esta vía.";
    } catch (err) {
      return err instanceof Error ? err.message : "No se pudo leer el archivo.";
    }
  },
});
