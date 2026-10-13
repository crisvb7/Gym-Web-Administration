// Punto de entrada que se empaqueta (npm run build:cloud) para la función olimpia-tasks de Supabase.
export { tick, verifySecret } from "./worker.js";
export { overrideSettings } from "../config.js";
