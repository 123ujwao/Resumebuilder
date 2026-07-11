/**
 * Auth feature types (Task 7, Req 7.4, 7.6).
 *
 * `Profile` mirrors the Supabase `profiles` row (see
 * supabase/migrations/0001_initial_schema.sql). Only the user's OWN profile is
 * ever read here, via RLS (Req 7.6). The `is_free_forever` and
 * `free_downloads_used` columns are shown read-only in the client: they are
 * never written from here (immutability trigger + admin-only RPCs enforce this
 * server-side).
 */
export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string | null;
  last_login_at: string | null;
  free_downloads_used: number;
  is_free_forever: boolean;
}

/** Result of an auth action; carries a friendly message on failure. */
export type AuthActionResult = { ok: true } | { ok: false; error: string };
