import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Tests for the download gating UI (Task 8.3, Req 8.9).
 *
 * Focus: the free-count display caps at the shared limit and shows the
 * free-forever state, and the Download button routes gate outcomes to the
 * injected onAllowed / onPaymentRequired callbacks (the extension points for
 * Task 9 export and Task 10 payment).
 */

const attemptDownload = vi.fn();

vi.mock('./attemptDownload', () => ({
  attemptDownload: (...args: unknown[]) => attemptDownload(...args),
}));

// Minimal Supabase mock so importing the auth store doesn't touch the network.
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
    rpc: vi.fn(),
  }),
}));

const { DownloadControls, freeCountLabel } = await import('./DownloadControls');
const { useAuthStore } = await import('../auth');

const PRODUCT = 'prod-1';

function setProfile(profile: unknown) {
  useAuthStore.setState({ profile: profile as never });
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  setProfile(null);
});

describe('freeCountLabel — capped display (Req 8.9)', () => {
  it('shows "0 of 2 free downloads used" when none used', () => {
    expect(freeCountLabel(false, 0)).toBe('0 of 2 free downloads used');
  });

  it('shows "1 of 2 free downloads used"', () => {
    expect(freeCountLabel(false, 1)).toBe('1 of 2 free downloads used');
  });

  it('caps the displayed count at 2 even if the server reports more', () => {
    expect(freeCountLabel(false, 5)).toBe('2 of 2 free downloads used');
  });

  it('shows the free-forever state instead of a count', () => {
    expect(freeCountLabel(true, 0)).toBe('Unlimited (free forever)');
  });
});

describe('DownloadControls — count display', () => {
  it('renders the capped count from the profile', () => {
    setProfile({ is_free_forever: false, free_downloads_used: 9 });
    render(<DownloadControls productId={PRODUCT} />);
    expect(screen.getByText('2 of 2 free downloads used')).toBeInTheDocument();
  });

  it('renders the free-forever label when the flag is set', () => {
    setProfile({ is_free_forever: true, free_downloads_used: 0 });
    render(<DownloadControls productId={PRODUCT} />);
    expect(screen.getByText('Unlimited (free forever)')).toBeInTheDocument();
  });
});

describe('DownloadControls — outcome routing', () => {
  it('calls onAllowed when the gate allows the download', async () => {
    const user = userEvent.setup();
    attemptDownload.mockResolvedValue({ status: 'allowed', reason: 'free' });
    const onAllowed = vi.fn();
    render(<DownloadControls productId={PRODUCT} onAllowed={onAllowed} />);

    await user.click(screen.getByRole('button', { name: /download/i }));

    expect(attemptDownload).toHaveBeenCalledWith(PRODUCT);
    expect(onAllowed).toHaveBeenCalledWith('free');
  });

  it('calls onPaymentRequired when the gate blocks the download', async () => {
    const user = userEvent.setup();
    attemptDownload.mockResolvedValue({
      status: 'payment_required',
      productId: PRODUCT,
    });
    const onPaymentRequired = vi.fn();
    render(
      <DownloadControls
        productId={PRODUCT}
        onPaymentRequired={onPaymentRequired}
      />,
    );

    await user.click(screen.getByRole('button', { name: /download/i }));

    expect(onPaymentRequired).toHaveBeenCalledWith(PRODUCT);
  });
});
