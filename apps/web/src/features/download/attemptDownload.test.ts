import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for the gated download orchestration (Task 8.3, Req 7.2, 8.10).
 *
 * We mock the Supabase client so no network is touched, and drive the auth
 * store's state directly. The key behaviours:
 *  - signed out => opens auth modal, RPC is NOT called (Req 7.2)
 *  - signed in  => calls rpc('consume_download', { p_product_id }) and maps
 *    'free'/'credit'/'free_forever' => allowed + refreshes the profile (Req 8.10)
 *  - 'payment_required' => payment outcome (Task 10 hook)
 *  - not configured => 'unavailable' (dev graceful degradation)
 */

const rpc = vi.fn();
const openModal = vi.fn();
const refreshProfile = vi.fn().mockResolvedValue(undefined);

// Toggle used by the supabase mock to simulate configured vs. not-configured.
let configured = true;

vi.mock('../../lib/supabase', () => ({
  get isSupabaseConfigured() {
    return configured;
  },
  getSupabaseClient: () => ({ rpc }),
}));

vi.mock('../auth', () => ({
  useAuthStore: {
    getState: () => authState,
  },
}));

let authState: {
  user: { id: string } | null;
  openModal: typeof openModal;
  refreshProfile: typeof refreshProfile;
};

const { attemptDownload } = await import('./attemptDownload');

const PRODUCT = 'prod-123';

beforeEach(() => {
  vi.clearAllMocks();
  configured = true;
  authState = { user: { id: 'u1' }, openModal, refreshProfile };
});

describe('attemptDownload — auth gating (Req 7.2)', () => {
  it('opens the auth modal and does NOT call the RPC when signed out', async () => {
    authState.user = null;

    const outcome = await attemptDownload(PRODUCT);

    expect(outcome).toEqual({ status: 'needs_auth' });
    expect(openModal).toHaveBeenCalledOnce();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('attemptDownload — server-side gating (Req 8.10)', () => {
  it.each(['free', 'credit', 'free_forever'] as const)(
    "maps '%s' to allowed, calls consume_download, and refreshes the profile",
    async (status) => {
      rpc.mockResolvedValue({ data: status, error: null });

      const outcome = await attemptDownload(PRODUCT);

      expect(rpc).toHaveBeenCalledWith('consume_download', {
        p_product_id: PRODUCT,
      });
      expect(outcome).toEqual({ status: 'allowed', reason: status });
      expect(refreshProfile).toHaveBeenCalledOnce();
    },
  );

  it("maps 'payment_required' to the payment outcome and does not refresh", async () => {
    rpc.mockResolvedValue({ data: 'payment_required', error: null });

    const outcome = await attemptDownload(PRODUCT);

    expect(outcome).toEqual({ status: 'payment_required', productId: PRODUCT });
    expect(refreshProfile).not.toHaveBeenCalled();
  });

  it('returns an error outcome when the RPC errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

    const outcome = await attemptDownload(PRODUCT);

    expect(outcome.status).toBe('error');
    expect(refreshProfile).not.toHaveBeenCalled();
  });

  it('treats an unexpected status as an error, not an allow', async () => {
    rpc.mockResolvedValue({ data: 'weird', error: null });

    const outcome = await attemptDownload(PRODUCT);

    expect(outcome.status).toBe('error');
  });
});

describe('attemptDownload — graceful degradation without Supabase', () => {
  it("returns 'unavailable' and never calls the RPC when not configured", async () => {
    configured = false;

    const outcome = await attemptDownload(PRODUCT);

    expect(outcome).toEqual({ status: 'unavailable' });
    expect(rpc).not.toHaveBeenCalled();
  });
});
