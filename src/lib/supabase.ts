import { createClient } from '@supabase/supabase-js';

// Las variables solo existen con `npm run dev:local` (archivo .env.test.local, que Vite carga únicamente
// en modo test): el build de producción siempre usa el proyecto real.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://vnockjqtkbhgytmmbdlb.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_H-Na-ymLkWMfm9akeQx9mw_NcbvydZv';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);