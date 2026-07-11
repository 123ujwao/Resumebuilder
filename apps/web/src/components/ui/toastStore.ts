import { create } from 'zustand';

/**
 * Lightweight toast notification store (Req 13.1, 13.3).
 *
 * Transient, app-wide success/error/info notifications (e.g. "Tailored version
 * saved", "Couldn't reach Anthropic"). Kept deliberately small: a list of
 * active toasts plus add/dismiss actions. The {@link useToast} helper and the
 * `<Toaster/>` component build on top of this store.
 *
 * Toasts auto-dismiss after `duration` ms (unless `duration` is 0, which keeps
 * them until dismissed). This store owns no timers itself — the `<Toaster/>`
 * schedules dismissal — so it stays trivially testable.
 */

export type ToastVariant = 'success' | 'error' | 'info';

export interface Toast {
  /** Unique id used as the React key and dismissal handle. */
  id: string;
  variant: ToastVariant;
  /** Short, non-technical message shown to the user. */
  message: string;
  /** Auto-dismiss delay in ms. `0` disables auto-dismiss. Defaults to 5000. */
  duration: number;
}

/** Options accepted when adding a toast (id/duration are optional). */
export interface ToastInput {
  variant?: ToastVariant;
  message: string;
  duration?: number;
}

/** Default auto-dismiss delay (ms). */
export const DEFAULT_TOAST_DURATION = 5000;

let counter = 0;
/** Generate a unique toast id, preferring crypto.randomUUID when available. */
function nextId(): string {
  counter += 1;
  const rand = globalThis.crypto?.randomUUID?.();
  return rand ?? `toast-${Date.now()}-${counter}`;
}

export interface ToastStoreState {
  toasts: Toast[];
  /** Add a toast and return its generated id. */
  addToast: (input: ToastInput) => string;
  /** Remove a toast by id (no-op if it's already gone). */
  dismissToast: (id: string) => void;
  /** Remove every toast. */
  clearToasts: () => void;
}

export const useToastStore = create<ToastStoreState>((set) => ({
  toasts: [],
  addToast: (input) => {
    const id = nextId();
    const toast: Toast = {
      id,
      variant: input.variant ?? 'info',
      message: input.message,
      duration: input.duration ?? DEFAULT_TOAST_DURATION,
    };
    set((state) => ({ toasts: [...state.toasts, toast] }));
    return id;
  },
  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  clearToasts: () => set({ toasts: [] }),
}));

/**
 * Ergonomic helper hook for triggering toasts from components.
 *
 * Returns stable convenience methods so callers can write
 * `const toast = useToast(); toast.success('Saved')` without touching the store
 * shape directly.
 */
export function useToast() {
  const addToast = useToastStore((s) => s.addToast);
  const dismissToast = useToastStore((s) => s.dismissToast);

  return {
    /** Add a toast of any variant. */
    show: (input: ToastInput) => addToast(input),
    success: (message: string, duration?: number) =>
      addToast({ variant: 'success', message, duration }),
    error: (message: string, duration?: number) =>
      addToast({ variant: 'error', message, duration }),
    info: (message: string, duration?: number) =>
      addToast({ variant: 'info', message, duration }),
    dismiss: dismissToast,
  };
}
