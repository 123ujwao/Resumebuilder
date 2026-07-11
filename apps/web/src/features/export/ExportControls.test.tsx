import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Tests for the export UI gate wiring (Task 9, Req 6.4).
 *
 * Focus: the PDF/DOCX buttons run through the download gate first — on
 * `allowed` the matching export function is called and the file is downloaded;
 * on `payment_required` the payment hook fires and NO file is produced; on
 * `needs_auth` neither happens. The heavy @react-pdf/renderer + docx modules
 * are mocked so tests stay fast and deterministic.
 */

const attemptDownload = vi.fn();
const exportResumePdf = vi.fn();
const exportResumeDocx = vi.fn();
const triggerBlobDownload = vi.fn();

vi.mock('../download', () => ({
  attemptDownload: (...args: unknown[]) => attemptDownload(...args),
}));
vi.mock('./pdf', () => ({
  exportResumePdf: (...args: unknown[]) => exportResumePdf(...args),
}));
vi.mock('./docx', () => ({
  exportResumeDocx: (...args: unknown[]) => exportResumeDocx(...args),
}));
vi.mock('./download', () => ({
  triggerBlobDownload: (...args: unknown[]) => triggerBlobDownload(...args),
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

const { ExportControls } = await import('./ExportControls');
const { useAuthStore } = await import('../auth');

const PRODUCT = 'prod-1';

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  useAuthStore.setState({ profile: null as never });
  exportResumePdf.mockResolvedValue(new Blob(['pdf']));
  exportResumeDocx.mockResolvedValue(new Blob(['docx']));
});

describe('ExportControls — gate wiring (Req 6.4)', () => {
  it('generates and downloads a PDF when the gate allows it', async () => {
    const user = userEvent.setup();
    attemptDownload.mockResolvedValue({ status: 'allowed', reason: 'free' });
    render(<ExportControls productId={PRODUCT} />);

    await user.click(screen.getByRole('button', { name: /download pdf/i }));

    expect(attemptDownload).toHaveBeenCalledWith(PRODUCT);
    await waitFor(() => expect(exportResumePdf).toHaveBeenCalledTimes(1));
    expect(triggerBlobDownload).toHaveBeenCalledTimes(1);
    expect(exportResumeDocx).not.toHaveBeenCalled();
  });

  it('generates and downloads a DOCX when the gate allows it', async () => {
    const user = userEvent.setup();
    attemptDownload.mockResolvedValue({ status: 'allowed', reason: 'credit' });
    render(<ExportControls productId={PRODUCT} />);

    await user.click(screen.getByRole('button', { name: /download docx/i }));

    await waitFor(() => expect(exportResumeDocx).toHaveBeenCalledTimes(1));
    expect(triggerBlobDownload).toHaveBeenCalledTimes(1);
    expect(exportResumePdf).not.toHaveBeenCalled();
  });

  it('calls onPaymentRequired and does NOT produce a file when payment is required', async () => {
    const user = userEvent.setup();
    attemptDownload.mockResolvedValue({
      status: 'payment_required',
      productId: PRODUCT,
    });
    const onPaymentRequired = vi.fn();
    render(<ExportControls productId={PRODUCT} onPaymentRequired={onPaymentRequired} />);

    await user.click(screen.getByRole('button', { name: /download pdf/i }));

    await waitFor(() => expect(onPaymentRequired).toHaveBeenCalledWith(PRODUCT));
    expect(exportResumePdf).not.toHaveBeenCalled();
    expect(triggerBlobDownload).not.toHaveBeenCalled();
  });

  it('produces no file when the user needs to authenticate', async () => {
    const user = userEvent.setup();
    attemptDownload.mockResolvedValue({ status: 'needs_auth' });
    render(<ExportControls productId={PRODUCT} />);

    await user.click(screen.getByRole('button', { name: /download pdf/i }));

    await waitFor(() =>
      expect(screen.getByText(/please sign in/i)).toBeInTheDocument(),
    );
    expect(exportResumePdf).not.toHaveBeenCalled();
    expect(exportResumeDocx).not.toHaveBeenCalled();
    expect(triggerBlobDownload).not.toHaveBeenCalled();
  });

  it('still produces a file when gating is unavailable (dev)', async () => {
    const user = userEvent.setup();
    attemptDownload.mockResolvedValue({ status: 'unavailable' });
    render(<ExportControls productId={PRODUCT} />);

    await user.click(screen.getByRole('button', { name: /download pdf/i }));

    await waitFor(() => expect(exportResumePdf).toHaveBeenCalledTimes(1));
    expect(triggerBlobDownload).toHaveBeenCalledTimes(1);
  });

  it('shows the error message when the gate errors, producing no file', async () => {
    const user = userEvent.setup();
    attemptDownload.mockResolvedValue({ status: 'error', message: 'Boom' });
    render(<ExportControls productId={PRODUCT} />);

    await user.click(screen.getByRole('button', { name: /download pdf/i }));

    await waitFor(() => expect(screen.getByText('Boom')).toBeInTheDocument());
    expect(exportResumePdf).not.toHaveBeenCalled();
  });
});

describe('ExportControls — version selection (Req 6.3)', () => {
  it('lists every saved version for export', () => {
    render(<ExportControls productId={PRODUCT} />);
    // The store starts with a single "Base Resume" version.
    expect(screen.getByRole('option', { name: 'Base Resume' })).toBeInTheDocument();
  });
});
