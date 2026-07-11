/**
 * Shared data layer for the ResumeForge extension (Req 11.2).
 *
 * The extension shares auth/resume data with the web app through
 * `chrome.storage.local`, which is scoped to the same browser profile. This
 * module is the single, typed bridge to that storage: it defines the keys and
 * the shape of the shared snapshot, and provides read/write helpers.
 *
 * The shared shape reuses `@resume-forge/core` types so the extension and the
 * web app agree on the data model. The web app currently persists resume state
 * to `localStorage`; this module establishes the `chrome.storage.local` bridge
 * and shape that a future web-app sync step (or the extension itself) can
 * populate. Until then, the extension reads whatever is present and offers a
 * setter for tests / manual seeding.
 */
import type { ResumeData, ResumeVersion } from '@resume-forge/core';

/**
 * Template + style selection, mirroring the web app's `rf.resume_state` shape.
 * Defined structurally here (rather than imported from the web app) so the
 * extension stays decoupled from `apps/web`; the field types come from the
 * shared model where they exist.
 */
export interface TemplateSelection {
  templateId: string;
  font: string;
  accentColor: string;
}

/**
 * The persisted resume state shared with the web app via `chrome.storage.local`.
 * Matches the web app's `rf.resume_state` payload: the list of resume versions
 * (base + tailored, from `@resume-forge/core`), the active selection, and the
 * template choice.
 */
export interface PersistedResumeState {
  versions: ResumeVersion[];
  activeVersionId: string;
  template: TemplateSelection;
}

/** Storage keys, namespaced under `rf.` to avoid collisions in a shared profile. */
export const STORAGE_KEYS = {
  /** The full persisted resume state (versions + active selection + template). */
  resumeState: 'rf.resume_state',
  /** A lightweight auth snapshot mirrored from the web app's session. */
  auth: 'rf.auth',
  /**
   * The user's Anthropic API key (BYOK). Matches the web app's
   * `rf.anthropic_api_key` localStorage key so the web app can mirror it here.
   * The key is only ever sent to `api.anthropic.com` (Req 1.2, 12.5).
   */
  apiKey: 'rf.anthropic_api_key',
} as const;

/** Minimal auth snapshot shared from the web app. No tokens/secrets are stored. */
export interface AuthSnapshot {
  /** Whether a user is currently signed in on the web app. */
  signedIn: boolean;
  /** The signed-in user's email, when available. */
  email?: string;
}

/** The complete shape of the data the extension reads from `chrome.storage.local`. */
export interface SharedState {
  resumeState: PersistedResumeState | null;
  auth: AuthSnapshot | null;
  /** The stored Anthropic API key, or `null` when none is available. */
  apiKey: string | null;
}

/**
 * Whether the `chrome.storage.local` API is available. False in plain web
 * contexts and in unit tests unless a mock is installed on `globalThis.chrome`.
 */
export function isChromeStorageAvailable(): boolean {
  return (
    typeof chrome !== 'undefined' &&
    !!chrome.storage &&
    !!chrome.storage.local
  );
}

/** Read a single key from `chrome.storage.local`, returning `null` when absent. */
async function readKey<T>(key: string): Promise<T | null> {
  if (!isChromeStorageAvailable()) return null;
  const result = await chrome.storage.local.get(key);
  const value = result?.[key];
  return (value ?? null) as T | null;
}

/** Write a single key to `chrome.storage.local`. No-op when storage is unavailable. */
async function writeKey(key: string, value: unknown): Promise<void> {
  if (!isChromeStorageAvailable()) return;
  await chrome.storage.local.set({ [key]: value });
}

/** Remove a single key from `chrome.storage.local`. */
async function removeKey(key: string): Promise<void> {
  if (!isChromeStorageAvailable()) return;
  await chrome.storage.local.remove(key);
}

/** Read the shared persisted resume state, or `null` when none is stored. */
export function getResumeState(): Promise<PersistedResumeState | null> {
  return readKey<PersistedResumeState>(STORAGE_KEYS.resumeState);
}

/** Write the shared persisted resume state. */
export function setResumeState(state: PersistedResumeState): Promise<void> {
  return writeKey(STORAGE_KEYS.resumeState, state);
}

/** Read the shared auth snapshot, or `null` when none is stored. */
export function getAuthSnapshot(): Promise<AuthSnapshot | null> {
  return readKey<AuthSnapshot>(STORAGE_KEYS.auth);
}

/** Write the shared auth snapshot. */
export function setAuthSnapshot(auth: AuthSnapshot): Promise<void> {
  return writeKey(STORAGE_KEYS.auth, auth);
}

/**
 * Read the stored Anthropic API key, or `null` when none is stored. Whitespace-
 * only values are treated as "no key" (matching the web app's behaviour).
 */
export async function getApiKey(): Promise<string | null> {
  const raw = await readKey<string>(STORAGE_KEYS.apiKey);
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Persist (or clear) the Anthropic API key in `chrome.storage.local`. Empty /
 * whitespace-only input clears it. The key is only ever sent to Anthropic.
 */
export async function setApiKey(key: string | null): Promise<void> {
  const trimmed = key?.trim();
  if (trimmed) {
    await writeKey(STORAGE_KEYS.apiKey, trimmed);
  } else {
    await removeKey(STORAGE_KEYS.apiKey);
  }
}

/** Read the full shared state in a single call. */
export async function getSharedState(): Promise<SharedState> {
  const [resumeState, auth, apiKey] = await Promise.all([
    getResumeState(),
    getAuthSnapshot(),
    getApiKey(),
  ]);
  return { resumeState, auth, apiKey };
}

/** Clear all ResumeForge keys from `chrome.storage.local`. */
export async function clearSharedState(): Promise<void> {
  await Promise.all([
    removeKey(STORAGE_KEYS.resumeState),
    removeKey(STORAGE_KEYS.auth),
    removeKey(STORAGE_KEYS.apiKey),
  ]);
}

/**
 * Resolve the resume data the extension should act on: the data of the active
 * version in the shared persisted state, or `null` when nothing is available.
 * Later subtasks (16.3) use this as the source for tailoring + autofill.
 */
export function selectActiveResumeData(
  state: PersistedResumeState | null,
): ResumeData | null {
  if (!state) return null;
  const active = state.versions.find((v) => v.id === state.activeVersionId);
  return active?.data ?? null;
}
