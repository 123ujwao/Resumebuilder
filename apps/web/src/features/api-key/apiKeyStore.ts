import { create } from 'zustand';

/**
 * BYOK API key store (Req 1.1, 1.2, 1.5, 1.7, 12.5).
 *
 * The user's Anthropic API key is the only sensitive secret this app holds.
 * It is persisted to `localStorage` ONLY and is never sent to Supabase or any
 * server other than `api.anthropic.com` (Req 12.5). This store owns:
 *  - reading/writing the key in `localStorage`
 *  - tracking whether a key exists (drives the first-load prompt, Req 1.1)
 *  - opening/closing the key prompt so AI actions can block on a missing key
 *    instead of failing silently (Req 1.5)
 *
 * The stored key is read by callers and passed to `createAnthropicClient`
 * (from `@resume-forge/core`); this store never makes network calls itself.
 */

/** `localStorage` key. Namespaced under `rf.` to avoid collisions. */
export const API_KEY_STORAGE_KEY = 'rf.anthropic_api_key';

/** Public console page where a user can create an Anthropic API key (Req 1.4). */
export const ANTHROPIC_API_KEYS_HELP_URL =
  'https://console.anthropic.com/settings/keys';

/**
 * Read the stored key from `localStorage`. Returns `null` when nothing is
 * stored or when `localStorage` is unavailable (e.g. SSR/tests without a DOM).
 * Whitespace-only values are treated as "no key".
 */
export function readStoredApiKey(): string | null {
  try {
    const raw = globalThis.localStorage?.getItem(API_KEY_STORAGE_KEY);
    const trimmed = raw?.trim();
    return trimmed ? trimmed : null;
  } catch {
    return null;
  }
}

/** Persist (or clear) the key in `localStorage`, tolerating storage errors. */
function writeStoredApiKey(key: string | null): void {
  try {
    if (key && key.trim()) {
      globalThis.localStorage?.setItem(API_KEY_STORAGE_KEY, key.trim());
    } else {
      globalThis.localStorage?.removeItem(API_KEY_STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures (private mode / disabled storage). The in-memory
    // state below still reflects the user's intent for the current session.
  }
}

export interface ApiKeyState {
  /** The current API key, or `null` when none is stored. */
  apiKey: string | null;
  /** Whether the key prompt/modal is currently open. */
  isPromptOpen: boolean;
  /** True when a non-empty key is stored. */
  hasKey: () => boolean;
  /** Save a key to `localStorage` and close the prompt. Empty input clears it. */
  setKey: (key: string) => void;
  /** Remove the stored key from `localStorage` (Req 1.7 clear). */
  clearKey: () => void;
  /** Open the key prompt (used when an AI action needs a key, Req 1.5). */
  openPrompt: () => void;
  /** Close the key prompt without changing the stored key. */
  closePrompt: () => void;
}

export const useApiKeyStore = create<ApiKeyState>((set, get) => ({
  apiKey: readStoredApiKey(),
  isPromptOpen: false,
  hasKey: () => Boolean(get().apiKey),
  setKey: (key: string) => {
    const trimmed = key.trim();
    const next = trimmed ? trimmed : null;
    writeStoredApiKey(next);
    set({ apiKey: next, isPromptOpen: false });
  },
  clearKey: () => {
    writeStoredApiKey(null);
    set({ apiKey: null });
  },
  openPrompt: () => set({ isPromptOpen: true }),
  closePrompt: () => set({ isPromptOpen: false }),
}));
