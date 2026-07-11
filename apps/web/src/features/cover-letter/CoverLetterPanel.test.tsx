import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AiResult, ResumeData } from '@resume-forge/core';

/**
 * Component tests for the cover letter panel (Req 5.1-5.4, 1.5).
 *
 * The AI layer and heavy export libs are mocked so no network / no PDF engine
 * runs. We assert:
 *  - generating shows the editable letter, calls generateCoverLetter with the
 *    active resume data + JD + selected tone;
 *  - the tone selector influences the generation call (Req 5.2);
 *  - editing the textarea updates the letter (Req 5.3);
 *  - an `auth` result opens the auth modal without producing output;
 *  - cover-letter export runs through the gate and invokes the pdf/docx
 *    generators when allowed (Req 5.4).
 */

const generateCoverLetter = vi.fn();
const getAiClient = vi.fn(() => ({ send: vi.fn() }));

vi.mock('@resume-forge/core', async () => {
  const actual = await vi.importActual<typeof import('@resume-forge/core')>(
    '@resume-forge/core',
  );
  return {
    ...actual,
    generateCoverLetter: (client: unknown, resume: ResumeData, jd: string, tone: string) =>
      generateCoverLetter(client, resume, jd, tone),
  };
});

vi.mock('../../lib/aiClient', () => ({
  getAiClient: () => getAiClient(),
}));

const attemptDownload = vi.fn();
const exportCoverLetterPdf = vi.fn();
const exportCoverLetterDocx = vi.fn();
const triggerBlobDownload = vi.fn();

vi.mock('../download', () => ({
  attemptDownload: (...args: unknown[]) => attemptDownload(...args),
}));
vi.mock('./coverLetterPdf', () => ({
  exportCoverLetterPdf: (...args: unknown[]) => exportCoverLetterPdf(...args),
}));
vi.mock('./coverLetterDocx', () => ({
  exportCoverLetterDocx: (...args: unknown[]) => exportCoverLetterDocx(...args),
}));
vi.mock('../export', () => ({
  triggerBlobDownload: (...args: unknown[]) => triggerBlobDownload(...args),
  slugify: (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''),
}));

import { CoverLetterPanel } from './CoverLetterPanel';
import { useCoverLetterStore } from './coverLetterStore';
import { useAuthStore } from '../auth';
import { useResumeStore, createBaseVersion } from '../../store/resumeStore';

