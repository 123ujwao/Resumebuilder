import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for the admin data layer (Task 11.2, Req 10.3, 10.4).
 *
 * The Supabase client is mocked so no DB/network is touched. We assert:
 *  - listUsers stitches credits per product onto each user row (Req 10.3),
 *  - setFreeForever calls rpc('set_free_forever', { p_user_id, p_value })
 *    (Req 10.4),
 *  - errors from either query/RPC surface as friendly errors.
 */

let profilesResult: { data: unknown; error: unknown } = { data: [], error: null };
let productsResult: { data: unknown; error: unknown } = { data: [], error: null };
let creditsResult: { data: unknown; error: unknown } = { data: [], error: null };
let paymentRequestsResult: { data: unknown; error: unknown } = {
  data: [],
  error: null,
};
let paymentSettingsResult: { data: unknown; error: unknown } = {
  data: null,
  error: null,
};
// Terminal result returned by insert/update/upsert chains (via .single()).
let writeResult: { data: unknown; error: unknown } = { data: null, error: null };
let rpcResult: { error: unknown } = { error: null };

// Records the last write op per table so tests can assert payload/filters.
const writeSpy = vi.fn();

const rpcSpy = vi.fn();

function makeChain(
  table: string,
  readResult: { data: unknown; error: unknown },
) {
  // Chainable query builder that is itself a thenable resolving to the result,
  // so both `await supabase.from(...).select(...)` and further chaining work.
  // Reads resolve to `readResult`; write ops (insert/update/upsert) switch the
  // terminal result to `writeResult` and record the payload via writeSpy so
  // tests can assert what was written.
  const chain: Record<string, unknown> = {};
  const state = { result: readResult };
  const passthrough = () => chain;
  for (const m of ['select', 'order', 'limit']) chain[m] = passthrough;
  chain.eq = (column: string, value: unknown) => {
    writeSpy(table, 'eq', { column, value });
    return chain;
  };
  for (const m of ['insert', 'update', 'upsert']) {
    chain[m] = (payload: unknown) => {
      writeSpy(table, m, payload);
      state.result = writeResult;
      return chain;
    };
  }
  chain.single = () => Promise.resolve(state.result);
  chain.maybeSingle = () => Promise.resolve(state.result);
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(state.result).then(resolve);
  return chain;
}

const fromMock = vi.fn((table: string) => {
  switch (table) {
    case 'profiles':
      return makeChain(table, profilesResult);
    case 'products':
      return makeChain(table, productsResult);
    case 'user_credits':
      return makeChain(table, creditsResult);
    case 'payment_requests':
      return makeChain(table, paymentRequestsResult);
    case 'payment_settings':
      return makeChain(table, paymentSettingsResult);
    default:
      return makeChain(table, { data: [], error: null });
  }
});

vi.mock('../../lib/supabase', () => ({
  isSupabaseConfigured: true,
  getSupabaseClient: () => ({
    from: fromMock,
    rpc: (...args: unknown[]) => {
      rpcSpy(...args);
      return Promise.resolve(rpcResult);
    },
  }),
}));

const {
  listUsers,
  setFreeForever,
  listPaymentRequests,
  approvePayment,
  rejectPayment,
  listProducts,
  createProduct,
  updateProduct,
  setProductActive,
  getPaymentSettings,
  updatePaymentSettings,
} = await import('./adminData');

beforeEach(() => {
  vi.clearAllMocks();
  profilesResult = { data: [], error: null };
  productsResult = { data: [], error: null };
  creditsResult = { data: [], error: null };
  paymentRequestsResult = { data: [], error: null };
  paymentSettingsResult = { data: null, error: null };
  writeResult = { data: null, error: null };
  rpcResult = { error: null };
});

