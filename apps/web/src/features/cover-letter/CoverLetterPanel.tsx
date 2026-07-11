import { useState } from 'react';
import {
  generateCoverLetter,
  type AiErrorKind,
  type CoverLetterTone,
} from '@resume-forge/core';
import { getAiClient } from '../../lib/aiClient';
import { useAuthStore } from '../auth';
import { useResumeStore } from '../../store/resumeStore';
import { Alert, ButtonSpinner, EmptyState, useToast } from '../../components';
import { styleFromSelection } from '../templates/types';
import { attemptDownload, type GateOutcome } from '../download';
import { useCoverLetterStore } from './coverLetterStore';
import { exportCoverLetterPdf } from './coverLetterPdf';
import { exportCoverLetterDocx } from './coverLetterDocx';
import { triggerBlobDownload } from '../export';
import { slugify } from '../export';

/**
 * Cover letter panel (Req 5.1-5.4).
 *
 * Workflow:
 *  1. The user picks a tone (Formal / Conversational / Enthusiastic-student —
 *     Req 5.2) and provides a JD (prefilled from the active tailored version's
 *     JD when available, else typed here).
 *  2. "Generate cover letter" calls `generateCoverLetter` through the proxy AI
 *     client (requires a signed-in session) against the ACTIVE resume version's
 *     data + JD + tone (Req 5.1). Loading/error states are shown.
 *  3. On success the letter drops into an editable textarea and is persisted in
 *     the cover-letter store (Req 5.3) so edits survive reload.
 *  4. Download PDF / DOCX render the letter in the SAME template family as the
 *     resume (Req 5.4), wired through the same download gate as resume export
 *     (this is the "resume_plus_cover_letter" product concept).
 */

/** Product id gating the cover-letter download. Supplied via env (not hard-coded). */
const COVER_LETTER_PRODUCT_ID =
  import.meta.env.VITE_COVER_LETTER_PRODUCT_ID ?? 'resume_plus_cover_letter';

/** Tone options for the selector (Req 5.2). */
const TONE_OPTIONS: { value: CoverLetterTone; label: string }[] = [
  { value: 'formal', label: 'Formal' },
  { value: 'conversational', label: 'Conversational' },
  { value: 'enthusiastic_student', label: 'Enthusiastic-student' },
];

type ExportFormat = 'pdf' | 'docx';

/** Map a typed AI error to friendly copy. */
function messageForError(error: AiErrorKind, fallback: string): string {
  switch (error) {
    case 'no_key':
    case 'auth':
      return 'Please sign in to generate a cover letter.';
    case 'rate_limit':
      return 'The AI service is busy right now. Wait a moment and try again.';
    case 'network':
      return 'Could not reach the AI service. Check your connection and try again.';
    case 'parse':
    default:
      return fallback;
  }
}

export interface CoverLetterPanelProps {
  /** Invoked when the download gate returns payment_required (Task 10 flow). */
  onPaymentRequired?: (productId: string) => void | Promise<void>;
}

