import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Verifies the download guard (Req 7.2): opens the auth modal and returns null
 * when signed out, and returns the user when signed in. Also confirms the guard
 * does not gate building/editing — it only runs when a caller invokes it.
 */

// Minimal Supabase mock so importing the store doesn't touch the network.
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

const { useRequireAuth } = await import('./useRequireAuth');
const { useAuthStore } = await import('./authStore');

function Harness({ onResult }: { onResult: (u: unknown) => void }) {
  const ensureAuthed = useRequireAuth();
  return (
    <button type="button" onClick={() => onResult(ensureAuthed())}>
      download
    </button>
  );
}

function reset() {
  cleanup();
  useAuthStore.setState({
    session: null,
    user: null,
    profile: null,
    isModalOpen: false,
  });
}

describe('useRequireAuth', () => {
  beforeEach(reset);

  it('opens the auth modal and returns null when signed out (Req 7.2)', async () => {
    const user = userEvent.setup();
    let result: unknown = 'unset';
    render(<Harness onResult={(u) => (result = u)} />);

    await user.click(screen.getByRole('button', { name: 'download' }));

    expect(result).toBeNull();
    expect(useAuthStore.getState().isModalOpen).toBe(true);
  });

  it('returns the user and does not open the modal when signed in', async () => {
    const user = userEvent.setup();
    useAuthStore.setState({ user: { id: 'u1' } as never });
    let result: unknown = null;
    render(<Harness onResult={(u) => (result = u)} />);

    await user.click(screen.getByRole('button', { name: 'download' }));

    expect(result).toMatchObject({ id: 'u1' });
    expect(useAuthStore.getState().isModalOpen).toBe(false);
  });

  it('does not open the modal until the guard is invoked (builder stays free, Req 7.1)', () => {
    render(<Harness onResult={() => {}} />);
    // Merely rendering a component that uses the guard must not gate anything.
    expect(useAuthStore.getState().isModalOpen).toBe(false);
  });
});
