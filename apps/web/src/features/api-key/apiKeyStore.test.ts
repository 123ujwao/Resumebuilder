import { beforeEach, describe, expect, it } from 'vitest';
import {
  API_KEY_STORAGE_KEY,
  readStoredApiKey,
  useApiKeyStore,
} from './apiKeyStore';

/**
 * Unit tests for the BYOK API key store (Req 1.1, 1.2, 1.5, 1.7, 12.5).
 * Verifies localStorage-only persistence, prompt open/close, and clearing.
 */

function resetStore() {
  localStorage.clear();
  // Reset store to a clean state (no key, prompt closed).
  useApiKeyStore.setState({ apiKey: null, isPromptOpen: false });
}

describe('useApiKeyStore', () => {
  beforeEach(resetStore);

  it('starts with no key when localStorage is empty', () => {
    const state = useApiKeyStore.getState();
    expect(state.apiKey).toBeNull();
    expect(state.hasKey()).toBe(false);
  });

  it('persists a saved key to localStorage only', () => {
    useApiKeyStore.getState().setKey('sk-ant-123');

    expect(useApiKeyStore.getState().apiKey).toBe('sk-ant-123');
    expect(useApiKeyStore.getState().hasKey()).toBe(true);
    // Persisted under the namespaced localStorage key.
    expect(localStorage.getItem(API_KEY_STORAGE_KEY)).toBe('sk-ant-123');
  });

  it('trims whitespace when saving', () => {
    useApiKeyStore.getState().setKey('  sk-ant-abc  ');
    expect(useApiKeyStore.getState().apiKey).toBe('sk-ant-abc');
    expect(localStorage.getItem(API_KEY_STORAGE_KEY)).toBe('sk-ant-abc');
  });

  it('treats a whitespace-only key as clearing the key', () => {
    useApiKeyStore.getState().setKey('sk-ant-123');
    useApiKeyStore.getState().setKey('   ');
    expect(useApiKeyStore.getState().apiKey).toBeNull();
    expect(localStorage.getItem(API_KEY_STORAGE_KEY)).toBeNull();
  });

  it('closes the prompt after saving a key', () => {
    useApiKeyStore.getState().openPrompt();
    expect(useApiKeyStore.getState().isPromptOpen).toBe(true);
    useApiKeyStore.getState().setKey('sk-ant-123');
    expect(useApiKeyStore.getState().isPromptOpen).toBe(false);
  });

  it('clears a stored key from localStorage (Req 1.7)', () => {
    useApiKeyStore.getState().setKey('sk-ant-123');
    useApiKeyStore.getState().clearKey();
    expect(useApiKeyStore.getState().apiKey).toBeNull();
    expect(localStorage.getItem(API_KEY_STORAGE_KEY)).toBeNull();
  });

  it('opens and closes the prompt without altering the stored key', () => {
    useApiKeyStore.getState().setKey('sk-ant-123');
    useApiKeyStore.getState().openPrompt();
    expect(useApiKeyStore.getState().isPromptOpen).toBe(true);
    useApiKeyStore.getState().closePrompt();
    expect(useApiKeyStore.getState().isPromptOpen).toBe(false);
    expect(useApiKeyStore.getState().apiKey).toBe('sk-ant-123');
  });

  it('reads back a stored key via readStoredApiKey', () => {
    localStorage.setItem(API_KEY_STORAGE_KEY, 'sk-ant-persisted');
    expect(readStoredApiKey()).toBe('sk-ant-persisted');
  });

  it('readStoredApiKey returns null for a whitespace-only stored value', () => {
    localStorage.setItem(API_KEY_STORAGE_KEY, '   ');
    expect(readStoredApiKey()).toBeNull();
  });
});
