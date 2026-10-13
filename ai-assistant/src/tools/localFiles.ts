import { z } from "zod";
import { zodFunction } from "openai/helpers/zod";
import { readdir, readFile, stat, mkdir, writeFile, appendFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { config, saveSettings } from "../config.js";
import { ingestFile, isImageFile } from "../fileIngestion.js";
import { readUpload } from "../uploads.js";

// Todo el acceso a archivos locales queda restringido a esta única carpeta (configurable en
// Ajustes): el modelo nunca puede leer, listar ni escribir nada fuera de ella.
export async function ensureFilesDir(): Promise<void> {
  await mkdir(config.localFilesDir, { recursive: true });
}

export function resolveSafePath(relativePath: string): string {
  const root = config.localFilesDir;
  const target = resolve(root, relativePath.replace(/^[/\\]+/, ""));
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error("Ruta no permitida: solo se puede acceder a archivos dentro de la carpeta compartida.");
  }
  return target;
}

/** Ruta relativa a la carpeta compartida, siempre con "/" (también en Windows). */
export function toRelative(absolutePath: string): string {
  return relative(config.localFilesDir, absolutePath).split(sep).join("/");
}

export interface FileEntry {
  path: string;
  type: "file" | "folder";
  size_kb?: number;
  modified?: string;
}

const MAX_LISTED = 500;

export async function listFilesRecursive(startDir: string, maxDepth = 4): Promise<FileEntry[]> {
  const out: FileEntry[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (out.length >= MAX_LISTED) return;
    const entries = await readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name, "es"));
    for (const e of entries) {
      if (out.length >= MAX_LISTED) return;
      if (e.name.startsWith(".") || e.name.startsWith("~$")) continue; // ocultos y temporales de Office
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        out.push({ path: toRelative(full) + "/", type: "folder" });
        if (depth < maxDepth) await walk(full, depth + 1);
      } else if (e.isFile()) {
        const s = await stat(full);
        out.push({
          path: toRelative(full),
          type: "file",
          size_kb: Math.round(s.size / 1024),
          modified: s.mtime.toISOString().slice(0, 10),
        });
      }
    }
  }

  await walk(startDir, 1);
  return out;
}

/** Lee un archivo de la carpeta compartida y devuelve su texto (o un mensaje de error legible). */
export async function readFileAsText(relativePath: string): Promise<string> {
  let path: string;
  try {
    path = resolveSafePath(relativePath);
  } catch (err) {
    return err instanceof Error ? err.message : "Ruta no permitida.";
  }

  let buffer: Buffer;
  try {
    buffer = await readFile(path);
  } catch {
    return `No se encontró el archivo "${relativePath}" en la carpeta compartida. Usa list_local_files para ver los disponibles.`;
  }

  if (isImageFile(path)) {
    return (
      `"${relativePath}" es una imagen y no se puede leer por esta vía. Si contiene información ` +
      "necesaria, pide al usuario que la adjunte en el chat o que la pase a PDF/Word con texto."
    );
  }

  try {
    const ingested = await ingestFile({ originalname: relativePath, mimetype: "", buffer });
    return ingested.text ?? "";
  } catch (err) {
    return err instanceof Error ? err.message : "No se pudo leer el archivo.";
  }
}