describe('listUsers (Req 10.3)', () => {
  it('stitches credits per product onto each user row', async () => {
    profilesResult = {
      data: [
        {
          id: 'u1',
          email: 'alice@example.com',
          last_login_at: '2026-01-01T00:00:00Z',
          free_downloads_used: 1,
          is_free_forever: false,
        },
        {
          id: 'u2',
          email: 'bob@example.com',
          last_login_at: null,
          free_downloads_used: 2,
          is_free_forever: true,
        },
      ],
      error: null,
    };
    productsResult = {
      data: [
        { id: 'p1', name: 'resume_only' },
        { id: 'p2', name: 'resume_plus_cover_letter' },
      ],
      error: null,
    };
    creditsResult = {
      data: [
        { user_id: 'u1', product_id: 'p1', credits_remaining: 3 },
        { user_id: 'u1', product_id: 'p2', credits_remaining: 1 },
        { user_id: 'u2', product_id: 'p1', credits_remaining: 5 },
      ],
      error: null,
    };

    const { products, users } = await listUsers();

    expect(products).toHaveLength(2);
    const alice = users.find((u) => u.id === 'u1')!;
    const bob = users.find((u) => u.id === 'u2')!;
    expect(alice.creditsByProduct).toEqual({ p1: 3, p2: 1 });
    // Bob has no p2 credits row -> absent (UI renders 0).
    expect(bob.creditsByProduct).toEqual({ p1: 5 });
    expect(bob.creditsByProduct.p2).toBeUndefined();
  });

  it('returns empty maps when a user has no credits', async () => {
    profilesResult = {
      data: [
        {
          id: 'u1',
          email: 'nocredits@example.com',
          last_login_at: null,
          free_downloads_used: 0,
          is_free_forever: false,
        },
      ],
      error: null,
    };
    productsResult = { data: [{ id: 'p1', name: 'resume_only' }], error: null };
    creditsResult = { data: [], error: null };

    const { users } = await listUsers();
    expect(users[0].creditsByProduct).toEqual({});
  });

  it('throws a friendly error when the profiles query fails', async () => {
    profilesResult = { data: null, error: { message: 'rls denied' } };
    await expect(listUsers()).rejects.toThrow(/could not load users/i);
  });
});

describe('setFreeForever (Req 10.4)', () => {
  it('calls rpc set_free_forever with p_user_id and p_value', async () => {
    await setFreeForever('u1', true);
    expect(rpcSpy).toHaveBeenCalledWith('set_free_forever', {
      p_user_id: 'u1',
      p_value: true,
    });
  });

  it('passes false through to the RPC', async () => {
    await setFreeForever('u2', false);
    expect(rpcSpy).toHaveBeenCalledWith('set_free_forever', {
      p_user_id: 'u2',
      p_value: false,
    });
  });

  it('throws a friendly error when the RPC fails', async () => {
    rpcResult = { error: { message: 'rls denied' } };
    await expect(setFreeForever('u1', true)).rejects.toThrow(
      /could not update free-forever/i,
    );
  });
});

