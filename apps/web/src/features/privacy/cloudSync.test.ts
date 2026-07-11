import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for the OPTIONAL cross-device sync layer (Task 15, Req 12.2).
 *
 * The Supabase client and auth store are mocked so no network is touched. We
 * assert:
 *  - syncResumeToCloud upserts the current resume keyed by the user id,
 *  - loadResumeFromCloud reads + validates the user's row,
 *  - both fail gracefully when signed out.
 */

const upsertSpy = vi.fn().mockResolvedValue({ error: null });
let selectResult: { data: unknown; error: unknown } = { data: null, error: null };

function makeChain() {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.maybeSingle = () => Promise.resolve(selectResult);
  chain.upsert = (payload: unknown, opts: unknown) => {
    upsertSpy(payload, opts);
    return Promise.resolve({ error: null });
  };
  return chain;
}

let configured = true;
vi.mock('../../lib/supabase', () => ({
  get isSupabaseConfigured() {
    return configured;
  },
  getSupabaseClient: () => ({ from: () => makeChain() }),
}));

let authUser: { id: string } | null = { id: 'user-1' };
vi.mock('../auth', () => ({
  useAuthStore: { getState: () => ({ user: authUser }) },
}));

import { syncResumeToCloud, loadResumeFromCloud } from './cloudSync';
import { useResumeStore } from '../../store/resumeStore';

beforeEach(() => {
  vi.clearAllMocks();
  configured = true;
  authUser = { id: 'user-1' };
  selectResult = { data: null, error: null };
  useResumeStore.getState().reset();
});

describe('syncResumeToCloud', () => {
  it('upserts the current resume keyed by user id (Req 12.2)', async () => {
    useResumeStore.getState().updatePersonalInfo({ name: 'Cloud User' });

    const result = await syncResumeToCloud();

    expect(result.ok).toBe(true);
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const [payload, opts] = upsertSpy.mock.calls[0];
    expect(payload.user_id).toBe('user-1');
    expect(payload.data.versions[0].data.personalInfo.name).toBe('Cloud User');
    expect(opts).toEqual({ onConflict: 'user_id' });
  });

  it('fails gracefully when signed out', async () => {
    authUser = null;
    const result = await syncResumeToCloud();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('not_signed_in');
    expect(upsertSpy).not.toHaveBeenCalled();
  });
});

describe('loadResumeFromCloud', () => {
  it('reads and validates the user row (Req 12.2)', async () => {
    const base = useResumeStore.getState();
    selectResult = {
      data: {
        data: {
          versions: base.versions,
          activeVersionId: base.activeVersionId,
          template: base.template,
        },
      },
      error: null,
    };

    const result = await loadResumeFromCloud();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value?.activeVersionId).toBe(base.activeVersionId);
    }
  });

  it('returns null when the user has no synced row', async () => {
    selectResult = { data: null, error: null };
    const result = await loadResumeFromCloud();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });
});