export const listLocalFiles = zodFunction({
  name: "list_local_files",
  description:
    "Lista los archivos y subcarpetas de la carpeta compartida del gimnasio (p.ej. la carpeta " +
    "'Fichas' con la ficha de cada cliente, Excels, PDFs, Word...). Úsala siempre que el usuario " +
    "mencione una ficha, 'el Excel', 'la carpeta', 'el archivo de...' sin haberlo adjuntado: así " +
    "lo encuentras tú mismo. Las rutas que devuelve son las que hay que pasar a read_local_file.",
  parameters: z.object({
    subfolder: z
      .string()
      .nullable()
      .optional()
      .describe("Subcarpeta a listar (p.ej. 'Fichas'). Vacío para listar toda la carpeta compartida."),
  }),
  function: async (input) => {
    await ensureFilesDir();
    let dir: string;
    try {
      dir = resolveSafePath(input.subfolder ?? "");
      if (!(await stat(dir)).isDirectory()) return `"${input.subfolder}" no es una carpeta.`;
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Ruta no permitida")) return err.message;
      return `No existe la carpeta "${input.subfolder}" dentro de la carpeta compartida.`;
    }

    const files = await listFilesRecursive(dir);
    if (files.length === 0) {
      return (
        `La carpeta ${input.subfolder ? `"${input.subfolder}"` : `compartida (${config.localFilesDir})`} ` +
        "está vacía. Pide al usuario que deje ahí los archivos."
      );
    }
    return JSON.stringify(
      { carpeta_compartida: config.localFilesDir, archivos: files, ...(files.length >= MAX_LISTED ? { aviso: "Lista recortada a 500 elementos." } : {}) },
      null,
      2,
    );
  },
});

export const readLocalFile = zodFunction({
  name: "read_local_file",
  description:
    "Lee el contenido de un archivo de la carpeta compartida (obtén la ruta exacta con " +
    "list_local_files primero, p.ej. 'Fichas/Juan Pérez.pdf'). Lee PDF con texto, Word (.docx), " +
    "Excel (XLSX/XLS, celda a celda), CSV y texto (.txt/.md/.rtf/.json). Las imágenes no se " +
    "pueden leer por esta vía: pide al usuario que las adjunte en el chat.",
  parameters: z.object({
    filename: z.string().describe("Ruta del archivo tal como aparece en list_local_files (puede incluir subcarpetas)."),
  }),
  function: async (input) => readFileAsText(input.filename),
});

export const createLocalFolder = zodFunction({
  name: "create_local_folder",
  description:
    "Crea una carpeta (o subcarpetas) dentro de la carpeta compartida, p.ej. 'Fichas' para " +
    "guardar ahí la ficha de cada cliente. No borra ni modifica nada existente.",
  parameters: z.object({
    path: z.string().describe("Ruta de la carpeta a crear, relativa a la carpeta compartida (p.ej. 'Fichas')."),
  }),
  function: async (input) => {
    try {
      const dir = resolveSafePath(input.path);
      await mkdir(dir, { recursive: true });
      return `Carpeta lista: ${toRelative(dir)}/ (en ${config.localFilesDir}).`;
    } catch (err) {
      return err instanceof Error ? err.message : "No se pudo crear la carpeta.";
    }
  },
});

const WRITABLE_TEXT_EXTENSIONS = [".txt", ".md"];

export const saveLocalFile = zodFunction({
  name: "save_local_file",
  description:
    "Escribe un archivo de texto (.txt o .md) en la carpeta compartida, p.ej. para crear o " +
    "actualizar la ficha de un cliente con lo que el usuario te cuente por el chat " +
    "('Fichas/Juan Pérez.md'). Crea las subcarpetas que hagan falta. Usa mode='append' para " +
    "añadir información a una ficha existente sin perder lo anterior (lo normal al anotar " +
    "novedades: lesiones, objetivos, peso...). 'overwrite' reemplaza todo el contenido: úsalo solo " +
    "si el usuario pide expresamente reescribir la ficha.",
  parameters: z.object({
    path: z.string().describe("Ruta del archivo relativa a la carpeta compartida, terminada en .md o .txt."),
    content: z.string().describe("Texto a escribir."),
    mode: z.enum(["create", "append", "overwrite"]).describe("create: solo si no existe; append: añadir al final; overwrite: reemplazar."),
  }),
  function: async (input) => {
    let path: string;
    try {
      path = resolveSafePath(input.path);
    } catch (err) {
      return err instanceof Error ? err.message : "Ruta no permitida.";
    }
    if (!WRITABLE_TEXT_EXTENSIONS.includes(extname(path).toLowerCase())) {
      return "Solo se pueden escribir archivos .md o .txt (para no estropear PDFs, Word o Excels existentes).";
    }

    await mkdir(dirname(path), { recursive: true });
    const exists = await stat(path).then(() => true, () => false);

    if (input.mode === "create" && exists) {
      return `Ya existe "${toRelative(path)}". Usa mode='append' para añadir información o 'overwrite' si el usuario quiere reemplazarla.`;
    }
    if (input.mode === "append" && exists) {
      await appendFile(path, `\n\n${input.content}`, "utf-8");
      return `Información añadida al final de "${toRelative(path)}".`;
    }
    await writeFile(path, input.content, "utf-8");
    return `Archivo guardado: "${toRelative(path)}".`;
  },
});