describe('listPaymentRequests (Req 10.5, 10.8)', () => {
  it('stitches product name + user email and splits pending vs history', async () => {
    productsResult = {
      data: [
        { id: 'p1', name: 'resume_only' },
        { id: 'p2', name: 'resume_plus_cover_letter' },
      ],
      error: null,
    };
    profilesResult = {
      data: [
        { id: 'u1', email: 'alice@example.com' },
        { id: 'u2', email: 'bob@example.com' },
      ],
      error: null,
    };
    paymentRequestsResult = {
      data: [
        {
          id: 'r1',
          user_id: 'u1',
          product_id: 'p1',
          amount_claimed: 99,
          status: 'pending',
          requested_at: '2026-01-02T00:00:00Z',
          approved_at: null,
        },
        {
          id: 'r2',
          user_id: 'u2',
          product_id: 'p2',
          amount_claimed: 149,
          status: 'approved',
          requested_at: '2026-01-01T00:00:00Z',
          approved_at: '2026-01-01T06:00:00Z',
        },
        {
          id: 'r3',
          user_id: 'u1',
          product_id: 'p1',
          amount_claimed: 99,
          status: 'rejected',
          requested_at: '2025-12-31T00:00:00Z',
          approved_at: null,
        },
        {
          id: 'r4',
          user_id: 'u2',
          product_id: 'p2',
          amount_claimed: 149,
          status: 'pending',
          requested_at: '2026-01-01T12:00:00Z',
          approved_at: null,
        },
      ],
      error: null,
    };

    const { pending, history } = await listPaymentRequests();

    // Pending queue: only pending rows, oldest requested_at first.
    expect(pending.map((r) => r.id)).toEqual(['r4', 'r1']);
    // History: only approved/rejected rows.
    expect(history.map((r) => r.id).sort()).toEqual(['r2', 'r3']);

    // Stitched product name + user email.
    const r1 = pending.find((r) => r.id === 'r1')!;
    expect(r1.userEmail).toBe('alice@example.com');
    expect(r1.productName).toBe('resume_only');
    expect(r1.amount_claimed).toBe(99);

    const r2 = history.find((r) => r.id === 'r2')!;
    expect(r2.userEmail).toBe('bob@example.com');
    expect(r2.productName).toBe('resume_plus_cover_letter');
    expect(r2.status).toBe('approved');
    expect(r2.approved_at).toBe('2026-01-01T06:00:00Z');
  });

  it('falls back to placeholders for unknown product/user references', async () => {
    productsResult = { data: [], error: null };
    profilesResult = { data: [], error: null };
    paymentRequestsResult = {
      data: [
        {
          id: 'r1',
          user_id: 'ghost',
          product_id: 'gone',
          amount_claimed: 10,
          status: 'pending',
          requested_at: '2026-01-01T00:00:00Z',
          approved_at: null,
        },
      ],
      error: null,
    };

    const { pending } = await listPaymentRequests();
    expect(pending[0].userEmail).toBe('Unknown user');
    expect(pending[0].productName).toBe('Unknown product');
  });

  it('throws a friendly error when the requests query fails', async () => {
    paymentRequestsResult = { data: null, error: { message: 'rls denied' } };
    await expect(listPaymentRequests()).rejects.toThrow(
      /could not load payment requests/i,
    );
  });
});

describe('approvePayment (Req 10.6)', () => {
  it('calls rpc approve_payment with p_request_id', async () => {
    await approvePayment('r1');
    expect(rpcSpy).toHaveBeenCalledWith('approve_payment', {
      p_request_id: 'r1',
    });
  });

  it('throws a friendly error when the RPC fails (no longer pending)', async () => {
    rpcResult = { error: { message: 'not pending' } };
    await expect(approvePayment('r1')).rejects.toThrow(
      /could not approve/i,
    );
  });
});

describe('rejectPayment (Req 10.7)', () => {
  it('calls rpc reject_payment with p_request_id', async () => {
    await rejectPayment('r2');
    expect(rpcSpy).toHaveBeenCalledWith('reject_payment', {
      p_request_id: 'r2',
    });
  });

  it('throws a friendly error when the RPC fails', async () => {
    rpcResult = { error: { message: 'not pending' } };
    await expect(rejectPayment('r2')).rejects.toThrow(/could not reject/i);
  });
});

describe('listProducts (Req 10.9)', () => {
  it('returns full product rows ordered by name', async () => {
    productsResult = {
      data: [
        {
          id: 'p1',
          name: 'resume_only',
          price: 99,
          unlocks_count: 1,
          active: true,
        },
        {
          id: 'p2',
          name: 'resume_plus_cover_letter',
          price: 149,
          unlocks_count: 3,
          active: false,
        },
      ],
      error: null,
    };

    const products = await listProducts();
    expect(products).toHaveLength(2);
    expect(products[0]).toEqual({
      id: 'p1',
      name: 'resume_only',
      price: 99,
      unlocks_count: 1,
      active: true,
    });
    expect(products[1].active).toBe(false);
  });

  it('throws a friendly error when the query fails', async () => {
    productsResult = { data: null, error: { message: 'rls denied' } };
    await expect(listProducts()).rejects.toThrow(/could not load products/i);
  });
});

