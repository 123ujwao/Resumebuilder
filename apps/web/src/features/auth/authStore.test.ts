import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for the auth + profile store (Req 7.2–7.6).
 *
 * The Supabase client is fully mocked so tests exercise the store's logic
 * (profile upsert on signup, last_login_at update + profile load on sign-in,
 * onAuthStateChange sync) without any network. The not-configured path is also
 * covered to prove the builder is never blocked (Req 7.1).
 */

// --- Mock the Supabase lib module ------------------------------------------
// A mutable flag lets individual tests flip the "configured" state.
let mockConfigured = true;

const authApi = {
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
};

// Records the last table operations so assertions can inspect them.
const dbCalls: {
  upserts: Array<{ table: string; values: unknown; opts: unknown }>;
  updates: Array<{ table: string; values: unknown; eqId: string }>;
  selects: Array<{ table: string; eqId: string }>;
} = { upserts: [], updates: [], selects: [] };

// Row returned by profile selects; tests can mutate it.
let profileRow: Record<string, unknown> | null = null;
// Row returned by `admins` selects; tests can mutate it (null = not an admin).
let adminRow: Record<string, unknown> | null = null;
let updateShouldError = false;

function makeQuery(table: string) {
  return {
    upsert(values: unknown, opts: unknown) {
      dbCalls.upserts.push({ table, values, opts });
      return Promise.resolve({ data: null, error: null });
    },
    update(values: unknown) {
      let eqId = '';
      const chain = {
        eq(_col: string, val: string) {
          eqId = val;
          dbCalls.updates.push({ table, values, eqId });
          return Promise.resolve({
            data: null,
            error: updateShouldError ? { message: 'no row' } : null,
          });
        },
      };
      return chain;
    },
    select(_cols: string) {
      let eqId = '';
      const chain = {
        eq(_col: string, val: string) {
          eqId = val;
          return {
            maybeSingle() {
              dbCalls.selects.push({ table, eqId });
              const data = table === 'admins' ? adminRow : profileRow;
              return Promise.resolve({ data, error: null });
            },
          };
        },
      };
      return chain;
    },
  };
}

const mockClient = {
  auth: authApi,
  from: vi.fn((table: string) => makeQuery(table)),
};

vi.mock('../../lib/supabase', () => ({
  get isSupabaseConfigured() {
    return mockConfigured;
  },
  getSupabaseClient: () => mockClient,
}));

// Import AFTER mocks are registered.
const { useAuthStore, AUTH_NOT_CONFIGURED_MESSAGE } = await import('./authStore');

function resetAll() {
  mockConfigured = true;
  updateShouldError = false;
  profileRow = null;
  adminRow = null;
  dbCalls.upserts = [];
  dbCalls.updates = [];
  dbCalls.selects = [];
  Object.values(authApi).forEach((fn) => fn.mockReset());
  authApi.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
  useAuthStore.setState({
    configured: true,
    session: null,
    user: null,
    profile: null,
    initializing: false,
    loading: false,
    isModalOpen: false,
    error: null,
    isAdmin: false,
    adminChecked: false,
  });
}

