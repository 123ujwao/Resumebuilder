import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from '../../lib/supabase';
import type { AuthActionResult, Profile } from './types';

/**
 * Authentication + profile store (Task 7, Req 7.1–7.6).
 *
 * Wraps Supabase Auth so the rest of the app can build/edit resumes without
 * caring about auth, and only prompt login when a download is attempted
 * (Req 7.1, 7.2). It owns:
 *  - the current session/user (kept in sync via onAuthStateChange)
 *  - the user's own `profiles` row (read via RLS, Req 7.6)
 *  - sign up / sign in (email+password, optional Google) / sign out
 *  - the auth modal open/close flag (parallels the api-key store) so download
 *    flows can call `ensureAuthed()` to gate on login (Req 7.2)
 *
 * Privacy: this store only ever touches account metadata in Supabase. Resume
 * content and the Anthropic API key never pass through here (Req 12.5, 12.6).
 *
 * Graceful degradation: when Supabase is not configured
 * (`isSupabaseConfigured === false`), the builder must still work (Req 7.1).
 * All auth actions therefore short-circuit with a friendly message rather than
 * throwing, and initialization is a no-op.
 */

/** Friendly message shown when auth is used without Supabase configured. */
export const AUTH_NOT_CONFIGURED_MESSAGE =
  'Accounts are not available right now. You can still build and edit your ' +
  'resume locally.';

/** Map assorted Supabase/network errors to a short, non-technical message. */
function friendlyError(err: unknown): string {
  const message =
    (typeof err === 'object' && err && 'message' in err
      ? String((err as { message: unknown }).message)
      : String(err)) || 'Something went wrong.';
  const lower = message.toLowerCase();
  if (lower.includes('invalid login')) {
    return 'That email or password is incorrect.';
  }
  if (lower.includes('already registered') || lower.includes('already exists')) {
    return 'An account with that email already exists. Try signing in instead.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Please confirm your email address, then sign in.';
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'Network error. Check your connection and try again.';
  }
  return message;
}

export interface AuthState {
  /** Whether Supabase auth is available in this deployment. */
  configured: boolean;
  /** Current Supabase session, or null when signed out. */
  session: Session | null;
  /** Convenience accessor for the current user. */
  user: User | null;
  /** The signed-in user's own profile row (Req 7.6), or null. */
  profile: Profile | null;
  /**
   * Whether the current user is a listed admin (Req 10.2).
   *
   * SECURITY NOTE: this flag is a UI hint ONLY — it decides whether to render
   * the admin panel shell vs a neutral not-found page. The real security
   * boundary is Postgres RLS on the `admins`/protected tables plus the
   * security-definer RPCs, all enforced server-side. A tampered client that
   * flips this flag still cannot read or write admin-only data.
   */
  isAdmin: boolean;
  /**
   * Whether the admin check has completed for the current session. Starts
   * false and flips true once `checkAdmin()` resolves, so the guard can show a
   * loading state instead of briefly flashing "not found".
   */
  adminChecked: boolean;
  /** True while the initial session is being restored. */
  initializing: boolean;
  /** True while an auth action (sign in/up/out) is in flight. */
  loading: boolean;
  /** Whether the auth modal is open (used by ensureAuthed / download flows). */
  isModalOpen: boolean;
  /** Last auth error message, surfaced by the modal. */
  error: string | null;

  /** True when a session exists. */
  isAuthenticated: () => boolean;

  /** Restore any existing session and subscribe to auth changes. */
  initialize: () => void;
  /** Sign up with email/password; creates the profiles row (Req 7.3, 7.4). */
  signUp: (
    email: string,
    password: string,
    displayName?: string,
  ) => Promise<AuthActionResult>;
  /** Sign in with email/password; updates last_login_at (Req 7.3, 7.5). */
  signInWithPassword: (
    email: string,
    password: string,
  ) => Promise<AuthActionResult>;
  /** Optional Google OAuth sign-in (Req 7.3). */
  signInWithGoogle: () => Promise<AuthActionResult>;
  /** Sign out and clear session/profile. */
  signOut: () => Promise<void>;
  /**
   * Re-fetch the signed-in user's own profile row from Supabase.
   *
   * Used by download flows (Task 8.3) after the `consume_download` RPC mutates
   * `free_downloads_used` server-side, so the UI reflects the new authoritative
   * count rather than a locally-incremented guess (Req 8.10). No-op when signed
   * out or Supabase is not configured.
   */
  refreshProfile: () => Promise<void>;
  /**
   * Determine whether the current user is an admin (Req 10.2).
   *
   * Because RLS restricts the `admins` table so a non-admin's SELECT returns no
   * rows, the check is simply: select the current user's row from `admins`; a
   * returned row means admin. This is only used to show/hide the admin UI — see
   * the SECURITY NOTE on `isAdmin`. No-op (isAdmin=false, adminChecked=true)
   * when signed out or Supabase is not configured.
   */
  checkAdmin: () => Promise<void>;