describe('createProduct (Req 10.9)', () => {
  it('inserts a product (defaulting active) and returns the created row', async () => {
    writeResult = {
      data: {
        id: 'p9',
        name: 'new_product',
        price: 50,
        unlocks_count: 2,
        active: true,
      },
      error: null,
    };

    const created = await createProduct({
      name: 'new_product',
      price: 50,
      unlocks_count: 2,
    });

    expect(created.id).toBe('p9');
    // Insert payload defaults active: true and carries the given fields.
    expect(writeSpy).toHaveBeenCalledWith('products', 'insert', {
      active: true,
      name: 'new_product',
      price: 50,
      unlocks_count: 2,
    });
  });

  it('throws a friendly error when the insert fails', async () => {
    writeResult = { data: null, error: { message: 'rls denied' } };
    await expect(
      createProduct({ name: 'x', price: 1, unlocks_count: 1 }),
    ).rejects.toThrow(/could not create the product/i);
  });
});

describe('updateProduct (Req 10.9)', () => {
  it('updates the given fields filtered by id and returns the row', async () => {
    writeResult = {
      data: {
        id: 'p1',
        name: 'renamed',
        price: 120,
        unlocks_count: 4,
        active: true,
      },
      error: null,
    };

    const updated = await updateProduct('p1', { name: 'renamed', price: 120 });

    expect(updated.name).toBe('renamed');
    expect(writeSpy).toHaveBeenCalledWith('products', 'update', {
      name: 'renamed',
      price: 120,
    });
    expect(writeSpy).toHaveBeenCalledWith('products', 'eq', {
      column: 'id',
      value: 'p1',
    });
  });

  it('throws a friendly error when the update fails', async () => {
    writeResult = { data: null, error: { message: 'rls denied' } };
    await expect(updateProduct('p1', { price: 1 })).rejects.toThrow(
      /could not update the product/i,
    );
  });
});

describe('setProductActive (Req 10.9)', () => {
  it('updates only the active flag', async () => {
    writeResult = {
      data: {
        id: 'p1',
        name: 'resume_only',
        price: 99,
        unlocks_count: 1,
        active: false,
      },
      error: null,
    };

    const updated = await setProductActive('p1', false);
    expect(updated.active).toBe(false);
    expect(writeSpy).toHaveBeenCalledWith('products', 'update', {
      active: false,
    });
  });
});

describe('getPaymentSettings (Req 10.9)', () => {
  it('reads the single settings row (id=1)', async () => {
    paymentSettingsResult = {
      data: { upi_id: 'acme@bank', note: 'Thanks!' },
      error: null,
    };

    const settings = await getPaymentSettings();
    expect(settings).toEqual({ upi_id: 'acme@bank', note: 'Thanks!' });
    expect(writeSpy).toHaveBeenCalledWith('payment_settings', 'eq', {
      column: 'id',
      value: 1,
    });
  });

  it('returns empty defaults when no row exists', async () => {
    paymentSettingsResult = { data: null, error: null };
    const settings = await getPaymentSettings();
    expect(settings).toEqual({ upi_id: '', note: '' });
  });

  it('throws a friendly error when the query fails', async () => {
    paymentSettingsResult = { data: null, error: { message: 'boom' } };
    await expect(getPaymentSettings()).rejects.toThrow(
      /could not load payment settings/i,
    );
  });
});

describe('updatePaymentSettings (Req 10.9)', () => {
  it('upserts the single row (id=1) with the given values', async () => {
    writeResult = {
      data: { upi_id: 'new@bank', note: 'Updated note' },
      error: null,
    };

    const saved = await updatePaymentSettings({
      upi_id: 'new@bank',
      note: 'Updated note',
    });

    expect(saved).toEqual({ upi_id: 'new@bank', note: 'Updated note' });
    expect(writeSpy).toHaveBeenCalledWith('payment_settings', 'upsert', {
      id: 1,
      upi_id: 'new@bank',
      note: 'Updated note',
    });
  });

  it('throws a friendly error when the upsert fails', async () => {
    writeResult = { data: null, error: { message: 'rls denied' } };
    await expect(
      updatePaymentSettings({ upi_id: 'x@y', note: '' }),
    ).rejects.toThrow(/could not save payment settings/i);
  });
});
