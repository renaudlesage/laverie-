import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const cleAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Variables absentes : l'app affiche un écran de configuration au lieu de planter.
export const configurationManquante = [
  !url && 'VITE_SUPABASE_URL',
  !cleAnon && 'VITE_SUPABASE_ANON_KEY',
].filter(Boolean);

export const supabase = configurationManquante.length
  ? null
  : createClient(url, cleAnon, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
