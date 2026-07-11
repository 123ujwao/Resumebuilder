import { getSupabaseClient, isSupabaseConfigured } from '../../lib/supabase';
import { useAuthStore } from '../auth';
import {
  useResumeStore,
  persistedResumeStateSchema,
  type PersistedResumeState,
} from '../../store/resumeStore';

/**
 * OPTIONAL cross-device resume sync (Task 15, Req 12.1, 12.2).
 *
 * This is a nice-to-have, NOT required for v1. Resume content stays local by
 * default (Req 12.1); it is only ever sent to Supabase when the user explicitly
 * opts into sync AND is signed in. When enabled, resumes are stored in the
 * `resumes` table (`id`, `user_id`, `data jsonb`, `updated_at`) which is guarded
 * by RLS so a user can only read/write their own row (Req 12.2).
 *
 * The `resumes.data` column stores the same {@link PersistedResumeState} shape
 * used locally (versions + active selection + template), keyed by `user_id`.
 *
 * NOTE: this module never touches the Anthropic API key (Req 12.5) and only
 * writes resume content when the user opts in.
 */

/** `localStorage` flag recording the user's opt-in choice for cloud sync. */
export const CLOUD_SYNC_ENABLED_KEY = 'rf.cloud_sync_enabled';

export type SyncResult<T = void> =
  | { ok: true; value: T }
  | { ok: false; error: 'not_configured' | 'not_signed_in' | 'network' | 'parse'; message: string };

/** Read the persisted opt-in flag. Defaults to false (local-only). */
export function isCloudSyncEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem(CLOUD_SYNC_ENABLED_KEY) === 'true';
  } catch {
    return false;
  }
}

/** Persist the opt-in flag. */
export function setCloudSyncEnabled(enabled: boolean): void {
  try {
    if (enabled) {
      globalThis.localStorage?.setItem(CLOUD_SYNC_ENABLED_KEY, 'true');
    } else {
      globalThis.localStorage?.removeItem(CLOUD_SYNC_ENABLED_KEY);
    }
  } catch {
    // Ignore storage failures.
  }
}

/** The persistable resume slice currently held in the store. */
function currentResumeState(): PersistedResumeState {
  const state = useResumeStore.getState();
  return {
    versions: state.versions,
    activeVersionId: state.activeVersionId,
    template: state.template,
  };
}

/**
 * Upsert the current resume into the `resumes` table for the signed-in user
 * (Req 12.2). RLS ensures only the owner can write their row. No-op-with-error
 * when Supabase isn't configured or the user isn't signed in.
 */
export async function syncResumeToCloud(): Promise<SyncResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, error: 'not_configured', message: 'Cloud sync is not available.' };
  }
  const user = useAuthStore.getState().user;
  if (!user) {
    return {
      ok: false,
      error: 'not_signed_in',
      message: 'Sign in to sync your resume across devices.',
    };
  }

  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('resumes').upsert(
      {
        user_id: user.id,
        data: currentResumeState(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    if (error) {
      return { ok: false, error: 'network', message: error.message };
    }
    return { ok: true, value: undefined };
  } catch (err) {
    return {
      ok: false,
      error: 'network',
      message: err instanceof Error ? err.message : 'Failed to sync.',
    };
  }
}

/**
 * Fetch the signed-in user's resume row from the cloud (Req 12.2). RLS scopes
 * the read to the owner. Returns the validated {@link PersistedResumeState} or
 * `null` when the user has no synced row yet.
 */
export async function loadResumeFromCloud(): Promise<SyncResult<PersistedResumeState | null>> {
  if (!isSupabaseConfigured) {
    return { ok: false, error: 'not_configured', message: 'Cloud sync is not available.' };
  }
  const user = useAuthStore.getState().user;
  if (!user) {
    return {
      ok: false,
      error: 'not_signed_in',
      message: 'Sign in to load your synced resume.',
    };
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('resumes')
      .select('data')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) {
      return { ok: false, error: 'network', message: error.message };
    }
    if (!data?.data) {
      return { ok: true, value: null };
    }

    const parsed = persistedResumeStateSchema.safeParse(data.data);
    if (!parsed.success) {
      return { ok: false, error: 'parse', message: 'Synced resume data was invalid.' };
    }
    return { ok: true, value: parsed.data };
  } catch (err) {
    return {
      ok: false,
      error: 'network',
      message: err instanceof Error ? err.message : 'Failed to load.',
    };
  }
}
