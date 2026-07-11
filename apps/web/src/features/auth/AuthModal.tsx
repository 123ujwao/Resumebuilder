import { useEffect, useState } from 'react';
import { AUTH_NOT_CONFIGURED_MESSAGE, useAuthStore } from './authStore';

/**
 * Sign in / sign up modal (Req 7.2, 7.3).
 *
 * Opened by `useRequireAuth().ensureAuthed()` when a signed-out user attempts a
 * download, or explicitly from the header. Supports email/password sign in and
 * sign up (with an optional display name) and an optional "Continue with
 * Google" button (Req 7.3). Shows loading and error states.
 *
 * When Supabase is not configured the modal explains that accounts are
 * unavailable rather than crashing, keeping the builder usable (Req 7.1).
 */
type Mode = 'signin' | 'signup';

/**
 * Whether to show the "Continue with Google" button. Off by default so it never
 * appears (and errors) until Google OAuth is configured in Supabase. Enable by
 * setting VITE_ENABLE_GOOGLE_AUTH=true in apps/web/.env once Google is wired up.
 */
const GOOGLE_AUTH_ENABLED =
  import.meta.env.VITE_ENABLE_GOOGLE_AUTH === 'true';

export function AuthModal() {
  const configured = useAuthStore((s) => s.configured);
  const isModalOpen = useAuthStore((s) => s.isModalOpen);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const closeModal = useAuthStore((s) => s.closeModal);
  const clearError = useAuthStore((s) => s.clearError);
  const signUp = useAuthStore((s) => s.signUp);
  const signInWithPassword = useAuthStore((s) => s.signInWithPassword);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  // Reset the form each time the modal opens.
  useEffect(() => {
    if (isModalOpen) {
      setEmail('');
      setPassword('');
      setDisplayName('');
      clearError();
    }
  }, [isModalOpen, clearError]);

  if (!isModalOpen) return null;

  // On sign up, a name is required; on sign in it is not collected.
  const canSubmit =
    email.trim().length > 0 &&
    password.length > 0 &&
    (mode === 'signin' || displayName.trim().length > 0) &&
    !loading;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (mode === 'signup') {
      await signUp(email.trim(), password, displayName.trim());
    } else {
      await signInWithPassword(email.trim(), password);
    }
  };

  const toggleMode = () => {
    clearError();
    setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="w-full max-w-md space-y-4 rounded-lg bg-white p-6 shadow-xl">
        <div className="space-y-1">
          <h2 id="auth-modal-title" className="text-lg font-semibold text-slate-900">
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="text-sm text-slate-600">
            Sign in or create a free account to build, tailor, and download your
            resume.
          </p>
        </div>

        {!configured ? (
          <div className="space-y-4">
            <p
              role="alert"
              className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800"
            >
              {AUTH_NOT_CONFIGURED_MESSAGE}
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Got it
              </button>
            </div>
          </div>
        ) : (
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSubmit();
              }}
              className="space-y-3"
            >
              {mode === 'signup' && (
                <div className="space-y-1">
                  <label
                    htmlFor="auth-display-name"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Name
                  </label>
                  <input
                    id="auth-display-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    autoComplete="name"
                    required
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label
                  htmlFor="auth-email"
                  className="block text-sm font-medium text-slate-700"
                >
                  Email
                </label>
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="auth-password"
                  className="block text-sm font-medium text-slate-700"
                >
                  Password
                </label>
                <input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={
                    mode === 'signup' ? 'new-password' : 'current-password'
                  }
                  required
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>

              {error && (
                <p role="alert" className="text-sm text-red-600">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading
                  ? 'Please wait…'
                  : mode === 'signin'
                    ? 'Sign in'
                    : 'Sign up'}
              </button>
            </form>

            {/* Optional Google sign-in (Req 7.3). Hidden unless Google OAuth is
                actually configured (set VITE_ENABLE_GOOGLE_AUTH=true after
                wiring the Google provider in Supabase), so it doesn't error. */}
            {GOOGLE_AUTH_ENABLED && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="h-px flex-1 bg-slate-200" />
                  <span className="text-xs text-slate-400">or</span>
                  <span className="h-px flex-1 bg-slate-200" />
                </div>
                <button
                  type="button"
                  onClick={() => void signInWithGoogle()}
                  disabled={loading}
                  className="w-full rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Continue with Google
                </button>
              </div>
            )}

            <div className="flex items-center justify-between pt-1 text-sm">
              <button
                type="button"
                onClick={toggleMode}
                className="font-medium text-blue-600 hover:text-blue-700"
              >
                {mode === 'signin'
                  ? 'Need an account? Sign up'
                  : 'Have an account? Sign in'}
              </button>
              <button
                type="button"
                onClick={closeModal}
                className="text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
