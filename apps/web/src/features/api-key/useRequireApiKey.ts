import { useCallback } from 'react';
import { useApiKeyStore } from './apiKeyStore';

/**
 * Guard hook for AI-triggering UI (Req 1.5).
 *
 * Any component that is about to invoke an AI feature should call
 * `ensureApiKey()` first. When a key is stored it returns the key so the caller
 * can pass it to `createAnthropicClient`. When no key exists it opens the key
 * prompt and returns `null`, so the action is blocked visibly instead of
 * failing silently.
 *
 * Example:
 * ```ts
 * const ensureApiKey = useRequireApiKey();
 * const onTailor = () => {
 *   const key = ensureApiKey();
 *   if (!key) return; // prompt is now open
 *   runTailoring(key);
 * };
 * ```
 */
export function useRequireApiKey(): () => string | null {
  const openPrompt = useApiKeyStore((s) => s.openPrompt);

  return useCallback(() => {
    // Read the freshest value directly to avoid stale closures.
    const key = useApiKeyStore.getState().apiKey;
    if (!key) {
      openPrompt();
      return null;
    }
    return key;
  }, [openPrompt]);
}