const baseData: ResumeData = {
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

const LETTER = 'Dear Hiring Manager,\n\nI am excited to apply.\n\nSincerely,\nAda';

function ok(value: string): AiResult<string> {
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
  useCoverLetterStore.setState({ letter: '', tone: 'formal', jd: '' });
  exportCoverLetterPdf.mockResolvedValue(new Blob(['pdf']));
  exportCoverLetterDocx.mockResolvedValue(new Blob(['docx']));
}

describe('CoverLetterPanel', () => {
  beforeEach(resetStores);

  it('generates and shows an editable letter using resume data + JD + tone (Req 5.1)', async () => {
    const user = userEvent.setup();
    generateCoverLetter.mockResolvedValue(ok(LETTER));

    render(<CoverLetterPanel />);

    await user.type(screen.getByLabelText(/job description/i), 'We need a programmer.');
    await user.click(screen.getByRole('button', { name: /generate cover letter/i }));

    await waitFor(() => expect(generateCoverLetter).toHaveBeenCalledTimes(1));
    expect(generateCoverLetter).toHaveBeenCalledWith(
      expect.anything(),
      baseData,
      'We need a programmer.',
      'formal',
    );

    // Editable textarea populated with the letter (Req 5.3).
    expect(await screen.findByDisplayValue(/I am excited to apply/)).toBeInTheDocument();
  });

  it('lets the tone selector influence generation (Req 5.2)', async () => {
    const user = userEvent.setup();
    generateCoverLetter.mockResolvedValue(ok(LETTER));

    render(<CoverLetterPanel />);

    await user.selectOptions(screen.getByLabelText(/tone/i), 'enthusiastic_student');
    await user.type(screen.getByLabelText(/job description/i), 'JD text');
    await user.click(screen.getByRole('button', { name: /generate cover letter/i }));

    await waitFor(() => expect(generateCoverLetter).toHaveBeenCalledTimes(1));
    expect(generateCoverLetter).toHaveBeenCalledWith(
      expect.anything(),
      baseData,
      'JD text',
      'enthusiastic_student',
    );
  });

  it('persists edits to the letter in the store (Req 5.3)', async () => {
    const user = userEvent.setup();
    useCoverLetterStore.setState({ letter: LETTER, tone: 'formal', jd: 'JD' });

    render(<CoverLetterPanel />);

    const textarea = screen.getByLabelText(/your cover letter/i);
    // Append text; the edit flows into the persisted store (Req 5.3).
    await user.type(textarea, ' Edited!');

    expect(useCoverLetterStore.getState().letter).toBe(`${LETTER} Edited!`);
  });

  it('opens the auth modal when generation returns an auth error (not signed in)', async () => {
    const user = userEvent.setup();
    generateCoverLetter.mockResolvedValue({
      ok: false,
      error: 'auth',
      message: 'Please sign in to use AI features.',
    });

    render(<CoverLetterPanel />);

    await user.type(screen.getByLabelText(/job description/i), 'JD text');
    await user.click(screen.getByRole('button', { name: /generate cover letter/i }));

    await waitFor(() => expect(useAuthStore.getState().isModalOpen).toBe(true));
  });

  it('exports the cover letter as PDF through the gate when allowed (Req 5.4)', async () => {
    const user = userEvent.setup();
    useCoverLetterStore.setState({ letter: LETTER, tone: 'formal', jd: 'JD' });
    attemptDownload.mockResolvedValue({ status: 'allowed', reason: 'free' });

    render(<CoverLetterPanel />);

    await user.click(screen.getByRole('button', { name: /download pdf/i }));

    await waitFor(() => expect(attemptDownload).toHaveBeenCalledTimes(1));
    expect(exportCoverLetterPdf).toHaveBeenCalledTimes(1);
    expect(triggerBlobDownload).toHaveBeenCalledTimes(1);
    expect(exportCoverLetterDocx).not.toHaveBeenCalled();
  });

  it('exports the cover letter as DOCX through the gate when allowed (Req 5.4)', async () => {
    const user = userEvent.setup();
    useCoverLetterStore.setState({ letter: LETTER, tone: 'formal', jd: 'JD' });
    attemptDownload.mockResolvedValue({ status: 'allowed', reason: 'credit' });

    render(<CoverLetterPanel />);

    await user.click(screen.getByRole('button', { name: /download docx/i }));

    await waitFor(() => expect(exportCoverLetterDocx).toHaveBeenCalledTimes(1));
    expect(triggerBlobDownload).toHaveBeenCalledTimes(1);
    expect(exportCoverLetterPdf).not.toHaveBeenCalled();
  });

  it('fires the payment hook and produces no file when payment is required (Req 5.4)', async () => {
    const user = userEvent.setup();
    useCoverLetterStore.setState({ letter: LETTER, tone: 'formal', jd: 'JD' });
    attemptDownload.mockResolvedValue({ status: 'payment_required', productId: 'p1' });
    const onPaymentRequired = vi.fn();

    render(<CoverLetterPanel onPaymentRequired={onPaymentRequired} />);

    await user.click(screen.getByRole('button', { name: /download pdf/i }));

    await waitFor(() => expect(onPaymentRequired).toHaveBeenCalledWith('p1'));
    expect(exportCoverLetterPdf).not.toHaveBeenCalled();
    expect(triggerBlobDownload).not.toHaveBeenCalled();
  });
});
