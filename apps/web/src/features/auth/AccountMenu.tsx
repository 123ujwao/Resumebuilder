import { useAuthStore } from './authStore';

/**
 * Compact account indicator + sign-out for the header (Req 7.3, 7.5).
 *
 * Shows a "Sign in" button when signed out (opens the AuthModal), or the
 * signed-in user's name/email with a sign-out action. Renders nothing while the
 * initial session is being restored to avoid a flash of the wrong state.
 *
 * When Supabase is not configured this stays hidden so the builder header is
 * uncluttered (auth simply isn't part of that deployment).
 */
export function AccountMenu() {
  const configured = useAuthStore((s) => s.configured);
  const initializing = useAuthStore((s) => s.initializing);
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const loading = useAuthStore((s) => s.loading);
  const openModal = useAuthStore((s) => s.openModal);
  const signOut = useAuthStore((s) => s.signOut);

  if (!configured || initializing) return null;

  if (!user) {
    return (
      <button
        type="button"
        onClick={openModal}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Sign in
      </button>
    );
  }

  const label = profile?.display_name || user.email || 'Account';

  return (
    <div className="flex items-center gap-2">
      <span className="hidden max-w-[12rem] truncate text-sm text-slate-600 sm:inline">
        {label}
      </span>
      <button
        type="button"
        onClick={() => void signOut()}
        disabled={loading}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        Sign out
      </button>
    </div>
  );
}
