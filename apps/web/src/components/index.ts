/**
 * Shared UI layer (Task 14, Req 13.1-13.3).
 *
 * Cohesive, accessible primitives applied across features:
 *  - Spinner / LoadingState / ButtonSpinner : loading + progress (Req 13.1)
 *  - EmptyState                             : helpful empty states (Req 13.2)
 *  - Alert                                  : inline recoverable errors (Req 13.3)
 *  - Toaster + toast store + useToast       : transient notifications
 *  - ErrorBoundary                          : app-wide recoverable fallback (Req 13.3)
 */
export { Spinner, LoadingState, ButtonSpinner } from './ui/Spinner';
export type { SpinnerProps, SpinnerSize, LoadingStateProps } from './ui/Spinner';
export { EmptyState } from './ui/EmptyState';
export type { EmptyStateProps } from './ui/EmptyState';
export { Alert } from './ui/Alert';
export type { AlertProps, AlertVariant } from './ui/Alert';
export { Toaster } from './ui/Toaster';
export {
  useToastStore,
  useToast,
  DEFAULT_TOAST_DURATION,
  type Toast,
  type ToastInput,
  type ToastVariant,
  type ToastStoreState,
} from './ui/toastStore';
export { ErrorBoundary } from './ErrorBoundary';
export type { ErrorBoundaryProps } from './ErrorBoundary';
