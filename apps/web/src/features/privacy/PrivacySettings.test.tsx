import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Component tests for the PrivacySettings panel (Task 15, Req 12.3, 12.4).
 *
 * The privacy data layer is mocked so we assert wiring only: the Export button
 * triggers exportMyData, and Delete requires a confirmation step before
 * calling deleteAllMyData (Req 12.4).
 */

const exportMyData = vi.fn();
const deleteAllMyData = vi.fn();
vi.mock('./privacyData', () => ({
  exportMyData: (...args: unknown[]) => exportMyData(...args),
  deleteAllMyData: (...args: unknown[]) => deleteAllMyData(...args),
}));

vi.mock('./cloudSync', () => ({
  isCloudSyncEnabled: () => false,
  setCloudSyncEnabled: vi.fn(),
  syncResumeToCloud: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
}));

vi.mock('../../lib/supabase', () => ({ isSupabaseConfigured: true }));

vi.mock('../auth', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector({ user: null }),
}));

import { PrivacySettings } from './PrivacySettings';

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PrivacySettings', () => {
  it('renders the privacy explainer and controls', () => {
    render(<PrivacySettings />);
    expect(screen.getByText(/your resume stays in your browser/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export my data/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete all my data/i })).toBeInTheDocument();
  });

  it('triggers exportMyData when Export is clicked (Req 12.3)', async () => {
    const user = userEvent.setup();
    render(<PrivacySettings />);
    await user.click(screen.getByRole('button', { name: /export my data/i }));
    expect(exportMyData).toHaveBeenCalledTimes(1);
  });

  it('requires confirmation before deleting (Req 12.4)', async () => {
    const user = userEvent.setup();
    render(<PrivacySettings />);

    // First click reveals the confirmation, does not delete yet.
    await user.click(screen.getByRole('button', { name: /delete all my data/i }));
    expect(deleteAllMyData).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /confirm delete/i }));
    expect(deleteAllMyData).toHaveBeenCalledTimes(1);
  });
});
