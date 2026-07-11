import type { ReactNode } from 'react';

/**
 * Shared empty-state primitive (Req 13.2).
 *
 * When a section has no data yet (empty preview, no versions, no cover letter),
 * we show a friendly, guiding placeholder instead of a blank area. This gives
 * the app one consistent look and a clear "next action" for the user.
 *
 * Slots:
 *  - `icon`   : optional illustration/glyph shown above the title.
 *  - `title`  : the primary message (what's missing / what to do).
 *  - `hint`   : optional secondary explanation.
 *  - `action` : optional call-to-action (button/link) rendered below the hint.
 */
export interface EmptyStateProps {
  /** Optional icon/illustration slot rendered above the title. */
  icon?: ReactNode;
  /** Primary guiding message. */
  title: ReactNode;
  /** Optional supporting hint text. */
  hint?: ReactNode;
  /** Optional call-to-action (e.g. a button). */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, hint, action, className = '' }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center ${className}`}
    >
      {icon && (
        <div aria-hidden="true" className="mb-3 text-slate-400">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-xs text-slate-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
