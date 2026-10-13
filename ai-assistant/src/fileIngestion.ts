import ExcelJS from "exceljs";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

export interface IngestedFile {
  /** image: se le pasa la imagen al modelo (visión). document: ya se ha extraído su texto. */
  kind: "image" | "document";
  filename: string;
  /** Para imágenes: data URL en base64 lista para enviar como content de tipo image_url. */
  imageDataUrl?: string;
  /** Para documentos (PDF, Word, Excel, CSV, texto): su contenido en texto plano. */
  text?: string;
}

interface UploadedFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

const MAX_FILE_BYTES = 15 * 1024 * 1024;

// Límite de texto que se le pasa al modelo de un solo archivo (~25k tokens): una ficha de cliente
// ocupa mucho menos, esto solo evita que un documento enorme agote el contexto de la conversación.
const MAX_TEXT_CHARS = 100_000;

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
const TEXT_EXTENSIONS = [".txt", ".md", ".json", ".rtf"];

/** Extensiones que el asistente sabe leer, para listarlas y filtrar carpetas. */
export const SUPPORTED_EXTENSIONS = [
  ...IMAGE_EXTENSIONS,
  ...TEXT_EXTENSIONS,
  ".csv",
  ".xlsx",
  ".xls",
  ".pdf",
  ".docx",
];

function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

export function isImageFile(name: string, mimetype = ""): boolean {
  return mimetype.startsWith("image/") || IMAGE_EXTENSIONS.includes(extension(name));
}

function sheetToText(worksheet: ExcelJS.Worksheet): string {
  const lines: string[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const cells = (row.values as unknown[]).slice(1).map((v) => {
      if (v === null || v === undefined) return "";
      if (typeof v === "object" && "text" in (v as Record<string, unknown>)) {
        return String((v as { text: unknown }).text);
      }
      if (typeof v === "object" && "result" in (v as Record<string, unknown>)) {
        return String((v as { result: unknown }).result);
      }
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      return String(v);
    });
    lines.push(cells.join(" | "));
  });
  return lines.join("\n");
}

/** Quita el formato RTF ({\rtf1 ... \par ...}) y deja el texto legible, con tildes y eñes. */
function rtfToText(rtf: string): string {
  return (
    rtf
      // Tablas de fuentes/colores/estilos y metadatos: no son texto del documento.
      .replace(/\{\\(?:fonttbl|colortbl|stylesheet|info|\*)[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, "")
      .replace(/\\(?:par|line)\b ?/g, "\n")
      .replace(/\\\r?\n/g, "\n") // "\" al final de línea = salto de línea (RTF de macOS)
      .replace(/\\tab\b ?/g, "\t")
      // \'e1 → á (código de página Windows-1252/latin1) y \u241? → ñ (Unicode, con carácter de reserva).
      .replace(/\\'([0-9a-f]{2})/gi, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\u(-?\d+)\??/g, (_m, code: string) => String.fromCharCode((Number(code) + 65536) % 65536))
      .replace(/\\([{}\\])/g, "$1")
      .replace(/\\[a-z]+-?\d* ?/gi, "")
      .replace(/(?<!\\)[{}]/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

function truncate(text: string): string {
  if (text.length <= MAX_TEXT_CHARS) return text;
  return `${text.slice(0, MAX_TEXT_CHARS)}\n\n[… documento recortado: solo se muestran los primeros ${MAX_TEXT_CHARS} caracteres]`;
}

async function extractDocumentText(file: UploadedFile): Promise<string> {
  const ext = extension(file.originalname);
  const mime = file.mimetype;

  if (ext === ".pdf" || mime === "application/pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(file.buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    if (!text.trim()) {
      throw new Error(
        `El PDF "${file.originalname}" no contiene texto (parece escaneado o una foto). Haz una ` +
          "captura o foto de la página y adjúntala como imagen en el chat para poder leerla.",
      );
    }
    return text;
  }

  if (ext === ".docx" || mime.includes("wordprocessingml")) {
    const { value } = await mammoth.extractRawText({ buffer: file.buffer });
    return value;
  }

  if (ext === ".doc") {
    throw new Error(
      `"${file.originalname}" es un Word antiguo (.doc). Ábrelo y guárdalo como .docx o PDF para poder leerlo.`,
    );
  }

  if (ext === ".csv" || mime === "text/csv") {
    return file.buffer.toString("utf-8");
  }

  if (ext === ".xlsx" || ext === ".xls" || mime.includes("spreadsheet") || mime.includes("ms-excel")) {
    const workbook = new ExcelJS.Workbook();
    // `as any`: desajuste de tipos entre el Buffer genérico de este TS/@types/node y el Buffer
    // que espera exceljs (mismo dato en tiempo de ejecución, es un problema puramente de tipos).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(Buffer.from(file.buffer) as any);
    return workbook.worksheets.map((ws) => `Hoja "${ws.name}":\n${sheetToText(ws)}`).join("\n\n");
  }

  if (ext === ".rtf") return rtfToText(file.buffer.toString("utf-8"));

  if (TEXT_EXTENSIONS.includes(ext) || mime.startsWith("text/")) {
    return file.buffer.toString("utf-8");
  }

  throw new Error(
    `Tipo de archivo no soportado: "${file.originalname}". Formatos admitidos: PDF, Word (.docx), ` +
      "Excel (.xlsx/.xls), CSV, texto (.txt/.md/.rtf) e imágenes (JPG/PNG/WEBP).",
  );
}

export async function ingestFile(file: UploadedFile): Promise<IngestedFile> {
  if (file.buffer.length > MAX_FILE_BYTES) {
    throw new Error("El archivo es demasiado grande (máximo 15 MB).");
  }

  if (isImageFile(file.originalname, file.mimetype)) {
    const mime = file.mimetype.startsWith("image/")
      ? file.mimetype
      : `image/${extension(file.originalname).slice(1).replace("jpg", "jpeg")}`;
    const base64 = file.buffer.toString("base64");
    return { kind: "image", filename: file.originalname, imageDataUrl: `data:${mime};base64,${base64}` };
  }

  const text = await extractDocumentText(file);
  return { kind: "document", filename: file.originalname, text: truncate(text) };
}
