import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AiResult, ResumeData } from '@resume-forge/core';
import type { TailoringResult } from '@resume-forge/core';

/**
 * Component tests for the tailoring panel (Req 4.3-4.7, 1.5).
 *
 * The AI layer is mocked so no network runs: `tailorResume` is stubbed and
 * `getAiClient` (the proxy client) is a no-op. We assert:
 *  - submit tailors the BASE resume data and renders matchScore + gaps;
 *  - the diff view renders original vs tailored and revert/tweak update state;
 *  - saving adds a tailored version via addVersion with tailoring metadata and
 *    leaves the base version untouched;
 *  - an `auth` result (not signed in) opens the auth modal.
 */

const tailorResume = vi.fn();
const getAiClient = vi.fn(() => ({ send: vi.fn() }));

vi.mock('@resume-forge/core', async () => {
  const actual = await vi.importActual<typeof import('@resume-forge/core')>(
    '@resume-forge/core',
  );
  return {
    ...actual,
    tailorResume: (client: unknown, resume: ResumeData, jd: string) =>
      tailorResume(client, resume, jd),
  };
});

vi.mock('../../lib/aiClient', () => ({
  getAiClient: () => getAiClient(),
}));

import { TailoringPanel } from './TailoringPanel';
import { useAuthStore } from '../auth';
import { useResumeStore, createBaseVersion } from '../../store/resumeStore';

const baseData: ResumeData = {
  personalInfo: { name: 'Ada Lovelace', email: '', phone: '', location: 'London' },
  summary: 'Pioneering programmer.',
  experience: [
    {
      id: 'exp-1',
      company: 'Analytical Engines',
      title: 'Mathematician',
      location: 'London',
      startDate: '1842',
      endDate: '1843',
      bullets: [{ id: 'b-1', text: 'Original bullet.' }],
    },
  ],
  education: [],
  skills: [],
  projects: [],
  certifications: [],
};

function tailoredResult(): TailoringResult {
  const data: ResumeData = {
    ...baseData,
    experience: [
      {
        ...baseData.experience[0],
        bullets: [{ id: 'b-1', text: 'Tailored bullet.' }],
      },
    ],
  };
  return {
    data,
    matchScore: 82,
    gaps: ['Kubernetes experience', 'Team leadership'],
    changes: [
      {
        path: 'experience.0.bullets.0',
        original: 'Original bullet.',
        tailored: 'Tailored bullet.',
        accepted: false,
      },
    ],
  };
}

function ok(value: TailoringResult): AiResult<TailoringResult> {
  return { ok: true, value };
}

function resetStores() {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
  const base = createBaseVersion(baseData);
  useResumeStore.setState({
    versions: [base],
    activeVersionId: base.id,
    template: useResumeStore.getState().template,
  });
  useAuthStore.setState({ isModalOpen: false });
}

describe('TailoringPanel', () => {
  beforeEach(resetStores);

  it('tailors the base data and renders matchScore + gaps checklist (Req 4.4)', async () => {
    const user = userEvent.setup();
    tailorResume.mockResolvedValue(ok(tailoredResult()));

    render(<TailoringPanel />);

    await user.type(screen.getByLabelText(/job description/i), 'We need a backend engineer.');
    await user.click(screen.getByRole('button', { name: /tailor to this job/i }));

    await waitFor(() => expect(tailorResume).toHaveBeenCalledTimes(1));
    // Called with the BASE resume data (Req 4.5).
    expect(tailorResume).toHaveBeenCalledWith(
      expect.anything(),
      baseData,
      'We need a backend engineer.',
    );
    expect(getAiClient).toHaveBeenCalled();

    expect(await screen.findByText('82/100')).toBeInTheDocument();
    expect(screen.getByText('Kubernetes experience')).toBeInTheDocument();
    expect(screen.getByText('Team leadership')).toBeInTheDocument();
  });

  it('renders the diff and revert updates the composed save (Req 4.6, 4.7)', async () => {
    const user = userEvent.setup();
    tailorResume.mockResolvedValue(ok(tailoredResult()));

    render(<TailoringPanel />);
    await user.type(screen.getByLabelText(/job description/i), 'JD text');
    await user.click(screen.getByRole('button', { name: /tailor to this job/i }));

    // Diff shows original and tailored.
    expect(await screen.findByText('Original bullet.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Tailored bullet.')).toBeInTheDocument();

    // Revert this change, then save.
    await user.click(screen.getByRole('button', { name: /^revert$/i }));
    await user.click(screen.getByRole('button', { name: /save tailored version/i }));

    const state = useResumeStore.getState();
    const tailored = state.versions.find((v) => v.kind === 'tailored');
    expect(tailored).toBeDefined();
    // Reverted → the saved data keeps the original bullet text.
    expect(tailored?.data.experience[0].bullets[0].text).toBe('Original bullet.');
  });

  it('saves a tailored version with metadata without modifying the base (Req 4.5)', async () => {
    const user = userEvent.setup();
    tailorResume.mockResolvedValue(ok(tailoredResult()));

    const baseBefore = JSON.stringify(useResumeStore.getState().getBaseVersion());

    render(<TailoringPanel />);
    await user.type(screen.getByLabelText(/company/i), 'Acme Corp');
    await user.type(screen.getByLabelText(/job description/i), 'JD text');
    await user.click(screen.getByRole('button', { name: /tailor to this job/i }));
    await screen.findByText('82/100');
    await user.click(screen.getByRole('button', { name: /save tailored version/i }));

    const state = useResumeStore.getState();
    expect(state.versions).toHaveLength(2);
    const tailored = state.versions.find((v) => v.kind === 'tailored');
    expect(tailored?.label).toMatch(/^Tailored — Acme Corp \d{4}-\d{2}-\d{2}$/);
    expect(tailored?.tailoring?.company).toBe('Acme Corp');
    expect(tailored?.tailoring?.matchScore).toBe(82);
    expect(tailored?.tailoring?.gaps).toEqual([
      'Kubernetes experience',
      'Team leadership',
    ]);
    // Kept tailored bullet (accepted by default).
    expect(tailored?.data.experience[0].bullets[0].text).toBe('Tailored bullet.');

    // Base is byte-identical (Req 4.5 / Property 5).
    const baseAfter = JSON.stringify(state.getBaseVersion());
    expect(baseAfter).toBe(baseBefore);
  });

  it('opens the auth modal when the AI call returns an auth error (not signed in)', async () => {
    const user = userEvent.setup();
    tailorResume.mockResolvedValue({
      ok: false,
      error: 'auth',
      message: 'Please sign in to use AI features.',
    });

    render(<TailoringPanel />);

    await user.type(screen.getByLabelText(/job description/i), 'JD text');
    await user.click(screen.getByRole('button', { name: /tailor to this job/i }));

    await waitFor(() => expect(useAuthStore.getState().isModalOpen).toBe(true));
  });
});
