import ExcelJS from "exceljs";

export interface IngestedFile {
  kind: "image" | "spreadsheet";
  filename: string;
  /** Para imágenes: data URL en base64 lista para enviar como content de tipo image_url. */
  imageDataUrl?: string;
  /** Para hojas de cálculo/CSV: representación en texto plano (tabla) de cada hoja. */
  spreadsheetText?: string;
}

interface UploadedFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

const MAX_FILE_BYTES = 15 * 1024 * 1024;

function isImage(file: UploadedFile): boolean {
  return file.mimetype.startsWith("image/");
}

function isCsv(file: UploadedFile): boolean {
  return file.mimetype === "text/csv" || file.originalname.toLowerCase().endsWith(".csv");
}

function isExcel(file: UploadedFile): boolean {
  const name = file.originalname.toLowerCase();
  return (
    file.mimetype.includes("spreadsheet") ||
    file.mimetype.includes("ms-excel") ||
    name.endsWith(".xlsx") ||
    name.endsWith(".xls")
  );
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
      return String(v);
    });
    lines.push(cells.join(" | "));
  });
  return lines.join("\n");
}

export async function ingestFile(file: UploadedFile): Promise<IngestedFile> {
  if (file.buffer.length > MAX_FILE_BYTES) {
    throw new Error("El archivo es demasiado grande (máximo 15 MB).");
  }

  if (isImage(file)) {
    const base64 = file.buffer.toString("base64");
    return { kind: "image", filename: file.originalname, imageDataUrl: `data:${file.mimetype};base64,${base64}` };
  }

  if (isCsv(file)) {
    return { kind: "spreadsheet", filename: file.originalname, spreadsheetText: file.buffer.toString("utf-8") };
  }

  if (isExcel(file)) {
    const workbook = new ExcelJS.Workbook();
    // `as any`: desajuste de tipos entre el Buffer genérico de este TS/@types/node y el Buffer
    // que espera exceljs (mismo dato en tiempo de ejecución, es un problema puramente de tipos).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(Buffer.from(file.buffer) as any);
    const sheets = workbook.worksheets.map((ws) => `Hoja "${ws.name}":\n${sheetToText(ws)}`);
    return { kind: "spreadsheet", filename: file.originalname, spreadsheetText: sheets.join("\n\n") };
  }

  throw new Error(
    `Tipo de archivo no soportado (${file.mimetype || "desconocido"}). Sube una imagen (JPG/PNG/WEBP) o una hoja de cálculo (XLSX/XLS/CSV).`,
  );
}
