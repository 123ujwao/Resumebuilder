import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Tests for the UPI PaymentModal (Task 10, Req 9.3, 9.4, 9.5).
 *
 * The data layer is mocked so no DB/network is involved. We verify:
 *  - "I've paid" calls insertPaymentRequest with the right productId/amount and
 *    then shows the pending state (Req 9.3, 9.4),
 *  - the pending state renders directly when a pending request already exists
 *    (Req 9.4) and communicates manual verification (Req 9.5).
 */

const loadPaymentDetails = vi.fn();
const fetchPendingRequest = vi.fn();
const insertPaymentRequest = vi.fn();

vi.mock('./paymentData', () => ({
  loadPaymentDetails: (...args: unknown[]) => loadPaymentDetails(...args),
  fetchPendingRequest: (...args: unknown[]) => fetchPendingRequest(...args),
  insertPaymentRequest: (...args: unknown[]) => insertPaymentRequest(...args),
  PAYMENT_NOT_CONFIGURED_MESSAGE: 'not configured',
}));

let configured = true;
vi.mock('../../lib/supabase', () => ({
  get isSupabaseConfigured() {
    return configured;
  },
}));

const { PaymentModal } = await import('./PaymentModal');

const DETAILS = {
  product: { id: 'p1', name: 'resume_only', price: 49, unlocks_count: 3 },
  settings: { upi_id: 'op@bank', note: 'ResumeForge' },
  upiUri: 'upi://pay?pa=op%40bank&am=49.00&cu=INR&tn=ResumeForge',
  qrDataUrl: 'data:image/png;base64,QR',
};

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  configured = true;
  fetchPendingRequest.mockResolvedValue(null);
  loadPaymentDetails.mockResolvedValue(DETAILS);
  insertPaymentRequest.mockResolvedValue({
    id: 'req-1',
    product_id: 'p1',
    amount_claimed: 49,
    status: 'pending',
    requested_at: null,
  });
});

describe('PaymentModal', () => {
  it('renders nothing when productId is null', () => {
    render(<PaymentModal productId={null} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the QR, UPI link, price, and manual-verification notice (Req 9.1, 9.5)', async () => {
    render(<PaymentModal productId="p1" onClose={() => {}} />);

    expect(await screen.findByAltText(/upi payment qr code/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: DETAILS.upiUri })).toBeInTheDocument();
    expect(screen.getByText(/op@bank/)).toBeInTheDocument();
    expect(screen.getByText(/verification is done manually/i)).toBeInTheDocument();
  });

  it('inserts a pending request on "I\'ve paid" then shows pending state (Req 9.3, 9.4)', async () => {
    const user = userEvent.setup();
    render(<PaymentModal productId="p1" onClose={() => {}} />);

    await user.click(await screen.findByRole('button', { name: /i've paid/i }));

    await waitFor(() =>
      expect(insertPaymentRequest).toHaveBeenCalledWith({
        productId: 'p1',
        amountClaimed: 49,
      }),
    );
    expect(
      await screen.findByText(/pending admin verification/i),
    ).toBeInTheDocument();
  });

  it('opens directly into pending state when a request already exists (Req 9.4)', async () => {
    fetchPendingRequest.mockResolvedValue({
      id: 'req-1',
      product_id: 'p1',
      amount_claimed: 49,
      status: 'pending',
      requested_at: null,
    });

    render(<PaymentModal productId="p1" onClose={() => {}} />);

    expect(
      await screen.findByText(/pending admin verification/i),
    ).toBeInTheDocument();
    // Did not attempt to load QR/product details.
    expect(loadPaymentDetails).not.toHaveBeenCalled();
    // No "I've paid" button in the pending state.
    expect(screen.queryByRole('button', { name: /i've paid/i })).not.toBeInTheDocument();
  });

  it('shows a graceful message when Supabase is not configured', async () => {
    configured = false;
    render(<PaymentModal productId="p1" onClose={() => {}} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/not configured/i);
  });
});
