import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AiResult, ResumeData } from '@resume-forge/core';

/**
 * Component tests for the chat-like intake (Req 2.1, 2.3, 2.8).
 *
 * The AI layer is mocked so no network calls happen: `extractResume` is stubbed
 * and `getAiClient` (the proxy client) is a no-op. We assert that submitting
 * runs extraction and populates the store on success, that a not-signed-in
 * (`auth`) result opens the auth modal, and that extraction errors are surfaced
 * without destroying existing data.
 */

const extractResume = vi.fn();
const getAiClient = vi.fn(() => ({ send: vi.fn() }));

vi.mock('@resume-forge/core', async () => {
  const actual = await vi.importActual<typeof import('@resume-forge/core')>(
    '@resume-forge/core',
  );
  return {
    ...actual,
    extractResume: (client: unknown, text: string) => extractResume(client, text),
  };
});

vi.mock('../../lib/aiClient', () => ({
  getAiClient: () => getAiClient(),
}));

import { ChatIntake } from './ChatIntake';
import { useAuthStore } from '../auth';
import { useResumeStore, createBaseVersion } from '../../store/resumeStore';

const sampleData: ResumeData = {
  personalInfo: { name: 'Ada Lovelace', email: 'ada@example.com', phone: '', location: 'London' },
  summary: 'Pioneering programmer.',
  experience: [
    {
      id: 'exp-1',
      company: 'Analytical Engines',
      title: 'Mathematician',
      location: 'London',
      startDate: '1842',
      endDate: '1843',
      bullets: [{ id: 'b-1', text: 'Wrote the first algorithm.' }],
    },
  ],
  education: [],
  skills: [],
  projects: [],
  certifications: [],
};

function ok(value: ResumeData): AiResult<ResumeData> {
  return { ok: true, value };
}

function resetStores() {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
  const base = createBaseVersion();
  useResumeStore.setState({
    versions: [base],
    activeVersionId: base.id,
    template: useResumeStore.getState().template,
  });
  useAuthStore.setState({ isModalOpen: false });
}

describe('ChatIntake', () => {
  beforeEach(resetStores);

  it('renders a friendly freeform prompt and build action (Req 2.1)', () => {
    render(<ChatIntake />);
    expect(screen.getByRole('heading', { name: /build your resume/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /build my resume/i })).toBeInTheDocument();
  });

  it('runs extraction and populates the store on submit (Req 2.3)', async () => {
    const user = userEvent.setup();
    extractResume.mockResolvedValue(ok(sampleData));
    const onExtracted = vi.fn();

    render(<ChatIntake onExtracted={onExtracted} />);

    await user.type(screen.getByRole('textbox'), 'I worked at Analytical Engines.');
    await user.click(screen.getByRole('button', { name: /build my resume/i }));

    await waitFor(() => expect(extractResume).toHaveBeenCalledTimes(1));
    expect(extractResume).toHaveBeenCalledWith(expect.anything(), 'I worked at Analytical Engines.');
    expect(getAiClient).toHaveBeenCalled();

    await waitFor(() =>
      expect(useResumeStore.getState().getActiveResumeData().personalInfo.name).toBe(
        'Ada Lovelace',
      ),
    );
    expect(onExtracted).toHaveBeenCalledTimes(1);
  });

  it('opens the auth modal when the AI call returns an auth error (not signed in)', async () => {
    const user = userEvent.setup();
    extractResume.mockResolvedValue({
      ok: false,
      error: 'auth',
      message: 'Please sign in to use AI features.',
    } satisfies AiResult<ResumeData>);

    render(<ChatIntake />);

    await user.type(screen.getByRole('textbox'), 'Some background text.');
    await user.click(screen.getByRole('button', { name: /build my resume/i }));

    await waitFor(() => expect(useAuthStore.getState().isModalOpen).toBe(true));
    // Data untouched.
    expect(useResumeStore.getState().getActiveResumeData().personalInfo.name).toBe('');
  });

  it('shows a recoverable error and preserves data on parse failure (Req 2.7)', async () => {
    const user = userEvent.setup();
    extractResume.mockResolvedValue({
      ok: false,
      error: 'parse',
      message: 'The AI response did not match the expected resume structure.',
    } satisfies AiResult<ResumeData>);

    render(<ChatIntake />);

    await user.type(screen.getByRole('textbox'), 'Garbled input.');
    await user.click(screen.getByRole('button', { name: /build my resume/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/did not match the expected resume structure/i);
    // Data untouched (still empty base).
    expect(useResumeStore.getState().getActiveResumeData().personalInfo.name).toBe('');
  });
});