describe('useAuthStore', () => {
  beforeEach(resetAll);

  it('signUp creates a profile via upsert with id and email (Req 7.4)', async () => {
    const user = { id: 'user-1', email: 'a@b.com', user_metadata: {} };
    authApi.signUp.mockResolvedValue({
      data: { user, session: null },
      error: null,
    });

    const result = await useAuthStore.getState().signUp('a@b.com', 'pw', 'Ada');

    expect(result).toEqual({ ok: true });
    const upsert = dbCalls.upserts.find((u) => u.table === 'profiles');
    expect(upsert).toBeDefined();
    expect(upsert?.values).toMatchObject({
      id: 'user-1',
      email: 'a@b.com',
      display_name: 'Ada',
    });
    // Upsert must be keyed on id so retries are idempotent.
    expect(upsert?.opts).toMatchObject({ onConflict: 'id' });
    // Must NOT attempt to set the protected columns (Req 7.6).
    expect(upsert?.values).not.toHaveProperty('is_free_forever');
    expect(upsert?.values).not.toHaveProperty('free_downloads_used');
  });

  it('signInWithPassword updates last_login_at and loads the profile (Req 7.5, 7.6)', async () => {
    const user = { id: 'user-2', email: 'c@d.com', user_metadata: {} };
    authApi.signInWithPassword.mockResolvedValue({
      data: { user, session: { user } },
      error: null,
    });
    profileRow = {
      id: 'user-2',
      email: 'c@d.com',
      display_name: null,
      created_at: null,
      last_login_at: '2024-01-01T00:00:00Z',
      free_downloads_used: 1,
      is_free_forever: false,
    };

    const result = await useAuthStore.getState().signInWithPassword('c@d.com', 'pw');

    expect(result).toEqual({ ok: true });
    // last_login_at updated on the user's row.
    const update = dbCalls.updates.find((u) => u.table === 'profiles');
    expect(update?.eqId).toBe('user-2');
    expect(update?.values).toHaveProperty('last_login_at');
    // Profile loaded into the store.
    expect(useAuthStore.getState().profile?.id).toBe('user-2');
    expect(useAuthStore.getState().profile?.free_downloads_used).toBe(1);
    expect(useAuthStore.getState().isModalOpen).toBe(false);
  });

  it('creates the profile if last_login_at update finds no row', async () => {
    const user = { id: 'user-3', email: 'e@f.com', user_metadata: {} };
    authApi.signInWithPassword.mockResolvedValue({
      data: { user, session: { user } },
      error: null,
    });
    updateShouldError = true; // simulate "no existing row"

    await useAuthStore.getState().signInWithPassword('e@f.com', 'pw');

    // Falls back to an upsert to create the profile.
    expect(dbCalls.upserts.some((u) => u.table === 'profiles')).toBe(true);
  });

  it('surfaces a friendly error on invalid login', async () => {
    authApi.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    });

    const result = await useAuthStore.getState().signInWithPassword('x@y.com', 'bad');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/incorrect/i);
    }
    expect(useAuthStore.getState().error).toMatch(/incorrect/i);
    expect(useAuthStore.getState().loading).toBe(false);
  });

  it('signInWithGoogle calls OAuth with the google provider (Req 7.3)', async () => {
    authApi.signInWithOAuth.mockResolvedValue({ data: {}, error: null });

    const result = await useAuthStore.getState().signInWithGoogle();

    expect(result).toEqual({ ok: true });
    expect(authApi.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google' }),
    );
  });

  it('initialize restores a session and subscribes to auth changes', async () => {
    const user = { id: 'user-4', email: 'g@h.com', user_metadata: {} };
    authApi.getSession.mockResolvedValue({ data: { session: { user } } });
    profileRow = {
      id: 'user-4',
      email: 'g@h.com',
      display_name: null,
      created_at: null,
      last_login_at: null,
      free_downloads_used: 0,
      is_free_forever: false,
    };

    useAuthStore.getState().initialize();
    // Let the getSession promise chain resolve.
    await vi.waitFor(() => {
      expect(useAuthStore.getState().user?.id).toBe('user-4');
    });
    expect(authApi.onAuthStateChange).toHaveBeenCalled();
  });

  it('signOut clears session and profile', async () => {
    useAuthStore.setState({
      session: { user: { id: 'z' } } as never,
      user: { id: 'z' } as never,
      profile: { id: 'z' } as never,
    });
    authApi.signOut.mockResolvedValue({ error: null });

    await useAuthStore.getState().signOut();

    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().profile).toBeNull();
  });

  describe('checkAdmin (Req 10.2)', () => {
    it('marks the user as admin when the admins row is returned', async () => {
      useAuthStore.setState({ user: { id: 'admin-1' } as never });
      adminRow = { user_id: 'admin-1' };

      await useAuthStore.getState().checkAdmin();

      expect(useAuthStore.getState().isAdmin).toBe(true);
      expect(useAuthStore.getState().adminChecked).toBe(true);
      // The check queries the `admins` table for the current user's row.
      expect(
        dbCalls.selects.some((s) => s.table === 'admins' && s.eqId === 'admin-1'),
      ).toBe(true);
    });

    it('marks the user as non-admin when RLS returns no row', async () => {
      useAuthStore.setState({ user: { id: 'user-1' } as never });
      adminRow = null;

      await useAuthStore.getState().checkAdmin();

      expect(useAuthStore.getState().isAdmin).toBe(false);
      expect(useAuthStore.getState().adminChecked).toBe(true);
    });

    it('is a non-admin no-op when signed out', async () => {
      useAuthStore.setState({ user: null });

      await useAuthStore.getState().checkAdmin();

      expect(useAuthStore.getState().isAdmin).toBe(false);
      expect(useAuthStore.getState().adminChecked).toBe(true);
      expect(dbCalls.selects.some((s) => s.table === 'admins')).toBe(false);
    });
  });

  describe('when Supabase is not configured (Req 7.1)', () => {
    beforeEach(() => {
      mockConfigured = false;
      useAuthStore.setState({ configured: false });
    });

    it('initialize is a no-op and stops initializing', () => {
      useAuthStore.getState().initialize();
      expect(useAuthStore.getState().initializing).toBe(false);
      expect(authApi.getSession).not.toHaveBeenCalled();
    });

    it('signUp returns a friendly not-configured message without crashing', async () => {
      const result = await useAuthStore.getState().signUp('a@b.com', 'pw');
      expect(result).toEqual({ ok: false, error: AUTH_NOT_CONFIGURED_MESSAGE });
      expect(authApi.signUp).not.toHaveBeenCalled();
    });

    it('signInWithPassword returns a friendly not-configured message', async () => {
      const result = await useAuthStore
        .getState()
        .signInWithPassword('a@b.com', 'pw');
      expect(result).toEqual({ ok: false, error: AUTH_NOT_CONFIGURED_MESSAGE });
    });
  });
});
