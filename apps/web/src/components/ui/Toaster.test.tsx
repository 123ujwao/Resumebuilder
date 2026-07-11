import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { Toaster } from './Toaster';
import { useToastStore } from './toastStore';

/**
 * Tests for the toast store + Toaster (Req 13.1, 13.3).
 *
 * Covers store add/dismiss semantics and that the Toaster renders active toasts
 * and auto-dismisses them after their duration.
 */
function resetToasts() {
  cleanup();
  useToastStore.setState({ toasts: [] });
}

describe('toast store', () => {
  beforeEach(resetToasts);

  it('adds a toast with defaults and returns its id', () => {
    const id = useToastStore.getState().addToast({ message: 'Hello' });
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({ id, message: 'Hello', variant: 'info' });
  });

  it('dismisses a toast by id', () => {
    const id = useToastStore.getState().addToast({ message: 'Bye' });
    useToastStore.getState().dismissToast(id);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('clears all toasts', () => {
    useToastStore.getState().addToast({ message: 'a' });
    useToastStore.getState().addToast({ message: 'b' });
    useToastStore.getState().clearToasts();
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});

describe('Toaster', () => {
  beforeEach(() => {
    resetToasts();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders active toasts, using role=alert for errors', () => {
    act(() => {
      useToastStore.getState().addToast({ variant: 'error', message: 'It broke' });
    });
    render(<Toaster />);
    expect(screen.getByRole('alert')).toHaveTextContent('It broke');
  });

  it('auto-dismisses a toast after its duration', () => {
    act(() => {
      useToastStore.getState().addToast({ message: 'Temporary', duration: 3000 });
    });
    render(<Toaster />);
    expect(screen.getByText('Temporary')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByText('Temporary')).not.toBeInTheDocument();
  });

  it('keeps a toast with duration 0 until dismissed manually', () => {
    act(() => {
      useToastStore.getState().addToast({ message: 'Sticky', duration: 0 });
    });
    render(<Toaster />);
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(screen.getByText('Sticky')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByText('Sticky')).not.toBeInTheDocument();
  });
});
