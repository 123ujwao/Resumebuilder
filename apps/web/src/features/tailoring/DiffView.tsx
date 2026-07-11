import type { BulletChange } from '@resume-forge/core';
import type { PendingChangeMap } from './applyChanges';

/**
 * Diff view of original vs tailored bullets (Req 4.6) with per-change accept /
 * tweak / revert controls (Req 4.7).
 *
 * For each {@link BulletChange} we show the original text and the tailored text
 * side by side. The user can, per change:
 *  - **Accept** → keep the tailored text (the default);
 *  - **Revert** → fall back to the original text;
 *  - **Tweak**  → edit the tailored wording inline (implies "keep tailored").
 *
 * State is fully controlled: the parent owns the {@link PendingChangeMap} and
 * passes an `onChange` updater, so the composed/saved version reflects exactly
 * what the user sees here.
 */
export interface DiffViewProps {
  changes: BulletChange[];
  pending: PendingChangeMap;
  onChange: (next: PendingChangeMap) => void;
}

export function DiffView({ changes, pending, onChange }: DiffViewProps) {
  if (changes.length === 0) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-slate-700">Changes</h3>
        <p className="text-sm text-slate-500">
          No bullet wording changed — the tailoring only re-ordered or re-weighted
          your existing content.
        </p>
      </div>
    );
  }

  const setMode = (path: string, mode: 'tailored' | 'original', tailored: string) => {
    const current = pending[path] ?? { mode: 'tailored', editedText: tailored };
    onChange({ ...pending, [path]: { ...current, mode } });
  };

  const setEditedText = (path: string, editedText: string) => {
    // Editing implies keeping the tailored version (a "tweak").
    onChange({ ...pending, [path]: { mode: 'tailored', editedText } });
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-slate-700">
        Review changes ({changes.length})
      </h3>
      <ul className="space-y-3">
        {changes.map((change) => {
          const decision = pending[change.path] ?? {
            mode: 'tailored' as const,
            editedText: change.tailored,
          };
          const isReverted = decision.mode === 'original';

          return (
            <li
              key={change.path}
              className="rounded-md border border-slate-200 p-3"
              aria-label={`Change at ${change.path}`}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Original
                  </p>
                  <p
                    className={`text-sm ${
                      isReverted ? 'text-slate-900' : 'text-slate-500 line-through'
                    }`}
                  >
                    {change.original}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Tailored
                  </p>
                  <label className="sr-only" htmlFor={`tailored-${change.path}`}>
                    Tailored text for {change.path}
                  </label>
                  <textarea
                    id={`tailored-${change.path}`}
                    value={decision.editedText}
                    onChange={(e) => setEditedText(change.path, e.target.value)}
                    rows={2}
                    disabled={isReverted}
                    className={`w-full resize-y rounded border border-slate-300 p-2 text-sm ${
                      isReverted ? 'bg-slate-50 text-slate-400' : 'text-slate-900'
                    }`}
                  />
                </div>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMode(change.path, 'tailored', change.tailored)}
                  aria-pressed={!isReverted}
                  className={`rounded px-2.5 py-1 text-xs font-medium ${
                    !isReverted
                      ? 'bg-blue-600 text-white'
                      : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => setMode(change.path, 'original', change.tailored)}
                  aria-pressed={isReverted}
                  className={`rounded px-2.5 py-1 text-xs font-medium ${
                    isReverted
                      ? 'bg-slate-700 text-white'
                      : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Revert
                </button>
                <span className="text-xs text-slate-400">
                  {isReverted ? 'Keeping original' : 'Keeping tailored (edit to tweak)'}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
