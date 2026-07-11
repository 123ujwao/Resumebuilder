import { describe, expect, it, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Alert } from './Alert';

/**
 * Tests for the shared inline Alert primitive (Req 13.3).
 *
 * Error/warning variants must be announced immediately (role="alert"); the
 * retry affordance must fire its handler so the user can recover.
 */
describe('Alert', () => {
  afterEach(cleanup);

  it('renders an error alert with role="alert" and the message', () => {
    render(<Alert variant="error">Could not reach Anthropic.</Alert>);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Could not reach Anthropic.');
  });

  it('renders success/info variants as a polite status region', () => {
    render(<Alert variant="success">Saved.</Alert>);
    expect(screen.getByRole('status')).toHaveTextContent('Saved.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders a retry affordance that invokes onRetry', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <Alert variant="error" onRetry={onRetry}>
        Something failed.
      </Alert>,
    );
    const retry = screen.getByRole('button', { name: /try again/i });
    await user.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does not render a retry button when onRetry is absent', () => {
    render(<Alert variant="error">Failure.</Alert>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