  openModal: () => void;
  closeModal: () => void;
  clearError: () => void;
}

/** Guards whether the onAuthStateChange subscription is already wired. */
let authSubscribed = false;

export const useAuthStore = create<AuthState>((set, get) => ({
  configured: isSupabaseConfigured,
  session: null,
  user: null,
  profile: null,
  isAdmin: false,
  adminChecked: false,
  initializing: isSupabaseConfigured,
  loading: false,
  isModalOpen: false,
  error: null,

  isAuthenticated: () => Boolean(get().session),

  initialize: () => {
    // Without Supabase configured the builder still works; nothing to restore.
    if (!isSupabaseConfigured) {
      set({ initializing: false, configured: false, adminChecked: true });
      return;
    }

    const supabase = getSupabaseClient();

    // Restore an existing session on load, then load the profile.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        const session = data.session ?? null;
        set({ session, user: session?.user ?? null, initializing: false });
        if (session?.user) {
          // On initial restore, touch last_login_at and load the profile.
          void syncProfileOnAuth(session.user, { updateLastLogin: true });
          // Evaluate admin status once auth is known (Req 10.2).
          void get().checkAdmin();
        } else {
          // Signed out: no admin, but the check is "done".
          set({ adminChecked: true });
        }
      })
      .catch(() => set({ initializing: false, adminChecked: true }));

    // Keep the store in sync with future auth changes (login, logout, refresh).
    if (!authSubscribed) {
      authSubscribed = true;
      supabase.auth.onAuthStateChange((_event, session) => {
        set({ session, user: session?.user ?? null });
        if (session?.user) {
          void syncProfileOnAuth(session.user, { updateLastLogin: false });
          // Re-evaluate admin status for the new session.
          set({ isAdmin: false, adminChecked: false });
          void get().checkAdmin();
        } else {
          set({ profile: null, isAdmin: false, adminChecked: true });
        }
      });
    }
  },

  signUp: async (email, password, displayName) => {
    if (!isSupabaseConfigured) {
      set({ error: AUTH_NOT_CONFIGURED_MESSAGE });
      return { ok: false, error: AUTH_NOT_CONFIGURED_MESSAGE };
    }
    set({ loading: true, error: null });
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: displayName
          ? { data: { display_name: displayName } }
          : undefined,
      });
      if (error) throw error;

      // Req 7.4: create the profiles row for the new user. Some Supabase
      // configurations return a user immediately (email confirmation off);
      // when confirmation is required, data.user is present but there is no
      // session yet. Either way we can upsert the profile keyed by the user id.
      if (data.user) {
        await upsertProfile(data.user, displayName);
      }

      set({
        loading: false,
        session: data.session ?? get().session,
        user: data.user ?? get().user,
        isModalOpen: data.session ? false : get().isModalOpen,
      });
      return { ok: true };
    } catch (err) {
      const message = friendlyError(err);
      set({ loading: false, error: message });
      return { ok: false, error: message };
    }
  },

  signInWithPassword: async (email, password) => {
    if (!isSupabaseConfigured) {
      set({ error: AUTH_NOT_CONFIGURED_MESSAGE });
      return { ok: false, error: AUTH_NOT_CONFIGURED_MESSAGE };
    }
    set({ loading: true, error: null });
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      set({
        loading: false,
        session: data.session ?? null,
        user: data.user ?? null,
        isModalOpen: false,
      });

      // Req 7.5 + 7.6: update last_login_at and load the profile.
      if (data.user) {
        await syncProfileOnAuth(data.user, { updateLastLogin: true });
      }
      return { ok: true };
    } catch (err) {
      const message = friendlyError(err);
      set({ loading: false, error: message });
      return { ok: false, error: message };
    }
  },

  signInWithGoogle: async () => {
    if (!isSupabaseConfigured) {
      set({ error: AUTH_NOT_CONFIGURED_MESSAGE });
      return { ok: false, error: AUTH_NOT_CONFIGURED_MESSAGE };
    }
    set({ loading: true, error: null });
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: globalThis.location?.origin },
      });
      if (error) throw error;
      // OAuth triggers a redirect; the resulting session is picked up by
      // onAuthStateChange / getSession after the round-trip.
      set({ loading: false });
      return { ok: true };
    } catch (err) {
      const message = friendlyError(err);
      set({ loading: false, error: message });
      return { ok: false, error: message };
    }
  },

  signOut: async () => {
    if (!isSupabaseConfigured) {
      set({ session: null, user: null, profile: null, isAdmin: false });
      return;
    }
    set({ loading: true });
    try {
      await getSupabaseClient().auth.signOut();
    } catch {
      // Ignore sign-out errors; we clear local state regardless.
    }
    set({
      loading: false,
      session: null,
      user: null,
      profile: null,
      isAdmin: false,
      adminChecked: true,
    });
  },

  refreshProfile: async () => {
    if (!isSupabaseConfigured) return;
    const { user } = get();
    if (!user) return;
    await loadProfile(user.id);
  },

  checkAdmin: async () => {
    // No backend or no session → definitively not an admin (for UI purposes).
    if (!isSupabaseConfigured) {
      set({ isAdmin: false, adminChecked: true });
      return;
    }
    const { user } = get();
    if (!user) {
      set({ isAdmin: false, adminChecked: true });
      return;
    }
    try {
      const supabase = getSupabaseClient();
      // RLS returns this row only for admins; a non-admin gets zero rows.
      const { data, error } = await supabase
        .from('admins')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();
      set({ isAdmin: !error && Boolean(data), adminChecked: true });
    } catch {
      // On any failure, fail closed (treat as non-admin) but mark as checked.
      set({ isAdmin: false, adminChecked: true });
    }
  },

  openModal: () => set({ isModalOpen: true, error: null }),
  closeModal: () => set({ isModalOpen: false }),
  clearError: () => set({ error: null }),
}));

