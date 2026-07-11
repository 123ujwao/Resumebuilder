import { useRef, useState } from 'react';
import { extractResume, type AiErrorKind } from '@resume-forge/core';
import { getAiClient } from '../../lib/aiClient';
import { useAuthStore } from '../auth';
import { useResumeStore } from '../../store/resumeStore';
import { Alert, ButtonSpinner } from '../../components';
import { extractPdfText, PdfTextError } from './pdfText';

/**
 * Import an existing resume (Req 2.5).
 *
 * An alternative entry point to {@link ChatIntake}: instead of describing their
 * background from scratch, the user can start from a resume they already have by
 * either
 *
 *  (a) pasting the resume text into a textarea, or
 *  (b) uploading / dropping a PDF whose text is extracted client-side via
 *      {@link extractPdfText} (pdf.js — nothing leaves the browser).
 *
 * Both paths converge on the exact same flow as ChatIntake: build the proxy AI
 * client → run {@link extractResume} → populate the active resume version on
 * success (Req 2.5). PDF text is dropped into the same textarea so the user can
 * review/edit it before extracting.
 *
 * If PDF extraction fails (scanned/encrypted/no text layer) we show a clear
 * message telling the user to paste their resume text instead — the manual
 * paste fallback (Req 2.5). Extraction (AI) errors are shown inline and are
 * recoverable; existing structured data is only replaced on success (Req 2.7).
 */

/** Map a typed AI error to friendly, non-technical copy (basic; Task 14 polishes). */
function messageForError(error: AiErrorKind, fallback: string): string {
  switch (error) {
    case 'no_key':
    case 'auth':
      return 'Please sign in to import your resume.';
    case 'rate_limit':
      return 'The AI service is busy right now. Wait a moment and try again.';
    case 'network':
      return 'Could not reach the AI service. Check your connection and try again.';
    case 'parse':
    default:
      return fallback;
  }
}

export interface ResumeImportProps {
  /** Whether the active resume already has structured content (Req 2.8 warning). */
  hasExistingData?: boolean;
  /** Called after a successful extraction so the parent can reveal the form. */
  onExtracted?: () => void;
}

export function ResumeImport({ hasExistingData = false, onExtracted }: ResumeImportProps) {
  const updateActiveResumeData = useResumeStore((s) => s.updateActiveResumeData);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [parsingPdf, setParsingPdf] = useState(false);
  const [pdfName, setPdfName] = useState<string | null>(null);
  /** Manual-paste fallback message shown when PDF extraction fails (Req 2.5). */
  const [pdfFallback, setPdfFallback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trimmed = text.trim();
  const busy = pending || parsingPdf;
  const canSubmit = trimmed.length > 0 && !busy;

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;
    setError(null);
    setPdfFallback(null);
    setPdfName(file.name);
    setParsingPdf(true);
    try {
      const extracted = await extractPdfText(file);
      // Drop the extracted text into the textarea so the user can review/edit
      // before running the shared extraction pipeline (Req 2.5).
      setText(extracted);
    } catch (err) {
      // Fall back to manual paste with a clear message (Req 2.5).
      setPdfName(null);
      setPdfFallback(
        err instanceof PdfTextError
          ? err.message
          : "We couldn't read that PDF. Paste your resume text instead.",
      );
    } finally {
      setParsingPdf(false);
      // Reset the input so selecting the same file again re-triggers change.
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError(null);

    setPending(true);
    try {
      const client = getAiClient();
      const result = await extractResume(client, trimmed);

      if (!result.ok) {
        // Not signed in → open the auth modal so the user can sign in and retry.
        if (result.error === 'auth') {
          useAuthStore.getState().openModal();
        }
        // Req 2.7: recoverable error; existing data preserved (only replaced on success).
        setError(messageForError(result.error, result.message));
        return;
      }

      updateActiveResumeData(() => result.value);
      onExtracted?.();
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="space-y-4" aria-labelledby="import-title">
      <div className="space-y-2">
        <h2 id="import-title" className="text-xl font-semibold text-slate-900">
          Import an existing resume
        </h2>
        <p className="text-slate-600">
          Already have a resume? Paste its text below, or upload a PDF and we'll
          pull the text out for you. We'll organize it into an editable resume —
          everything stays in your browser.
        </p>
      </div>

      {/* PDF upload */}
      <div className="space-y-2">
        <label
          htmlFor="import-pdf"
          className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {parsingPdf ? 'Reading PDF…' : 'Upload a PDF'}
        </label>
        <input
          ref={fileInputRef}
          id="import-pdf"
          type="file"
          accept="application/pdf,.pdf"
          disabled={busy}
          onChange={(e) => void handleFile(e.target.files?.[0])}
          className="sr-only"
        />
        {parsingPdf && (
          <p className="flex items-center gap-2 text-sm text-slate-500" role="status">
            <ButtonSpinner className="mr-0" />
            Reading your PDF…
          </p>
        )}
        {pdfName && !pdfFallback && !parsingPdf && (
          <p className="text-sm text-slate-500" role="status">
            Loaded text from <span className="font-medium">{pdfName}</span>. Review
            it below, then import.
          </p>
        )}
        {pdfFallback && (
          // Req 2.5 fallback: friendly, recoverable guidance to paste instead.
          <Alert variant="warning">{pdfFallback}</Alert>
        )}
      </div>

      <label htmlFor="import-text" className="sr-only">
        Paste your existing resume text
      </label>
      <textarea
        id="import-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={busy}
        rows={12}
        placeholder="Paste the full text of your existing resume here…"
        className="w-full resize-y rounded-lg border border-slate-300 p-4 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50"
      />

      {hasExistingData && (
        <p className="text-sm text-amber-700">
          Importing will replace your current resume content. Your edits so far
          are the source of truth until you replace them.
        </p>
      )}

      {error && (
        // Req 13.3: non-technical, recoverable message with a retry affordance.
        <Alert variant="error" onRetry={() => void handleSubmit()}>
          {error}
        </Alert>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="inline-flex items-center rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending && <ButtonSpinner />}
          {pending ? 'Importing…' : 'Import resume'}
        </button>
        {pending && (
          <span className="text-sm text-slate-500" role="status">
            Organizing your resume…
          </span>
        )}
      </div>
    </section>
  );
}
