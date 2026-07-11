import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { EmptyState } from './EmptyState';

/**
 * Tests for the shared empty-state primitive (Req 13.2).
 */
describe('EmptyState', () => {
  afterEach(cleanup);

  it('renders the title, hint, and action', () => {
    render(
      <EmptyState
        title="No cover letter yet"
        hint="Generate one from your resume."
        action={<button type="button">Generate</button>}
      />,
    );
    expect(screen.getByText('No cover letter yet')).toBeInTheDocument();
    expect(screen.getByText('Generate one from your resume.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate' })).toBeInTheDocument();
  });

  it('renders without an optional hint or action', () => {
    render(<EmptyState title="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders an icon slot when provided', () => {
    render(<EmptyState title="Empty" icon={<span data-testid="empty-icon">★</span>} />);
    expect(screen.getByTestId('empty-icon')).toBeInTheDocument();
  });
});
