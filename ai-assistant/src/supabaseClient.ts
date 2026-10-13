import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config.js";

// Usa la service_role key: este programa corre en local, nunca en un navegador.
// El cliente se crea la primera vez que se usa (y se vuelve a crear si se cambian las claves desde
// Ajustes), así el servidor puede arrancar aunque todavía no esté configurado.
let client: SupabaseClient | null = null;
let clientKey = "";

function currentClient(): SupabaseClient {
  const key = config.supabaseServiceRoleKey;
  if (!key) {
    throw new Error("Falta la clave de Supabase (service_role): configúrala en Ajustes.");
  }
  const id = `${config.supabaseUrl}|${key}`;
  if (!client || id !== clientKey) {
    client = createClient(config.supabaseUrl, key, { auth: { persistSession: false } });
    clientKey = id;
  }
  return client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const c = currentClient();
    const value = Reflect.get(c, prop, c);
    return typeof value === "function" ? value.bind(c) : value;
  },
});
