import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AiResult, ResumeData } from '@resume-forge/core';

/**
 * Component tests for the existing-resume import UI (Req 2.5).
 *
 * Both the AI layer and the PDF extractor are mocked so no network/worker runs:
 *  - `extractResume` is stubbed and `getAiClient` (the proxy client) is a no-op.
 *  - `./pdfText`'s `extractPdfText` is stubbed to succeed or throw a
 *    `PdfTextError`, exercising the manual-paste fallback.
 *
 * We assert that pasted text runs extraction and populates the store, and that
 * a PDF extraction failure shows the manual-paste fallback message.
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

const { extractPdfText, MockPdfTextError } = vi.hoisted(() => {
  // Provide a real PdfTextError-like class so `instanceof` checks in the UI work.
  class MockPdfTextError extends Error {
    kind: string;
    constructor(kind: string, message: string) {
      super(message);
      this.name = 'PdfTextError';
      this.kind = kind;
    }
  }
  return { extractPdfText: vi.fn(), MockPdfTextError };
});

vi.mock('./pdfText', () => ({
  extractPdfText: (input: unknown) => extractPdfText(input),
  PdfTextError: MockPdfTextError,
}));

import { ResumeImport } from './ResumeImport';
import { useAuthStore } from '../auth';
import { useResumeStore, createBaseVersion } from '../../store/resumeStore';

const sampleData: ResumeData = {
  personalInfo: { name: 'Grace Hopper', email: 'grace@example.com', phone: '', location: 'Arlington' },
  summary: 'Computer scientist.',
  experience: [
    {
      id: 'exp-1',
      company: 'US Navy',
      title: 'Rear Admiral',
      location: 'Arlington',
      startDate: '1943',
      endDate: '1986',
      bullets: [{ id: 'b-1', text: 'Developed the first compiler.' }],
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

describe('ResumeImport', () => {
  beforeEach(resetStores);

  it('renders paste-text and PDF upload entry points (Req 2.5)', () => {
    render(<ResumeImport />);
    expect(screen.getByRole('heading', { name: /import an existing resume/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByLabelText(/upload a pdf/i)).toBeInTheDocument();
  });

  it('runs extraction on pasted text and populates the store (Req 2.5)', async () => {
    const user = userEvent.setup();
    extractResume.mockResolvedValue(ok(sampleData));
    const onExtracted = vi.fn();

    render(<ResumeImport onExtracted={onExtracted} />);

    await user.type(screen.getByRole('textbox'), 'Grace Hopper — US Navy — first compiler.');
    await user.click(screen.getByRole('button', { name: /import resume/i }));

    await waitFor(() => expect(extractResume).toHaveBeenCalledTimes(1));
    expect(getAiClient).toHaveBeenCalled();
    await waitFor(() =>
      expect(useResumeStore.getState().getActiveResumeData().personalInfo.name).toBe(
        'Grace Hopper',
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

    render(<ResumeImport />);

    await user.type(screen.getByRole('textbox'), 'Some resume text.');
    await user.click(screen.getByRole('button', { name: /import resume/i }));

    await waitFor(() => expect(useAuthStore.getState().isModalOpen).toBe(true));
  });

  it('fills the textarea with extracted PDF text on success (Req 2.5)', async () => {
    const user = userEvent.setup();
    extractPdfText.mockResolvedValue('Extracted resume text from PDF.');

    render(<ResumeImport />);

    const file = new File([new Uint8Array([1, 2, 3])], 'resume.pdf', {
      type: 'application/pdf',
    });
    await user.upload(screen.getByLabelText(/upload a pdf/i), file);

    await waitFor(() =>
      expect(screen.getByRole('textbox')).toHaveValue('Extracted resume text from PDF.'),
    );
    expect(extractPdfText).toHaveBeenCalledTimes(1);
  });

  it('shows the manual-paste fallback when PDF extraction fails (Req 2.5)', async () => {
    const user = userEvent.setup();
    extractPdfText.mockRejectedValue(
      new MockPdfTextError('no_text', "This PDF doesn't contain selectable text (it may be a scan). Paste your resume text instead."),
    );

    render(<ResumeImport />);

    const file = new File([new Uint8Array([1, 2, 3])], 'scan.pdf', {
      type: 'application/pdf',
    });
    await user.upload(screen.getByLabelText(/upload a pdf/i), file);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/paste your resume text instead/i);
    // Extraction pipeline was not invoked by the failed PDF read.
    expect(extractResume).not.toHaveBeenCalled();
  });
});
