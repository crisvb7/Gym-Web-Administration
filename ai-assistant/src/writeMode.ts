import { AsyncLocalStorage } from "node:async_hooks";
import { config } from "./config.js";

// Decide si las herramientas que escriben datos lo hacen DIRECTAMENTE (por defecto: OlimpIA hace lo
// que se le pide) o solo dejan una propuesta con botón Confirmar. Se fija por turno: una tarea
// programada que pide confirmación la pide aunque el ajuste general sea "directo", y al revés.
const store = new AsyncLocalStorage<boolean>();

export function confirmationRequired(): boolean {
  return store.getStore() ?? config.requireConfirmation;
}

export function withConfirmationMode<T>(requireConfirmation: boolean | undefined, fn: () => Promise<T>): Promise<T> {
  return requireConfirmation === undefined ? fn() : store.run(requireConfirmation, fn);
}
