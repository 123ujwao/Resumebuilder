import { useEffect } from 'react';
import { useToastStore, type Toast, type ToastVariant } from './toastStore';

/**
 * App-wide toast host (Req 13.1, 13.3).
 *
 * Renders the active toasts from {@link useToastStore} in a fixed, aria-live
 * region and schedules auto-dismissal for each toast that has a non-zero
 * duration. Mounted once at the app root (see App.tsx) alongside the routes.
 *
 * Accessibility: the container is an `aria-live="polite"` region; each toast is
 * `role="status"` (info/success) or `role="alert"` (error) so failures are
 * announced immediately while routine notices are announced politely.
 */

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  success: 'border-green-200 bg-green-50 text-green-800',
  error: 'border-red-200 bg-red-50 text-red-800',
  info: 'border-slate-200 bg-white text-slate-800',
};

/** A single toast row, responsible for scheduling its own auto-dismiss. */
function ToastItem({ toast }: { toast: Toast }) {
  const dismissToast = useToastStore((s) => s.dismissToast);

  useEffect(() => {
    if (toast.duration <= 0) return;
    const timer = setTimeout(() => dismissToast(toast.id), toast.duration);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, dismissToast]);

  return (
    <div
      role={toast.variant === 'error' ? 'alert' : 'status'}
      className={`pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-md ${VARIANT_CLASSES[toast.variant]}`}
    >
      <span className="flex-1">{toast.message}</span>
      <button
        type="button"
        onClick={() => dismissToast(toast.id)}
        aria-label="Dismiss notification"
        className="shrink-0 text-current/60 hover:text-current"
      >
        ✕
      </button>
    </div>
  );
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
