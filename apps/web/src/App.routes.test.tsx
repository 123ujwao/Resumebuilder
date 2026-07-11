import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Verifies route wiring: "/" renders the marketing Landing page, "/app"
 * renders the builder (Home), and "/admin" renders the guarded admin panel. The
 * heavy Home page is stubbed so this test stays focused on routing; the
 * AdminRoute guard runs for real against the auth store. Supabase is mocked so
 * nothing touches the network.
 */

vi.mock('./lib/supabase', () => ({
  isSupabaseConfigured: true,
  getSupabaseClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi
        .fn()
        .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: vi.fn(),
  }),
}));

// Stub the builder-heavy Home page; we only care that it maps to "/app".
vi.mock('./pages/Home', () => ({
  Home: () => <div>home-page</div>,
}));

const { AppRoutes } = await import('./App');
const { useAuthStore } = await import('./features/auth');

function reset() {
  cleanup();
  useAuthStore.setState({
    session: null,
    user: null,
    profile: null,
    isAdmin: false,
    adminChecked: true,
    initializing: false,
    isModalOpen: false,
  });
}

describe('App routes', () => {
  beforeEach(reset);

  it('renders the marketing Landing page at "/"', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    );
    // The landing hero headline; the builder must NOT be mounted at "/".
    expect(
      screen.getByRole('heading', {
        name: /build a job-winning resume in minutes/i,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText('home-page')).not.toBeInTheDocument();
  });

  it('renders the builder (Home) at "/app" for a signed-in user', () => {
    // The "/app" route is now behind RequireAuthRoute; a signed-in user (with
    // Supabase configured) passes the guard and sees the builder.
    useAuthStore.setState({
      user: { id: 'user1' } as never,
      initializing: false,
    });
    render(
      <MemoryRouter initialEntries={['/app']}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByText('home-page')).toBeInTheDocument();
  });

  it('shows the sign-in prompt (not the builder) at "/app" when signed out', () => {
    // Configured + signed out → the guard blocks the builder and prompts login.
    useAuthStore.setState({
      user: null,
      configured: true,
      initializing: false,
    });
    render(
      <MemoryRouter initialEntries={['/app']}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('heading', { name: /sign in to start building/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText('home-page')).not.toBeInTheDocument();
  });

  it('renders the guarded admin panel at "/admin" for an admin', () => {
    useAuthStore.setState({ user: { id: 'admin1' } as never, isAdmin: true });
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('heading', { name: /admin panel/i }),
    ).toBeInTheDocument();
  });

  it('does not render Home content at "/admin"', () => {
    useAuthStore.setState({ user: { id: 'admin1' } as never, isAdmin: true });
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.queryByText('home-page')).not.toBeInTheDocument();
  });
});
