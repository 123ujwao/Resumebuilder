import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for the payment data layer (Task 10, Req 9.1, 9.3).
 *
 * The Supabase client and the `qrcode` library are mocked so no DB/network is
 * touched. We assert:
 *  - insertPaymentRequest sends the right productId/amount with status pending
 *    and the authenticated user's id (Req 9.3),
 *  - generateUpiQr / loadPaymentDetails invoke qrcode with the UPI deep link
 *    (Req 9.1),
 *  - fetchPendingRequest returns the user's pending row (Req 9.4).
 */

const toDataURL = vi.fn().mockResolvedValue('data:image/png;base64,QR');
vi.mock('qrcode', () => ({ default: { toDataURL } }));

// A fluent query-builder mock whose terminal methods resolve to a configurable
// result. Each `from()` returns a fresh chainable object.
let productResult: { data: unknown; error: unknown } = { data: null, error: null };
let settingsResult: { data: unknown; error: unknown } = { data: null, error: null };
let pendingResult: { data: unknown; error: unknown } = { data: null, error: null };
let insertResult: { data: unknown; error: unknown } = { data: null, error: null };

const insertSpy = vi.fn();

function makeChain(terminalPromise: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const passthrough = () => chain;
  for (const m of ['select', 'eq', 'order', 'limit']) chain[m] = passthrough;
  chain.maybeSingle = () => Promise.resolve(terminalPromise);
  chain.single = () => Promise.resolve(terminalPromise);
  return chain;
}

const fromMock = vi.fn((table: string) => {
  switch (table) {
    case 'products':
      return makeChain(productResult);
    case 'payment_settings':
      return makeChain(settingsResult);
    case 'payment_requests': {
      const chain = makeChain(pendingResult) as Record<string, unknown>;
      // insert() records args then returns a chain resolving to insertResult.
      chain.insert = (payload: unknown) => {
        insertSpy(payload);
        return makeChain(insertResult);
      };
      return chain;
    }
    default:
      return makeChain({ data: null, error: null });
  }
});

vi.mock('../../lib/supabase', () => ({
  isSupabaseConfigured: true,
  getSupabaseClient: () => ({ from: fromMock }),
}));

let authUser: { id: string } | null = { id: 'user-1' };
vi.mock('../auth', () => ({
  useAuthStore: { getState: () => ({ user: authUser }) },
}));

const {
  insertPaymentRequest,
  generateUpiQr,
  loadPaymentDetails,
  fetchPendingRequest,
} = await import('./paymentData');

beforeEach(() => {
  vi.clearAllMocks();
  authUser = { id: 'user-1' };
  productResult = { data: null, error: null };
  settingsResult = { data: null, error: null };
  pendingResult = { data: null, error: null };
  insertResult = { data: null, error: null };
});

describe('generateUpiQr (Req 9.1)', () => {
  it('invokes qrcode.toDataURL with the deep link', async () => {
    const uri = 'upi://pay?pa=op%40bank&am=49.00&cu=INR';
    const result = await generateUpiQr(uri);
    expect(toDataURL).toHaveBeenCalledWith(uri, expect.any(Object));
    expect(result).toBe('data:image/png;base64,QR');
  });
});

describe('loadPaymentDetails (Req 9.1, 9.2)', () => {
  it('builds the UPI link from settings + price and generates the QR', async () => {
    productResult = {
      data: { id: 'p1', name: 'resume_only', price: 49, unlocks_count: 3 },
      error: null,
    };
    settingsResult = { data: { upi_id: 'op@bank', note: 'ResumeForge' }, error: null };

    const details = await loadPaymentDetails('p1');

    expect(details.upiUri).toBe(
      'upi://pay?pa=op%40bank&am=49.00&cu=INR&tn=ResumeForge',
    );
    expect(toDataURL).toHaveBeenCalledWith(details.upiUri, expect.any(Object));
    expect(details.qrDataUrl).toBe('data:image/png;base64,QR');
    expect(details.product.price).toBe(49);
  });
});

describe('insertPaymentRequest (Req 9.3)', () => {
  it('inserts a pending row with the productId, amount, and auth user id', async () => {
    insertResult = {
      data: {
        id: 'req-1',
        product_id: 'p1',
        amount_claimed: 49,
        status: 'pending',
        requested_at: '2026-01-01T00:00:00Z',
      },
      error: null,
    };

    const row = await insertPaymentRequest({ productId: 'p1', amountClaimed: 49 });

    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        product_id: 'p1',
        amount_claimed: 49,
        status: 'pending',
      }),
    );
    expect(row.status).toBe('pending');
  });

  it('throws when signed out (does not insert)', async () => {
    authUser = null;
    await expect(
      insertPaymentRequest({ productId: 'p1', amountClaimed: 49 }),
    ).rejects.toThrow();
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('throws a friendly error when the insert fails', async () => {
    insertResult = { data: null, error: { message: 'rls denied' } };
    await expect(
      insertPaymentRequest({ productId: 'p1', amountClaimed: 49 }),
    ).rejects.toThrow(/could not submit/i);
  });
});

describe('fetchPendingRequest (Req 9.4)', () => {
  it('returns the pending row for the product when one exists', async () => {
    pendingResult = {
      data: {
        id: 'req-1',
        product_id: 'p1',
        amount_claimed: 49,
        status: 'pending',
        requested_at: '2026-01-01T00:00:00Z',
      },
      error: null,
    };
    const row = await fetchPendingRequest('p1');
    expect(row?.status).toBe('pending');
    expect(row?.product_id).toBe('p1');
  });

  it('returns null when signed out', async () => {
    authUser = null;
    expect(await fetchPendingRequest('p1')).toBeNull();
  });

  it('returns null when there is no pending request', async () => {
    pendingResult = { data: null, error: null };
    expect(await fetchPendingRequest('p1')).toBeNull();
  });
});