export const saveAttachmentToFolder = zodFunction({
  name: "save_attachment_to_folder",
  description:
    "Guarda en la carpeta compartida un archivo que el usuario adjuntó en el chat (con 📎), p.ej. " +
    "la ficha en PDF de un cliente nuevo → 'Fichas/María López.pdf'. Úsala cuando el usuario " +
    "te pida guardar/archivar el adjunto. Nunca sobrescribe un archivo existente.",
  parameters: z.object({
    attachment_filename: z.string().describe("Nombre del archivo adjunto, tal como aparece en el mensaje del usuario."),
    target_path: z
      .string()
      .describe("Ruta de destino relativa a la carpeta compartida, con la misma extensión (p.ej. 'Fichas/María López.pdf')."),
  }),
  function: async (input) => {
    const buffer = await readUpload(input.attachment_filename);
    if (!buffer) {
      return `No encuentro el adjunto "${input.attachment_filename}". Pide al usuario que lo vuelva a adjuntar.`;
    }
    let target: string;
    try {
      target = resolveSafePath(input.target_path);
    } catch (err) {
      return err instanceof Error ? err.message : "Ruta no permitida.";
    }
    if (extname(target).toLowerCase() !== extname(input.attachment_filename).toLowerCase()) {
      target += extname(input.attachment_filename);
    }
    if (await stat(target).then(() => true, () => false)) {
      return `Ya existe "${toRelative(target)}": elige otro nombre o pide al usuario que borre el anterior.`;
    }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, buffer);
    return `Adjunto guardado en "${toRelative(target)}".`;
  },
});

// Para la carpeta de fichas de las tareas programadas: cada archivo es la ficha de un cliente (el
// nombre del archivo es su nombre), o cada subcarpeta es un cliente con uno o varios documentos.
export interface ClientRecord {
  clientName: string;
  files: string[];
}

export async function listClientRecords(folder: string): Promise<ClientRecord[]> {
  const dir = resolveSafePath(folder);
  const entries = await readdir(dir, { withFileTypes: true });
  const records: ClientRecord[] = [];

  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name, "es"))) {
    if (e.name.startsWith(".") || e.name.startsWith("~$")) continue;
    const full = join(dir, e.name);
    if (e.isFile()) {
      records.push({ clientName: e.name.replace(/\.[^.]+$/, ""), files: [toRelative(full)] });
    } else if (e.isDirectory()) {
      const files = (await listFilesRecursive(full, 2)).filter((f) => f.type === "file").map((f) => f.path);
      if (files.length > 0) records.push({ clientName: e.name, files });
    }
  }
  return records;
}

// Carpetas base donde buscar cuando el usuario dice "Escritorio/Fichas", "Documentos/Clientes"...
// (en Windows con OneDrive, el Escritorio y Documentos suelen vivir dentro de OneDrive).
const HOME_ALIASES: Record<string, string[]> = {
  escritorio: ["Desktop", "Escritorio", "OneDrive/Desktop", "OneDrive/Escritorio"],
  desktop: ["Desktop", "Escritorio", "OneDrive/Desktop", "OneDrive/Escritorio"],
  documentos: ["Documents", "Documentos", "OneDrive/Documents", "OneDrive/Documentos"],
  documents: ["Documents", "Documentos", "OneDrive/Documents", "OneDrive/Documentos"],
  descargas: ["Downloads", "Descargas"],
  downloads: ["Downloads", "Descargas"],
};

