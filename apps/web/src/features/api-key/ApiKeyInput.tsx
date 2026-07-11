import { useId, useState } from 'react';

/**
 * Password-masked API key input with a show/hide toggle (Req 1.3).
 *
 * Controlled component: the parent owns the value. It renders as `type=password`
 * by default and flips to `type=text` when the user toggles visibility, so the
 * key is masked unless deliberately revealed.
 */

export interface ApiKeyInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Accessible label. Defaults to "Anthropic API key". */
  label?: string;
  /** Optional placeholder text. */
  placeholder?: string;
  id?: string;
  autoFocus?: boolean;
}

export function ApiKeyInput({
  value,
  onChange,
  label = 'Anthropic API key',
  placeholder = 'sk-ant-...',
  id,
  autoFocus,
}: ApiKeyInputProps) {
  const [revealed, setRevealed] = useState(false);
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          // Req 1.3: masked as a password field by default.
          type={revealed ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-md border border-slate-300 px-3 py-2 pr-16 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
        <button
          type="button"
          // Req 1.3: show/hide toggle.
          onClick={() => setRevealed((r) => !r)}
          aria-pressed={revealed}
          aria-label={revealed ? 'Hide API key' : 'Show API key'}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-xs font-medium text-slate-500 hover:text-slate-700"
        >
          {revealed ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  );
}
