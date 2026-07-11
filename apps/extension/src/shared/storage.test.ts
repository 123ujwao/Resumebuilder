import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  STORAGE_KEYS,
  clearSharedState,
  getApiKey,
  getAuthSnapshot,
  getResumeState,
  getSharedState,
  isChromeStorageAvailable,
  selectActiveResumeData,
  setApiKey,
  setAuthSnapshot,
  setResumeState,
  type AuthSnapshot,
  type PersistedResumeState,
} from './storage.js';

/**
 * Unit tests for the chrome.storage.local bridge (Req 11.2).
 *
 * chrome.* isn't available in vitest, so we install a minimal in-memory mock of
 * `chrome.storage.local` on globalThis with get/set/remove semantics matching
 * the real promise-based MV3 API.
 */

interface StorageMock {
  store: Record<string, unknown>;
}

function installChromeMock(): StorageMock {
  const mock: StorageMock = { store: {} };
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        get: async (key: string) => {
          if (key in mock.store) return { [key]: mock.store[key] };
          return {};
        },
        set: async (items: Record<string, unknown>) => {
          Object.assign(mock.store, items);
        },
        remove: async (key: string) => {
          delete mock.store[key];
        },
      },
    },
  };
  return mock;
}

function removeChromeMock(): void {
  delete (globalThis as unknown as { chrome?: unknown }).chrome;
}

function makeResumeState(name: string): PersistedResumeState {
  const data = {
    personalInfo: { name, email: '', phone: '', location: '' },
    summary: '',
    experience: [],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
  };
  return {
    versions: [
      {
        id: 'v1',
        label: 'Base Resume',
        kind: 'base',
        data,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    activeVersionId: 'v1',
    template: { templateId: 'classic', font: 'Inter', accentColor: '#1e3a8a' },
  };
}

describe('chrome storage availability', () => {
  afterEach(removeChromeMock);

  it('reports unavailable when chrome is undefined', () => {
    removeChromeMock();
    expect(isChromeStorageAvailable()).toBe(false);
  });

  it('reports available when chrome.storage.local exists', () => {
    installChromeMock();
    expect(isChromeStorageAvailable()).toBe(true);
  });
});

describe('resume + auth read/write round-trips', () => {
  beforeEach(() => {
    installChromeMock();
  });
  afterEach(removeChromeMock);

  it('returns null when nothing is stored', async () => {
    expect(await getResumeState()).toBeNull();
    expect(await getAuthSnapshot()).toBeNull();
  });

  it('round-trips persisted resume state', async () => {
    const state = makeResumeState('Ada Lovelace');
    await setResumeState(state);
    expect(await getResumeState()).toEqual(state);
  });

  it('round-trips an auth snapshot', async () => {
    const auth: AuthSnapshot = { signedIn: true, email: 'ada@example.com' };
    await setAuthSnapshot(auth);
    expect(await getAuthSnapshot()).toEqual(auth);
  });

  it('reads the full shared state in one call', async () => {
    const state = makeResumeState('Grace Hopper');
    const auth: AuthSnapshot = { signedIn: true, email: 'grace@example.com' };
    await setResumeState(state);
    await setAuthSnapshot(auth);
    expect(await getSharedState()).toEqual({
      resumeState: state,
      auth,
      apiKey: null,
    });
  });

  it('clears all ResumeForge keys', async () => {
    await setResumeState(makeResumeState('Temp'));
    await setAuthSnapshot({ signedIn: true });
    await setApiKey('sk-ant-temp');
    await clearSharedState();
    expect(await getSharedState()).toEqual({
      resumeState: null,
      auth: null,
      apiKey: null,
    });
  });

  it('round-trips + trims the Anthropic API key, and clears on empty', async () => {
    await setApiKey('  sk-ant-key  ');
    expect(await getApiKey()).toBe('sk-ant-key');
    await setApiKey('   ');
    expect(await getApiKey()).toBeNull();
  });

  it('uses the shared rf.anthropic_api_key namespaced key', async () => {
    const mock = installChromeMock();
    await setApiKey('sk-ant-xyz');
    expect(Object.keys(mock.store)).toContain(STORAGE_KEYS.apiKey);
    expect(STORAGE_KEYS.apiKey).toBe('rf.anthropic_api_key');
  });

  it('uses the rf. namespaced keys', async () => {
    const mock = installChromeMock();
    await setResumeState(makeResumeState('Keyed'));
    expect(Object.keys(mock.store)).toContain(STORAGE_KEYS.resumeState);
  });
});

describe('storage helpers are no-ops without chrome', () => {
  beforeEach(removeChromeMock);

  it('reads return null and writes do not throw', async () => {
    await expect(setResumeState(makeResumeState('X'))).resolves.toBeUndefined();
    expect(await getResumeState()).toBeNull();
  });
});

describe('selectActiveResumeData', () => {
  it('returns null for null state', () => {
    expect(selectActiveResumeData(null)).toBeNull();
  });

  it('returns the active version data', () => {
    const state = makeResumeState('Katherine Johnson');
    expect(selectActiveResumeData(state)?.personalInfo.name).toBe(
      'Katherine Johnson',
    );
  });

  it('returns null when the active version id is missing', () => {
    const state = makeResumeState('Missing');
    state.activeVersionId = 'does-not-exist';
    expect(selectActiveResumeData(state)).toBeNull();
  });
});
