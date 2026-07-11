import { useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import { useAuthStore } from './authStore';

/**
 * Guard hook for download flows (Req 7.2).
 *
 * Download/export UI (Task 8/9) should call `ensureAuthed()` before producing a
 * file. When a user is signed in it returns the `User` so the caller can
 * proceed. When signed out it opens the auth modal and returns `null`, so the
 * download is gated on login/signup instead of failing silently. This mirrors
 * the `useRequireApiKey` pattern used for AI actions.
 *
 * Crucially, this does NOT gate building or editing — those remain available
 * pre-login (Req 7.1). Only the caller (a download action) invokes this guard.
 *
 * Example:
 * ```ts
 * const ensureAuthed = useRequireAuth();
 * const onDownload = () => {
 *   const user = ensureAuthed();
 *   if (!user) return; // auth modal is now open
 *   runDownload(user);
 * };
 * ```
 */
export function useRequireAuth(): () => User | null {
  const openModal = useAuthStore((s) => s.openModal);

  return useCallback(() => {
    // Read the freshest state to avoid stale closures.
    const { user } = useAuthStore.getState();
    if (!user) {
      openModal();
      return null;
    }
    return user;
  }, [openModal]);
}
