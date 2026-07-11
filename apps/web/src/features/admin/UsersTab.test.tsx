import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Tests for the admin Users tab (Task 11.2, Req 10.3, 10.4).
 *
 * The adminData module is mocked so we control the data and assert the RPC
 * call. We verify:
 *  - users render with email, last login, free-download count, and credits per
 *    product (Req 10.3),
 *  - search filters the table by email (Req 10.3),
 *  - toggling is_free_forever calls setFreeForever and reflects the change
 *    (Req 10.4).
 */

const listUsers = vi.fn();
const setFreeForever = vi.fn();

vi.mock('./adminData', () => ({
  listUsers: (...args: unknown[]) => listUsers(...args),
  setFreeForever: (...args: unknown[]) => setFreeForever(...args),
}));

const { UsersTab } = await import('./UsersTab');

const PRODUCTS = [
  { id: 'p1', name: 'resume_only' },
  { id: 'p2', name: 'resume_plus_cover_letter' },
];

const USERS = [
  {
    id: 'u1',
    email: 'alice@example.com',
    last_login_at: '2026-01-01T00:00:00Z',
    free_downloads_used: 1,
    is_free_forever: false,
    creditsByProduct: { p1: 3, p2: 1 },
  },
  {
    id: 'u2',
    email: 'bob@other.com',
    last_login_at: null,
    free_downloads_used: 5,
    is_free_forever: true,
    creditsByProduct: { p1: 0 },
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  listUsers.mockResolvedValue({ products: PRODUCTS, users: USERS });
  setFreeForever.mockResolvedValue(undefined);
});

describe('UsersTab (Req 10.3)', () => {
  it('renders users with email, last login, capped free downloads, and credits', async () => {
    render(<UsersTab />);

    expect(await screen.findByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('bob@other.com')).toBeInTheDocument();

    // Free-download count is capped at 2 in the display (bob's raw 5 -> 2 / 2).
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByText('2 / 2')).toBeInTheDocument();

    // Never logged in shows "Never".
    expect(screen.getByText('Never')).toBeInTheDocument();

    // Credits per product appear (alice p1=3, p2=1; bob p1=0, p2 missing => 0).
    const aliceRow = screen.getByText('alice@example.com').closest('tr')!;
    expect(within(aliceRow).getByText('3')).toBeInTheDocument();
    expect(within(aliceRow).getByText('1')).toBeInTheDocument();
  });

  it('filters the table by email substring', async () => {
    const user = userEvent.setup();
    render(<UsersTab />);

    await screen.findByText('alice@example.com');

    const search = screen.getByLabelText('Search users by email');
    await user.type(search, 'alice');

    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.queryByText('bob@other.com')).not.toBeInTheDocument();
  });

  it('shows an empty state when no users match the search', async () => {
    const user = userEvent.setup();
    render(<UsersTab />);

    await screen.findByText('alice@example.com');
    await user.type(
      screen.getByLabelText('Search users by email'),
      'nomatch',
    );

    expect(screen.getByText(/no users match your search/i)).toBeInTheDocument();
  });
});

describe('UsersTab is_free_forever toggle (Req 10.4)', () => {
  it('calls setFreeForever and reflects the change optimistically', async () => {
    const user = userEvent.setup();
    render(<UsersTab />);

    await screen.findByText('alice@example.com');

    const toggle = screen.getByLabelText(
      'Toggle free forever for alice@example.com',
    ) as HTMLInputElement;
    expect(toggle.checked).toBe(false);

    await user.click(toggle);

    expect(setFreeForever).toHaveBeenCalledWith('u1', true);
    await waitFor(() => expect(toggle.checked).toBe(true));
  });

  it('rolls back the toggle when the RPC fails', async () => {
    setFreeForever.mockRejectedValueOnce(new Error('rls denied'));
    const user = userEvent.setup();
    render(<UsersTab />);

    await screen.findByText('alice@example.com');
    const toggle = screen.getByLabelText(
      'Toggle free forever for alice@example.com',
    ) as HTMLInputElement;

    await user.click(toggle);

    // Error surfaced and the checkbox rolled back to its original state.
    expect(await screen.findByText('rls denied')).toBeInTheDocument();
    await waitFor(() => expect(toggle.checked).toBe(false));
  });
});

describe('UsersTab states', () => {
  it('shows a loading state then the table', async () => {
    render(<UsersTab />);
    expect(screen.getByText(/loading users/i)).toBeInTheDocument();
    await screen.findByText('alice@example.com');
  });

  it('shows an error state when loading fails', async () => {
    listUsers.mockRejectedValueOnce(new Error('Could not load users.'));
    render(<UsersTab />);
    expect(await screen.findByText('Could not load users.')).toBeInTheDocument();
  });
});
