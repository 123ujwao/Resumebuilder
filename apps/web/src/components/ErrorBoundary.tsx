import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Top-level error boundary (Req 13.3).
 *
 * Wraps the app so an unexpected render error shows a friendly, recoverable
 * screen ("Something went wrong — reload") instead of a blank white page. React
 * error boundaries must be class components, so this is the one class in the
 * shared UI layer.
 *
 * The fallback is intentionally non-technical: it reassures the user their
 * resume is saved locally and offers a reload. A custom `fallback` can be
 * provided for testing or feature-scoped boundaries.
 */
export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom fallback UI shown when a child throws. */
  fallback?: ReactNode;
  /** Optional hook for logging/telemetry when an error is caught. */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface to the console for debugging; hand off to an optional telemetry
    // hook. We deliberately avoid showing the raw error to the user (Req 13.3).
    console.error('Unexpected application error:', error, info);
    this.props.onError?.(error, info);
  }

  private handleReload = () => {
    globalThis.location?.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;

    return (
      <div
        role="alert"
        className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center"
      >
        <div className="max-w-md space-y-4">
          <h1 className="text-2xl font-bold text-slate-900">Something went wrong</h1>
          <p className="text-sm text-slate-600">
            The app hit an unexpected error. Your resume is saved in this browser,
            so nothing is lost. Reloading usually fixes it.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Reload the app
          </button>
        </div>
      </div>
    );
  }
}
