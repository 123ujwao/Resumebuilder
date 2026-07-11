import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

/**
 * Verifies the /admin guard (Task 11.1, Req 10.1, 10.2):
 *  - signed-out users are prompted to sign in (auth modal opens),
 *  - signed-in non-admins get a neutral not-found (panel existence not leaked),
 *  - signed-in admins see the panel shell,
 *  - a loading state shows while auth/admin status resolves.
 *
 * The auth store is exercised for real; only the Supabase client is mocked so
 * nothing touches the network.
 */

vi.mock('../../lib/supabase', () => ({
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

const { AdminRoute } = await import('./AdminRoute');
const { useAuthStore } = await import('../auth');

function reset() {
  cleanup();
  useAuthStore.setState({
    session: null,
    user: null,
    profile: null,
    isAdmin: false,
    adminChecked: false,
    initializing: false,
    isModalOpen: false,
  });
}

describe('AdminRoute', () => {
  beforeEach(reset);

  it('shows a loading state while auth is initializing (Req 10.2)', () => {
    useAuthStore.setState({ initializing: true, adminChecked: false });
    render(<AdminRoute />);
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);
  });

  it('shows a loading state until the admin check resolves', () => {
    useAuthStore.setState({
      initializing: false,
      adminChecked: false,
      user: { id: 'u1' } as never,
    });
    render(<AdminRoute />);
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);
  });

  it('prompts sign-in when signed out (Req 10.2)', () => {
    useAuthStore.setState({
      initializing: false,
      adminChecked: true,
      user: null,
    });
    render(<AdminRoute />);

    expect(screen.getByText(/sign in required/i)).toBeInTheDocument();
    // The shared auth modal is opened for the signed-out visitor.
    expect(useAuthStore.getState().isModalOpen).toBe(true);
  });

  it('shows a neutral not-found for a signed-in non-admin (Req 10.1)', () => {
    useAuthStore.setState({
      initializing: false,
      adminChecked: true,
      user: { id: 'u1' } as never,
      isAdmin: false,
    });
    render(<AdminRoute />);

    expect(screen.getByText('404')).toBeInTheDocument();
    // Must NOT advertise the admin panel's existence.
    expect(screen.queryByText(/admin/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/not authorized/i)).not.toBeInTheDocument();
  });

  it('renders the admin panel shell for a signed-in admin (Req 10.2)', () => {
    useAuthStore.setState({
      initializing: false,
      adminChecked: true,
      user: { id: 'admin1' } as never,
      isAdmin: true,
    });
    render(<AdminRoute />);

    expect(
      screen.getByRole('heading', { name: /admin panel/i }),
    ).toBeInTheDocument();
    // Tab structure is in place for Tasks 11.2–11.4.
    expect(screen.getByRole('tab', { name: 'Users' })).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'Payment Requests' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'Products & Pricing' }),
    ).toBeInTheDocument();
  });
});
