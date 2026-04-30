import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPAFLARE_URL = 'http://127.0.0.1:8787';
const ANON_KEY = 'sb-anon-test-key';

export function createSupaflareClient(url = SUPAFLARE_URL, key = ANON_KEY): SupabaseClient {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
