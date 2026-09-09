import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = window.PLAYSTARS_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.PLAYSTARS_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Play Stars: PLAYSTARS_SUPABASE_URL / PLAYSTARS_SUPABASE_ANON_KEY manquants — définis-les avant main.js dans index.html.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});

export const STORAGE_BUCKET = 'play-stars-files';
