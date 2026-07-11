import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthModal, RequireAuthRoute, useAuthStore } from './features/auth';
import { AdminRoute, NotFound } from './features/admin';
import { Home } from './pages/Home';
import { Landing } from './pages/Landing';
import { ErrorBoundary, Toaster } from './components';

/**
 * The app's route table plus app-wide modals.
 *
 * Exported separately from {@link App} so tests can mount it inside a
 * `MemoryRouter` at an arbitrary initial path without a real browser history.
 *
 * Routes:
 *   - "/"      → {@link Landing} (the marketing landing page).
 *   - "/app"   → {@link Home} (the natural-language builder + preview),
 *                wrapped in {@link RequireAuthRoute} so sign-in is required
 *                before building (falls back to open access when Supabase is
 *                not configured).
 *   - "/admin" → {@link AdminRoute}, which gates the admin panel behind the
 *                `admins` table (Req 10.1, 10.2). This route is intentionally
 *                NOT linked from any normal UI.
 *   - "*"      → neutral {@link NotFound}.
 *
 * The auth modal is mounted here (route-independent) so the admin guard can
 * open it to prompt sign-in. The BYOK key prompt (ApiKeyModal) lives inside
 * Home instead, so its first-load prompt doesn't appear on `/admin`.
 */
export function AppRoutes() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="/app"
          element={
            <RequireAuthRoute>
              <Home />
            </RequireAuthRoute>
          }
        />
        <Route path="/admin" element={<AdminRoute />} />
        <Route path="*" element={<NotFound />} />
      </Routes>

      <AuthModal />
      {/* App-wide transient notifications (Req 13.1, 13.3). */}
      <Toaster />
    </>
  );
}

/**
 * App shell / router host. Restores the Supabase session and subscribes to auth
 * changes on mount (this never gates the builder — Req 7.1), then renders the
 * route table under a BrowserRouter.
 */
export default function App() {
  const initializeAuth = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  return (
    // Req 13.3: an unexpected render error shows a friendly recoverable screen
    // instead of a blank page.
    <ErrorBoundary>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ErrorBoundary>
  );
}
