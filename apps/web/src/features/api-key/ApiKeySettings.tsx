import { useEffect, useState } from 'react';
import {
  ANTHROPIC_API_KEYS_HELP_URL,
  useApiKeyStore,
} from './apiKeyStore';
import { ApiKeyInput } from './ApiKeyInput';

/**
 * Settings panel to update or clear the stored API key at any time (Req 1.7).
 *
 * Shows whether a key is currently stored (masked), lets the user overwrite it,
 * and lets them clear it. Clearing removes the key from `localStorage`.
 */
export function ApiKeySettings() {
  const storedKey = useApiKeyStore((s) => s.apiKey);
  const setKey = useApiKeyStore((s) => s.setKey);
  const clearKey = useApiKeyStore((s) => s.clearKey);

  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState(false);

  // Clear the transient "saved" note whenever the user edits again.
  useEffect(() => {
    if (draft) setSaved(false);
  }, [draft]);

  const trimmed = draft.trim();

  const handleSave = () => {
    if (!trimmed) return;
    setKey(trimmed);
    setDraft('');
    setSaved(true);
  };

  const handleClear = () => {
    clearKey();
    setDraft('');
    setSaved(false);
  };

  /** Mask the stored key for display, revealing only the last 4 characters. */
  const maskedStoredKey = storedKey
    ? `${'•'.repeat(Math.max(storedKey.length - 4, 4))}${storedKey.slice(-4)}`
    : null;

  return (
    <section className="space-y-4" aria-labelledby="api-key-settings-title">
      <div className="space-y-1">
        <h3 id="api-key-settings-title" className="text-base font-semibold text-slate-900">
          Anthropic API key
        </h3>
        <p className="text-sm text-slate-600">
          Stored only in this browser and sent only to Anthropic.{' '}
          <a
            href={ANTHROPIC_API_KEYS_HELP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-600 underline hover:text-blue-700"
          >
            Get a key
          </a>
          .
        </p>
      </div>

      <p className="text-sm text-slate-700">
        Status:{' '}
        {storedKey ? (
          <span className="font-medium text-green-700">
            Key stored (<span className="font-mono">{maskedStoredKey}</span>)
          </span>
        ) : (
          <span className="font-medium text-slate-500">No key stored</span>
        )}
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
        className="space-y-3"
      >
        <ApiKeyInput
          value={draft}
          onChange={setDraft}
          label={storedKey ? 'Replace key' : 'Add key'}
        />
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={!trimmed}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {storedKey ? 'Update key' : 'Save key'}
          </button>
          {storedKey && (
            <button
              type="button"
              onClick={handleClear}
              className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Clear key
            </button>
          )}
          {saved && <span className="text-sm text-green-700">Saved.</span>}
        </div>
      </form>
    </section>
  );
}
