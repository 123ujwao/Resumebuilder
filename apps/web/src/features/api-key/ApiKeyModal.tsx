import { useEffect, useState } from 'react';
import {
  ANTHROPIC_API_KEYS_HELP_URL,
  useApiKeyStore,
} from './apiKeyStore';
import { ApiKeyInput } from './ApiKeyInput';

/**
 * API key prompt modal (Req 1.1, 1.3, 1.4, 1.5).
 *
 * Rendered once near the app root. It opens automatically on first load when no
 * key is stored (Req 1.1) and whenever an AI action requests a key via
 * `useRequireApiKey` (Req 1.5). It offers a masked input with a show/hide
 * toggle (Req 1.3) and a help link for obtaining a key (Req 1.4).
 *
 * The key is only ever written to `localStorage` via the store; nothing here
 * transmits it anywhere (Req 12.5).
 */
export function ApiKeyModal() {
  const isPromptOpen = useApiKeyStore((s) => s.isPromptOpen);
  const hasStoredKey = useApiKeyStore((s) => Boolean(s.apiKey));
  const openPrompt = useApiKeyStore((s) => s.openPrompt);
  const closePrompt = useApiKeyStore((s) => s.closePrompt);
  const setKey = useApiKeyStore((s) => s.setKey);

  const [draft, setDraft] = useState('');

  // Req 1.1: prompt on first load when no key is stored.
  useEffect(() => {
    if (!hasStoredKey) {
      openPrompt();
    }
    // Only run on mount; subsequent opens are driven by explicit actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset the draft whenever the modal opens.
  useEffect(() => {
    if (isPromptOpen) {
      setDraft('');
    }
  }, [isPromptOpen]);

  if (!isPromptOpen) {
    return null;
  }

  const trimmed = draft.trim();
  const canSave = trimmed.length > 0;

  const handleSave = () => {
    if (!canSave) return;
    setKey(trimmed);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="api-key-modal-title"
    >
      <div className="w-full max-w-md space-y-4 rounded-lg bg-white p-6 shadow-xl">
        <div className="space-y-1">
          <h2 id="api-key-modal-title" className="text-lg font-semibold text-slate-900">
            Add your Anthropic API key
          </h2>
          <p className="text-sm text-slate-600">
            ResumeForge uses your own Anthropic key for AI features. It is stored
            only in this browser and is sent only to Anthropic, never to our
            servers.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
          className="space-y-4"
        >
          <ApiKeyInput value={draft} onChange={setDraft} autoFocus />

          {/* Req 1.4: help link for obtaining a key. */}
          <p className="text-sm text-slate-500">
            Need a key?{' '}
            <a
              href={ANTHROPIC_API_KEYS_HELP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-blue-600 underline hover:text-blue-700"
            >
              Get one from the Anthropic Console
            </a>
            .
          </p>

          <div className="flex justify-end gap-2">
            {/* Allow dismissing only when a key already exists; on first load
                (no key) the user must add one to proceed with AI features. */}
            {hasStoredKey && (
              <button
                type="button"
                onClick={closePrompt}
                className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={!canSave}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save key
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
