import { readdir, readFile, writeFile, mkdir, stat, unlink } from "node:fs/promises";
import { basename, join } from "node:path";
import { config } from "./config.js";

// Copia de los últimos archivos adjuntados en el chat, para que el asistente pueda guardarlos
// después en la carpeta de fichas si se lo piden ("guarda esta ficha como la de Juan Pérez").
const UPLOADS_DIR = join(config.dataDir, "uploads");
const MAX_KEPT = 30;

function safeName(name: string): string {
  return basename(name).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_") || "archivo";
}

export async function rememberUpload(originalName: string, buffer: Buffer): Promise<void> {
  await mkdir(UPLOADS_DIR, { recursive: true });
  await writeFile(join(UPLOADS_DIR, safeName(originalName)), buffer);

  const entries = await readdir(UPLOADS_DIR);
  if (entries.length <= MAX_KEPT) return;
  const withTimes = await Promise.all(
    entries.map(async (name) => ({ name, mtime: (await stat(join(UPLOADS_DIR, name))).mtimeMs })),
  );
  withTimes.sort((a, b) => b.mtime - a.mtime);
  await Promise.all(withTimes.slice(MAX_KEPT).map((e) => unlink(join(UPLOADS_DIR, e.name)).catch(() => {})));
}

export async function readUpload(originalName: string): Promise<Buffer | null> {
  try {
    return await readFile(join(UPLOADS_DIR, safeName(originalName)));
  } catch {
    return null;
  }
}
