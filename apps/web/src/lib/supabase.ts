import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client for account metadata only (Req 7.7, 12.6).
 *
 * The connection URL and anon key are read exclusively from environment
 * variables (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). Values are NEVER
 * hard-coded, because the operator supplies their own Supabase account.
 *
 * Resume content and the Anthropic API key never touch this client.
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * True when both required env vars are present. The app can build and run
 * (build/edit resumes) without Supabase configured; only account-backed
 * features require it.
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

let client: SupabaseClient | null = null;

/**
 * Returns the shared Supabase client, creating it lazily on first use.
 * Throws a clear, actionable error if the environment is not configured.
 */
export function getSupabaseClient(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY ' +
        'in your environment (see apps/web/.env.example).',
    );
  }
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey);
  }
  return client;
}