export function CoverLetterPanel({ onPaymentRequired }: CoverLetterPanelProps) {
  const getActiveVersion = useResumeStore((s) => s.getActiveVersion);
  const template = useResumeStore((s) => s.template);

  const letter = useCoverLetterStore((s) => s.letter);
  const tone = useCoverLetterStore((s) => s.tone);
  const jd = useCoverLetterStore((s) => s.jd);
  const setLetter = useCoverLetterStore((s) => s.setLetter);
  const setTone = useCoverLetterStore((s) => s.setTone);
  const setJd = useCoverLetterStore((s) => s.setJd);
  const toast = useToast();

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyFormat, setBusyFormat] = useState<ExportFormat | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  // Prefill the JD from the active tailored version if the user hasn't typed one.
  const activeVersion = getActiveVersion();
  const effectiveJd = jd.trim() || (activeVersion.tailoring?.jobDescription ?? '');
  const canGenerate = effectiveJd.trim().length > 0 && !pending;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setError(null);

    setPending(true);
    try {
      const client = getAiClient();
      const result = await generateCoverLetter(
        client,
        activeVersion.data,
        effectiveJd.trim(),
        tone,
      );
      if (!result.ok) {
        // Not signed in → open the auth modal so the user can sign in and retry.
        if (result.error === 'auth') {
          useAuthStore.getState().openModal();
        }
        const msg = messageForError(result.error, result.message);
        setError(msg);
        toast.error(msg);
        return;
      }
      setLetter(result.value);
      toast.success('Cover letter ready. Edit it freely before exporting.');
    } finally {
      setPending(false);
    }
  };

  const runExport = async (format: ExportFormat) => {
    if (!letter.trim()) return;
    setBusyFormat(format);
    setExportMessage(null);
    try {
      // Req 5.4 + gate: run the download gate BEFORE producing any file.
      const outcome: GateOutcome = await attemptDownload(COVER_LETTER_PRODUCT_ID);

      const produce = async () => {
        const personalInfo = activeVersion.data.personalInfo;
        const blob =
          format === 'pdf'
            ? await exportCoverLetterPdf(
                letter,
                personalInfo,
                template.templateId,
                styleFromSelection(template),
              )
            : await exportCoverLetterDocx(letter, personalInfo);
        const namePart = slugify(personalInfo.name ?? '');
        const base = namePart ? `${namePart}_cover_letter` : 'cover_letter';
        triggerBlobDownload(blob, `${base}.${format}`);
      };

      switch (outcome.status) {
        case 'needs_auth':
          setExportMessage('Please sign in to download.');
          break;
        case 'allowed':
          await produce();
          break;
        case 'unavailable':
          await produce();
          setExportMessage('Download gating is unavailable in this environment.');
          break;
        case 'payment_required':
          await onPaymentRequired?.(outcome.productId);
          setExportMessage('You have used your free downloads. Payment is required.');
          break;
        case 'error':
          setExportMessage(outcome.message);
          break;
      }
    } catch {
      setExportMessage('Something went wrong generating your file. Please try again.');
    } finally {
      setBusyFormat(null);
    }
  };

  const busy = busyFormat !== null;

  return (
    <section className="space-y-4" aria-labelledby="cover-letter-title">
      <div className="space-y-1">
        <h2 id="cover-letter-title" className="text-xl font-semibold text-slate-900">
          Cover letter
        </h2>
        <p className="text-sm text-slate-600">
          Generate a matching cover letter from your resume and a job
          description. Pick a tone, then edit the result freely before exporting
          it in the same template as your resume.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="cover-tone" className="text-sm font-medium text-slate-700">
          Tone
        </label>
        <select
          id="cover-tone"
          value={tone}
          onChange={(e) => setTone(e.target.value as CoverLetterTone)}
          disabled={pending}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50"
        >
          {TONE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="cover-jd" className="text-sm font-medium text-slate-700">
          Job description
        </label>
        <textarea
          id="cover-jd"
          value={jd}
          onChange={(e) => setJd(e.target.value)}
          disabled={pending}
          rows={5}
          placeholder={
            activeVersion.tailoring?.jobDescription
              ? 'Using the job description from your tailored version. Paste a different one to override.'
              : 'Paste the full job description here…'
          }
          className="w-full resize-y rounded-lg border border-slate-300 p-3 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50"
        />
      </div>

      {error && (
        // Req 13.3: non-technical, recoverable message with a retry affordance.
        <Alert variant="error" onRetry={() => void handleGenerate()}>
          {error}
        </Alert>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="inline-flex items-center rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending && <ButtonSpinner />}
          {pending ? 'Generating…' : 'Generate cover letter'}
        </button>
        {pending && (
          <span className="text-sm text-slate-500" role="status">
            Writing your cover letter…
          </span>
        )}
      </div>

      {/* Req 13.2: helpful empty state before a letter has been generated. */}
      {letter.trim().length === 0 && !pending && (
        <EmptyState
          title="No cover letter yet"
          hint="Pick a tone and paste a job description, then generate a matching cover letter from your resume."
        />
      )}

      {letter.trim().length > 0 && (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="cover-letter-text"
              className="text-sm font-medium text-slate-700"
            >
              Your cover letter (editable)
            </label>
            <textarea
              id="cover-letter-text"
              value={letter}
              onChange={(e) => setLetter(e.target.value)}
              rows={14}
              className="w-full resize-y rounded-lg border border-slate-300 p-3 text-sm leading-relaxed shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => void runExport('pdf')}
              disabled={busy}
              className="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {busyFormat === 'pdf' && <ButtonSpinner />}
              {busyFormat === 'pdf' ? 'Generating…' : 'Download PDF'}
            </button>
            <button
              type="button"
              onClick={() => void runExport('docx')}
              disabled={busy}
              className="inline-flex items-center rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {busyFormat === 'docx' && <ButtonSpinner />}
              {busyFormat === 'docx' ? 'Generating…' : 'Download DOCX'}
            </button>
          </div>

          {exportMessage && (
            <p className="text-xs text-slate-500" role="status">
              {exportMessage}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
