import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";

export type TaskFrequency = "daily" | "weekly" | "monthly";

export interface ScheduledTask {
  id: string;
  description: string;
  frequency: TaskFrequency;
  /** Solo para frequency="monthly". 1-31; si el mes tiene menos días, se ajusta al último día. */
  dayOfMonth?: number;
  /** Solo para frequency="weekly". 0=domingo ... 6=sábado. */
  dayOfWeek?: number;
  createdAt: string;
  /** Última fecha (YYYY-MM-DD) en la que se ejecutó, para no repetir en el mismo día. */
  lastRunDate?: string;
}

const TASKS_FILE = join(config.dataDir, "scheduled-tasks.json");

async function ensureDataDir(): Promise<void> {
  await mkdir(config.dataDir, { recursive: true });
}

export async function loadTasks(): Promise<ScheduledTask[]> {
  try {
    const raw = await readFile(TASKS_FILE, "utf-8");
    return JSON.parse(raw) as ScheduledTask[];
  } catch {
    return [];
  }
}

async function saveTasks(tasks: ScheduledTask[]): Promise<void> {
  await ensureDataDir();
  await writeFile(TASKS_FILE, JSON.stringify(tasks, null, 2), "utf-8");
}

export async function addTask(input: {
  description: string;
  frequency: TaskFrequency;
  dayOfMonth?: number;
  dayOfWeek?: number;
}): Promise<ScheduledTask> {
  const tasks = await loadTasks();
  const task: ScheduledTask = { id: randomUUID(), createdAt: new Date().toISOString(), ...input };
  tasks.push(task);
  await saveTasks(tasks);
  return task;
}

export async function removeTask(id: string): Promise<boolean> {
  const tasks = await loadTasks();
  const next = tasks.filter((t) => t.id !== id);
  if (next.length === tasks.length) return false;
  await saveTasks(next);
  return true;
}

export async function markTaskRun(id: string, dateStr: string): Promise<void> {
  const tasks = await loadTasks();
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  task.lastRunDate = dateStr;
  await saveTasks(tasks);
}

function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

export function isTaskDue(task: ScheduledTask, today: Date): boolean {
  const todayStr = today.toISOString().slice(0, 10);
  if (task.lastRunDate === todayStr) return false;

  if (task.frequency === "daily") return true;
  if (task.frequency === "weekly") return today.getDay() === (task.dayOfWeek ?? 1);
  if (task.frequency === "monthly") {
    const target = Math.min(task.dayOfMonth ?? 1, daysInMonth(today));
    return today.getDate() === target;
  }
  return false;
}

export function describeSchedule(task: ScheduledTask): string {
  if (task.frequency === "daily") return "todos los días";
  if (task.frequency === "weekly") {
    const days = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
    return `cada ${days[task.dayOfWeek ?? 1]}`;
  }
  const day = task.dayOfMonth ?? 1;
  return day >= 28 ? "el último día de cada mes" : `el día ${day} de cada mes`;
}
