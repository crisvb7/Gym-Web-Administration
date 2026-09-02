import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

// Usa la service_role key: este script corre en backend/local, nunca en un navegador.
export const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false },
});
