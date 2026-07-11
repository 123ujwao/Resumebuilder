import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * AuthModal UI tests (Req 7.2, 7.3): sign in/up toggle, calling the store,
 * Google button, and the not-configured message.
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

const { AuthModal } = await import('./AuthModal');
const { useAuthStore } = await import('./authStore');

function reset() {
  cleanup();
  useAuthStore.setState({
    configured: true,
    session: null,
    user: null,
    profile: null,
    initializing: false,
    loading: false,
    isModalOpen: true,
    error: null,
  });
}

describe('AuthModal', () => {
  beforeEach(reset);

  it('renders nothing when closed', () => {
    useAuthStore.setState({ isModalOpen: false });
    render(<AuthModal />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('defaults to sign-in and can toggle to sign-up', async () => {
    const user = userEvent.setup();
    render(<AuthModal />);
    expect(
      screen.getByRole('heading', { name: /welcome back/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /need an account/i }));
    expect(
      screen.getByRole('heading', { name: /create your account/i }),
    ).toBeInTheDocument();
    // Display name field appears in sign-up mode and is required.
    expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument();
  });

  it('calls signInWithPassword with the entered credentials (Req 7.3)', async () => {
    const user = userEvent.setup();
    const spy = vi.fn().mockResolvedValue({ ok: true });
    useAuthStore.setState({ signInWithPassword: spy });

    render(<AuthModal />);
    await user.type(screen.getByLabelText(/email/i), 'a@b.com');
    await user.type(screen.getByLabelText(/password/i), 'secret');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(spy).toHaveBeenCalledWith('a@b.com', 'secret');
  });

  it('hides the Continue with Google button unless Google auth is enabled', () => {
    // VITE_ENABLE_GOOGLE_AUTH is not set in tests, so the button is hidden to
    // avoid an error path until Google OAuth is actually configured.
    render(<AuthModal />);
    expect(
      screen.queryByRole('button', { name: /continue with google/i }),
    ).not.toBeInTheDocument();
  });

  it('shows an error message from the store', () => {
    render(<AuthModal />);
    // Set the error after mount (the open effect clears any prior error).
    act(() => {
      useAuthStore.setState({ error: 'That email or password is incorrect.' });
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/incorrect/i);
  });

  it('shows a friendly message and hides the form when not configured (Req 7.1)', () => {
    useAuthStore.setState({ configured: false });
    render(<AuthModal />);
    expect(screen.getByRole('alert')).toHaveTextContent(/not available/i);
    // No email field when auth is unavailable.
    expect(screen.queryByLabelText(/^email$/i)).not.toBeInTheDocument();
  });
});
