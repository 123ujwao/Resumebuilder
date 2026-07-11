import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from './authStore';

/**
 * Route guard that requires a signed-in user before rendering its children
 * (the builder). Wrap the "/app" route element with this component.
 *
 * Behavior:
 *  - While the initial session is being restored (`initializing`), show a
 *    centered loading state.
 *  - When Supabase is NOT configured (`configured === false`), render the
 *    children anyway. This is a dev/local fallback: without a backend there is
 *    no auth to enforce, and the builder must still work (Req 7.1).
 *  - When configured but signed out, show a friendly "sign in required" screen
 *    and auto-open the auth modal once.
 *  - When configured and signed in, render the children.
 */
export function RequireAuthRoute({ children }: { children: ReactNode }) {
  const configured = useAuthStore((s) => s.configured);
  const initializing = useAuthStore((s) => s.initializing);
  const user = useAuthStore((s) => s.user);
  const openModal = useAuthStore((s) => s.openModal);

  // Guard so the modal is auto-opened only once when the prompt first appears,
  // instead of on every render (which would fight the user closing it).
  const autoOpenedRef = useRef(false);
  const showPrompt = configured && !initializing && !user;

  useEffect(() => {
    if (showPrompt && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      openModal();
    }
    // Reset the latch once the user signs in so a later sign-out re-prompts.
    if (!showPrompt) {
      autoOpenedRef.current = false;
    }
  }, [showPrompt, openModal]);

  // Restoring the session — avoid flashing the prompt before we know the state.
  if (initializing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-3 text-slate-600"
        >
          <span
            className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600"
            aria-hidden="true"
          />
          <span className="text-sm font-medium">Loading…</span>
        </div>
      </div>
    );
  }

  // Dev/local fallback: no backend configured, so there is nothing to gate on —
  // let the builder run so the app is usable without Supabase (Req 7.1).
  if (!configured) {
    return <>{children}</>;
  }

  // Configured but signed out — prompt for sign in before the builder.
  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-violet-100 to-sky-50 px-4 py-16">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-indigo-200/40">
          <span
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm shadow-indigo-500/30"
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="1.8">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
            </svg>
          </span>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">
            Sign in to start building
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Create a free account or sign in to build, tailor, and download your
            resume.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={openModal}
              className="rounded-xl bg-indigo-600 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:-translate-y-0.5 hover:bg-indigo-500 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            >
              Sign in / Sign up
            </button>
            <Link
              to="/"
              className="rounded-xl px-6 py-2 text-sm font-medium text-slate-600 transition hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            >
              Back to home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Configured and signed in — render the builder.
  return <>{children}</>;
}
