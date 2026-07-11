import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ResumeData, ResumeVersion } from '@resume-forge/core';

import { VersionSwitcher } from './VersionSwitcher';
import { useResumeStore, createBaseVersion } from '../../store/resumeStore';

/**
 * Component tests for the version switcher (Req 4.5).
 */

const baseData: ResumeData = {
  personalInfo: { name: 'Ada', email: '', phone: '', location: '' },
  summary: '',
  experience: [],
  education: [],
  skills: [],
  projects: [],
  certifications: [],
};

function tailoredVersion(id: string): ResumeVersion {
  return {
    id,
    label: 'Tailored — Acme 2024-01-01',
    kind: 'tailored',
    data: baseData,
    createdAt: new Date().toISOString(),
    tailoring: { jobDescription: 'JD', matchScore: 75, gaps: [], changes: [] },
  };
}

function reset() {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
  const base = createBaseVersion(baseData);
  useResumeStore.setState({
    versions: [base, tailoredVersion('tailored-1')],
    activeVersionId: base.id,
    template: useResumeStore.getState().template,
  });
}

describe('VersionSwitcher', () => {
  beforeEach(reset);

  it('lists the base and tailored versions with match score', () => {
    render(<VersionSwitcher />);
    expect(screen.getByText('Base Resume')).toBeInTheDocument();
    expect(screen.getByText('Tailored — Acme 2024-01-01')).toBeInTheDocument();
    expect(screen.getByText('Match 75/100')).toBeInTheDocument();
  });

  it('switches the active version on click (Req 4.5)', async () => {
    const user = userEvent.setup();
    render(<VersionSwitcher />);

    await user.click(screen.getByText('Tailored — Acme 2024-01-01'));
    expect(useResumeStore.getState().activeVersionId).toBe('tailored-1');
  });

  it('removes a tailored version but never the base', async () => {
    const user = userEvent.setup();
    render(<VersionSwitcher />);

    await user.click(screen.getByRole('button', { name: /remove tailored/i }));
    const state = useResumeStore.getState();
    expect(state.versions).toHaveLength(1);
    expect(state.versions[0].kind).toBe('base');
    // Base has no remove button.
    expect(screen.queryByRole('button', { name: /remove base/i })).not.toBeInTheDocument();
  });
});
