import { readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { config } from "./config.js";
import { createConversation as createBaseMessages, type PendingAction } from "./chatEngine.js";

// Cada conversación es un archivo JSON en disco: así sobreviven a reinicios del servidor y se
// pueden listar/retomar en cualquier momento, en vez de vivir solo en memoria del proceso.

export interface StoredConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatCompletionMessageParam[];
  pendingActions: Record<string, PendingAction>;
}

export const AUTOMATION_CONVERSATION_ID = "automation";

const CONVERSATIONS_DIR = join(config.dataDir, "conversations");

async function ensureDir(): Promise<void> {
  await mkdir(CONVERSATIONS_DIR, { recursive: true });
}

function filePath(id: string): string {
  return join(CONVERSATIONS_DIR, `${id}.json`);
}

export async function listConversations(): Promise<Array<{ id: string; title: string; updatedAt: string }>> {
  await ensureDir();
  const files = await readdir(CONVERSATIONS_DIR);

  const items = await Promise.all(
    files
      .filter((f) => f.endsWith(".json"))
      .map(async (f) => {
        try {
          const raw = await readFile(join(CONVERSATIONS_DIR, f), "utf-8");
          const conv = JSON.parse(raw) as StoredConversation;
          return { id: conv.id, title: conv.title, updatedAt: conv.updatedAt };
        } catch {
          return null;
        }
      }),
  );

  return items
    .filter((x): x is { id: string; title: string; updatedAt: string } => x !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function loadConversation(id: string): Promise<StoredConversation | null> {
  try {
    const raw = await readFile(filePath(id), "utf-8");
    return JSON.parse(raw) as StoredConversation;
  } catch {
    return null;
  }
}

export async function saveConversation(conv: StoredConversation): Promise<void> {
  await ensureDir();
  conv.updatedAt = new Date().toISOString();
  await writeFile(filePath(conv.id), JSON.stringify(conv, null, 2), "utf-8");
}

export async function createNewConversation(id?: string, title = "Nueva conversación"): Promise<StoredConversation> {
  const conv: StoredConversation = {
    id: id ?? randomUUID(),
    title,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: createBaseMessages(),
    pendingActions: {},
  };
  await saveConversation(conv);
  return conv;
}

/** Como loadConversation, pero la crea si todavía no existe (para ids fijos como "automation"). */
export async function loadOrCreateConversation(id: string, title?: string): Promise<StoredConversation> {
  const existing = await loadConversation(id);
  if (existing) return existing;
  return createNewConversation(id, title);
}

export async function deleteConversation(id: string): Promise<void> {
  try {
    await unlink(filePath(id));
  } catch {
    // ya no existía, nada que hacer
  }
}

export function deriveTitle(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "Nueva conversación";
  return clean.length > 48 ? `${clean.slice(0, 48)}…` : clean;
}
