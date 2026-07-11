import type { ReactNode } from 'react';

/**
 * Shared inline alert primitive (Req 13.3).
 *
 * Surfaces clear, non-technical, recoverable messages inline within a section.
 * The `error` and `warning` variants render `role="alert"` so assistive tech
 * announces them immediately; `success`/`info` use `role="status"` (polite).
 *
 * An optional `onRetry` renders a retry affordance so the user can recover from
 * a transient failure without hunting for the original control (Req 13.3).
 */
export type AlertVariant = 'error' | 'warning' | 'success' | 'info';

const VARIANT_CLASSES: Record<AlertVariant, string> = {
  error: 'border-red-200 bg-red-50 text-red-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  success: 'border-green-200 bg-green-50 text-green-700',
  info: 'border-blue-200 bg-blue-50 text-blue-700',
};

export interface AlertProps {
  /** Visual + semantic variant. Defaults to `error`. */
  variant?: AlertVariant;
  /** Optional bold title shown above the message. */
  title?: ReactNode;
  /** The message body. */
  children: ReactNode;
  /** When provided, renders a "Try again" button wired to this handler. */
  onRetry?: () => void;
  /** Custom label for the retry button. */
  retryLabel?: string;
  className?: string;
}

export function Alert({
  variant = 'error',
  title,
  children,
  onRetry,
  retryLabel = 'Try again',
  className = '',
}: AlertProps) {
  // Errors/warnings assert (announced immediately); success/info are polite.
  const role = variant === 'error' || variant === 'warning' ? 'alert' : 'status';

  return (
    <div
      role={role}
      className={`rounded-md border p-3 text-sm ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {title && <p className="font-medium">{title}</p>}
      <div className={title ? 'mt-1' : ''}>{children}</div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded border border-current/30 px-2.5 py-1 text-xs font-medium hover:bg-white/40"
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}