/**
 * Idempotently create/update the user's profile row on signup (Req 7.4).
 *
 * Uses upsert keyed on `id` so retries (e.g. a repeated signup submit) are safe.
 * Only writes user-writable columns; `free_downloads_used` and `is_free_forever`
 * fall back to their DB defaults and are never set here (Req 7.6).
 */
async function upsertProfile(user: User, displayName?: string): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const displayNameFromMeta =
      (user.user_metadata?.display_name as string | undefined) ??
      (user.user_metadata?.full_name as string | undefined);
    await supabase.from('profiles').upsert(
      {
        id: user.id,
        email: user.email ?? '',
        display_name: displayName ?? displayNameFromMeta ?? null,
        last_login_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );
    await loadProfile(user.id);
  } catch {
    // Profile creation is best-effort at signup time; a DB trigger (if present)
    // and the next sign-in path both provide a safety net.
  }
}

/**
 * On sign-in / initial restore: update last_login_at (Req 7.5), then load the
 * user's own profile row via RLS (Req 7.6).
 */
async function syncProfileOnAuth(
  user: User,
  opts: { updateLastLogin: boolean },
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    if (opts.updateLastLogin) {
      const { error } = await supabase
        .from('profiles')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', user.id);
      // If the row does not exist yet (e.g. profile creation was skipped),
      // create it so the app has profile state.
      if (error) {
        await upsertProfile(user);
        return;
      }
    }
    await loadProfile(user.id);
  } catch {
    // Non-fatal: the app still works without profile metadata loaded.
  }
}

/** Fetch the user's own profile row (RLS restricts to id === auth.uid()). */
async function loadProfile(userId: string): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('profiles')
      .select(
        'id, email, display_name, created_at, last_login_at, free_downloads_used, is_free_forever',
      )
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) return;
    useAuthStore.setState({ profile: data as Profile });
  } catch {
    // Ignore; profile stays null.
  }
}
