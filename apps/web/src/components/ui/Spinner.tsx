import type { ReactNode } from 'react';

/**
 * Shared loading primitives (Req 13.1).
 *
 * Long-running actions (AI extraction, tailoring, cover-letter generation,
 * export) must show a clear, accessible progress state. These components give
 * the whole app one consistent, screen-reader-friendly affordance instead of
 * ad-hoc "Building…" text scattered per feature.
 *
 * - {@link Spinner}: a small animated indicator. It is purely decorative
 *   (`aria-hidden`) so it never double-announces alongside a `LoadingState`
 *   label or a button's own text.
 * - {@link LoadingState}: an inline `role="status"` region (polite live region)
 *   that pairs a spinner with a text label, announced to assistive tech.
 * - {@link ButtonSpinner}: a tiny inline spinner sized for use inside buttons.
 */

export type SpinnerSize = 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Record<SpinnerSize, string> = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-8 w-8 border-[3px]',
};

export interface SpinnerProps {
  /** Visual size of the spinner. Defaults to `md`. */
  size?: SpinnerSize;
  /** Extra classes (e.g. color overrides) merged onto the spinner. */
  className?: string;
}

/**
 * A purely decorative animated spinner. Announcement is left to the wrapping
 * {@link LoadingState} or button label so screen readers aren't spammed.
 */
export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  return (
    <span
      data-testid="spinner"
      aria-hidden="true"
      className={`inline-block animate-spin rounded-full border-current border-t-transparent text-blue-600 ${SIZE_CLASSES[size]} ${className}`}
    />
  );
}

export interface LoadingStateProps {
  /** The label announced to assistive tech and shown next to the spinner. */
  label?: string;
  /** Optional secondary hint rendered under the label. */
  hint?: ReactNode;
  /** Spinner size. Defaults to `md`. */
  size?: SpinnerSize;
  /** When true, centers the block and adds vertical padding for empty panels. */
  center?: boolean;
  className?: string;
}

/**
 * An accessible loading region. Renders a `role="status"` container with an
 * `aria-live="polite"` announcement so the label is read once when it appears.
 */
export function LoadingState({
  label = 'Loading…',
  hint,
  size = 'md',
  center = false,
  className = '',
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex ${
        center ? 'flex-col items-center justify-center py-10 text-center' : 'items-center gap-3'
      } ${className}`}
    >
      <Spinner size={size} />
      <span className={center ? 'mt-3' : ''}>
        <span className="text-sm font-medium text-slate-700">{label}</span>
        {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
      </span>
    </div>
  );
}

/**
 * A tiny inline spinner intended to sit inside a button while its action runs.
 * Decorative — the button's text label carries the meaning for assistive tech.
 */
export function ButtonSpinner({ className = '' }: { className?: string }) {
  return (
    <span
      data-testid="button-spinner"
      aria-hidden="true"
      className={`mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent align-[-1px] ${className}`}
    />
  );
}