async function isDirectory(path: string): Promise<boolean> {
  return stat(path).then((s) => s.isDirectory(), () => false);
}

/** Convierte lo que diga el usuario ("Escritorio/Fichas", "~/Fichas", "C:\\Clientes") en carpetas reales candidatas. */
async function resolveUserFolder(input: string): Promise<string[]> {
  const raw = input.trim().replace(/^["']|["']$/g, "");
  const home = homedir();
  if (raw.startsWith("~")) return [resolve(home, raw.slice(1).replace(/^[/\\]+/, ""))];
  if (isAbsolute(raw) || /^[a-zA-Z]:[\\/]/.test(raw)) return [resolve(raw)];

  const parts = raw.split(/[/\\]+/).filter(Boolean);
  const first = parts[0]?.toLowerCase() ?? "";
  const bases = HOME_ALIASES[first]
    ? HOME_ALIASES[first].map((b) => join(home, b, ...parts.slice(1)))
    : [join(home, ...parts), ...HOME_ALIASES.escritorio.concat(HOME_ALIASES.documentos).map((b) => join(home, b, ...parts))];
  const existing: string[] = [];
  for (const candidate of bases) {
    if ((await isDirectory(candidate)) && !existing.includes(candidate)) existing.push(candidate);
  }
  return existing.length > 0 ? existing : [bases[0]];
}

export const setFilesFolder = zodFunction({
  name: "set_files_folder",
  description:
    "Cambia la carpeta del ordenador que usas para las fichas y archivos (la carpeta compartida), " +
    "cuando el usuario te dice dónde las tiene: p.ej. 'las fichas están en el escritorio, en la " +
    "carpeta Fichas' → path='Escritorio/Fichas'. Acepta una ruta completa (C:\\Users\\...\\Fichas, " +
    "/Users/.../Fichas) o una relativa a la carpeta del usuario empezando por Escritorio, " +
    "Documentos o Descargas. A partir de entonces list_local_files/read_local_file y las tareas " +
    "por cliente trabajan sobre esa carpeta (las rutas de las fichas pasan a ser relativas a ella).",
  parameters: z.object({
    path: z.string().describe("Carpeta indicada por el usuario (ruta completa, o p.ej. 'Escritorio/Fichas')."),
    create_if_missing: z
      .boolean()
      .nullable()
      .optional()
      .describe("true si el usuario quiere que la crees en caso de que no exista."),
  }),
  function: async (input) => {
    const candidates = await resolveUserFolder(input.path);
    if (candidates.length > 1) {
      return `Hay varias carpetas que encajan: ${candidates.join(" | ")}. Pregunta al usuario cuál es.`;
    }
    const target = candidates[0];
    if (!(await isDirectory(target))) {
      if (!input.create_if_missing) {
        return `No existe la carpeta "${target}". Pregunta al usuario si quiere que la cree (create_if_missing=true) o si está en otro sitio.`;
      }
      await mkdir(target, { recursive: true });
    }
    const previous = config.localFilesDir;
    await saveSettings({ LOCAL_FILES_DIR: target });
    const files = await listFilesRecursive(target, 2);
    return JSON.stringify({
      carpeta_nueva: target,
      carpeta_anterior: previous,
      aviso:
        "Las rutas de list_local_files/read_local_file son ahora relativas a la carpeta nueva. Si hay " +
        "tareas programadas por cliente que usaban una subcarpeta de la carpeta anterior (p.ej. 'Fichas'), " +
        "revisa con list_scheduled_tasks si hay que recrearlas con client_files_folder='' (la propia carpeta).",
      contenido: files.slice(0, 50),
    });
  },
});
