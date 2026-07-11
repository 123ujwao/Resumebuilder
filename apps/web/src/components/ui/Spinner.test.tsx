import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Spinner, LoadingState, ButtonSpinner } from './Spinner';

/**
 * Tests for the shared loading primitives (Req 13.1).
 *
 * The key contract is accessibility: LoadingState must expose `role="status"`
 * with its label, while the bare spinners stay decorative (aria-hidden) so they
 * don't double-announce.
 */
describe('Spinner primitives', () => {
  afterEach(cleanup);

  it('renders a decorative Spinner (aria-hidden)', () => {
    render(<Spinner />);
    const spinner = screen.getByTestId('spinner');
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveAttribute('aria-hidden', 'true');
  });

  it('LoadingState renders an accessible status region with its label', () => {
    render(<LoadingState label="Tailoring…" />);
    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
    expect(status).toHaveTextContent('Tailoring…');
  });

  it('LoadingState renders an optional hint', () => {
    render(<LoadingState label="Working" hint="This may take a moment" />);
    expect(screen.getByText('This may take a moment')).toBeInTheDocument();
  });

  it('ButtonSpinner is decorative', () => {
    render(<ButtonSpinner />);
    expect(screen.getByTestId('button-spinner')).toHaveAttribute('aria-hidden', 'true');
  });
});
