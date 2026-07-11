import { useEffect } from 'react';
import { useAuthStore } from '../auth';
import { AdminPanel } from './AdminPanel';

/**
 * Guard for the `/admin` route (Task 11.1, Req 10.1, 10.2).
 *
 * States, in order:
 *  1. While auth is initializing OR the admin check hasn't resolved → loading.
 *  2. Signed out → prompt the user to sign in (opens the shared AuthModal).
 *  3. Signed in but NOT an admin → a neutral "Not found" page. We deliberately
 *     avoid saying "you're not authorized to view the admin panel" so we don't
 *     advertise that the panel exists (Req 10.1).
 *  4. Signed in AND admin → render the {@link AdminPanel} shell.
 *
 * SECURITY NOTE: this guard only controls what UI is shown. The authoritative
 * access control is Supabase RLS + security-definer RPCs on the server; the
 * client `isAdmin` flag cannot grant access to protected data on its own.
 */
export function AdminRoute() {
  const initializing = useAuthStore((s) => s.initializing);
  const adminChecked = useAuthStore((s) => s.adminChecked);
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const openModal = useAuthStore((s) => s.openModal);

  const signedIn = Boolean(user);
  // Prompt sign-in as a side effect once we know the user is signed out.
  const shouldPromptSignIn = !initializing && adminChecked && !signedIn;
  useEffect(() => {
    if (shouldPromptSignIn) {
      openModal();
    }
  }, [shouldPromptSignIn, openModal]);

  // 1. Loading while auth/admin status resolves.
  if (initializing || !adminChecked) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500"
      >
        Loading…
      </div>
    );
  }

  // 2. Signed out → prompt sign-in.
  if (!signedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-sm space-y-3 text-center">
          <h1 className="text-lg font-semibold text-slate-900">
            Sign in required
          </h1>
          <p className="text-sm text-slate-600">
            Please sign in to continue.
          </p>
          <button
            type="button"
            onClick={openModal}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  // 3. Signed in but not an admin → neutral not-found (do not advertise /admin).
  if (!isAdmin) {
    return <NotFound />;
  }

  // 4. Admin → render the panel shell.
  return <AdminPanel />;
}

/** Neutral 404 page, intentionally free of any mention of the admin panel. */
export function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="max-w-sm space-y-2 text-center">
        <h1 className="text-3xl font-bold text-slate-900">404</h1>
        <p className="text-sm text-slate-600">
          The page you're looking for can't be found.
        </p>
      </div>
    </div>
  );
}
