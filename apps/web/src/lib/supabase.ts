import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_URL_DEFAULT as string | undefined) ||
  'https://hfcodbbwiidrehbjwhmg.supabase.co';

const SUPABASE_PUBLISHABLE_KEY =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmY29kYmJ3aWlkcmVoYmp3aG1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NTYzODUsImV4cCI6MjEwNTEzMjM4NX0.3x4ykChTmPJJT1n3HymIrwdg95TOGbaOTIqwd5nlkbY';

export const isSupabaseConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL &&
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY)
);

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
