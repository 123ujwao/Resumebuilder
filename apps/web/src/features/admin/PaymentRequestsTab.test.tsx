import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Tests for the admin Payment Requests tab (Task 11.3, Req 10.5-10.8).
 *
 * The adminData module is mocked so we control the data and assert the RPC
 * calls. We verify:
 *  - the pending table renders user email, product name, amount, timestamp
 *    (Req 10.5),
 *  - Approve calls approvePayment then refetches so the row moves to history
 *    (Req 10.6),
 *  - Reject calls rejectPayment (Req 10.7),
 *  - the history view renders past approved/rejected requests (Req 10.8),
 *  - an RPC failure surfaces an error.
 */

const listPaymentRequests = vi.fn();
const approvePayment = vi.fn();
const rejectPayment = vi.fn();

vi.mock('./adminData', () => ({
  listPaymentRequests: (...args: unknown[]) => listPaymentRequests(...args),
  approvePayment: (...args: unknown[]) => approvePayment(...args),
  rejectPayment: (...args: unknown[]) => rejectPayment(...args),
}));

const { PaymentRequestsTab } = await import('./PaymentRequestsTab');

const PENDING = [
  {
    id: 'r1',
    user_id: 'u1',
    product_id: 'p1',
    userEmail: 'alice@example.com',
    productName: 'resume_only',
    amount_claimed: 99,
    status: 'pending' as const,
    requested_at: '2026-01-02T00:00:00Z',
    approved_at: null,
  },
];

const HISTORY = [
  {
    id: 'r2',
    user_id: 'u2',
    product_id: 'p2',
    userEmail: 'bob@example.com',
    productName: 'resume_plus_cover_letter',
    amount_claimed: 149,
    status: 'approved' as const,
    requested_at: '2026-01-01T00:00:00Z',
    approved_at: '2026-01-01T06:00:00Z',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  listPaymentRequests.mockResolvedValue({ pending: PENDING, history: HISTORY });
  approvePayment.mockResolvedValue(undefined);
  rejectPayment.mockResolvedValue(undefined);
});

describe('PaymentRequestsTab pending list (Req 10.5)', () => {
  it('renders pending rows with user email, product, amount, and timestamp', async () => {
    render(<PaymentRequestsTab />);

    expect(await screen.findByText('alice@example.com')).toBeInTheDocument();

    const row = screen.getByText('alice@example.com').closest('tr')!;
    expect(within(row).getByText('resume_only')).toBeInTheDocument();
    expect(within(row).getByText('₹99')).toBeInTheDocument();
    // Approve / Reject buttons present.
    expect(
      within(row).getByRole('button', { name: /approve/i }),
    ).toBeInTheDocument();
    expect(
      within(row).getByRole('button', { name: /reject/i }),
    ).toBeInTheDocument();
  });

  it('shows an empty state when no requests are pending', async () => {
    listPaymentRequests.mockResolvedValueOnce({ pending: [], history: HISTORY });
    render(<PaymentRequestsTab />);
    expect(
      await screen.findByText(/no pending payment requests/i),
    ).toBeInTheDocument();
  });
});

describe('PaymentRequestsTab history view (Req 10.8)', () => {
  it('renders past approved/rejected requests with status and resolved time', async () => {
    render(<PaymentRequestsTab />);

    expect(await screen.findByText('bob@example.com')).toBeInTheDocument();
    const row = screen.getByText('bob@example.com').closest('tr')!;
    expect(
      within(row).getByText('resume_plus_cover_letter'),
    ).toBeInTheDocument();
    expect(within(row).getByText('approved')).toBeInTheDocument();
  });

  it('shows an empty history state when there are no past requests', async () => {
    listPaymentRequests.mockResolvedValueOnce({ pending: PENDING, history: [] });
    render(<PaymentRequestsTab />);
    await screen.findByText('alice@example.com');
    expect(screen.getByText(/no past requests yet/i)).toBeInTheDocument();
  });
});

describe('PaymentRequestsTab actions (Req 10.6, 10.7)', () => {
  it('approves a request and refetches', async () => {
    const user = userEvent.setup();
    render(<PaymentRequestsTab />);
    await screen.findByText('alice@example.com');

    await user.click(screen.getByRole('button', { name: /approve/i }));

    expect(approvePayment).toHaveBeenCalledWith('r1');
    // Initial load + refetch after approve.
    await waitFor(() =>
      expect(listPaymentRequests).toHaveBeenCalledTimes(2),
    );
  });

  it('rejects a request via the reject RPC', async () => {
    const user = userEvent.setup();
    render(<PaymentRequestsTab />);
    await screen.findByText('alice@example.com');

    await user.click(screen.getByRole('button', { name: /reject/i }));

    expect(rejectPayment).toHaveBeenCalledWith('r1');
    await waitFor(() =>
      expect(listPaymentRequests).toHaveBeenCalledTimes(2),
    );
  });

  it('surfaces an error when the approve RPC fails', async () => {
    approvePayment.mockRejectedValueOnce(
      new Error('Could not approve this payment request. It may no longer be pending.'),
    );
    const user = userEvent.setup();
    render(<PaymentRequestsTab />);
    await screen.findByText('alice@example.com');

    await user.click(screen.getByRole('button', { name: /approve/i }));

    expect(
      await screen.findByText(/could not approve this payment request/i),
    ).toBeInTheDocument();
  });
});

describe('PaymentRequestsTab states', () => {
  it('shows a loading state then the content', async () => {
    render(<PaymentRequestsTab />);
    expect(screen.getByText(/loading payment requests/i)).toBeInTheDocument();
    await screen.findByText('alice@example.com');
  });

  it('shows an error state when loading fails', async () => {
    listPaymentRequests.mockRejectedValueOnce(
      new Error('Could not load payment requests.'),
    );
    render(<PaymentRequestsTab />);
    expect(
      await screen.findByText('Could not load payment requests.'),
    ).toBeInTheDocument();
  });
});
