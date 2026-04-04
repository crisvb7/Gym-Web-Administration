import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vnockjqtkbhgytmmbdlb.supabase.co';
const supabaseAnonKey = 'sb_publishable_H-Na-ymLkWMfm9akeQx9mw_NcbvydZv';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);