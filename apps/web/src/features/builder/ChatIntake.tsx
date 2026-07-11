import { useState } from 'react';
import { extractResume, type AiErrorKind } from '@resume-forge/core';
import { getAiClient } from '../../lib/aiClient';
import { useAuthStore } from '../auth';
import { useResumeStore } from '../../store/resumeStore';
import { Alert, ButtonSpinner } from '../../components';

/**
 * Chat-like natural-language intake (Req 2.1, 2.3, 2.8).
 *
 * Presents a friendly, conversational prompt and a large freeform textarea
 * inviting the user to describe their work experience, education, and skills
 * "like you're talking to a friend" (Req 2.1). On submit it:
 *
 *  1. builds the proxy-backed AI client (no per-user key) and runs
 *     {@link extractResume}; AI calls require a signed-in Supabase session,
 *     which the edge function enforces;
 *  2. if the AI call fails with `auth` (not signed in), opens the auth modal so
 *     the user can sign in and retry;
 *  3. shows a pending indicator while extracting (basic loading state — full
 *     loading/empty/error polish is Task 14);
 *  4. on success loads the structured data into the active resume version and
 *     reveals the editable form (Req 2.3);
 *  5. on a `parse`/other error shows a recoverable inline message and keeps any
 *     existing structured data (Req 2.7).
 *
 * The natural-language step is a starting point only: after extraction the
 * editable form is the source of truth (Req 2.8). Re-running intake offers to
 * replace the current data rather than silently overwriting it.
 */

/** Map a typed AI error to friendly, non-technical copy (basic; Task 14 polishes). */
function messageForError(error: AiErrorKind, fallback: string): string {
  switch (error) {
    case 'no_key':
    case 'auth':
      return 'Please sign in to build your resume.';
    case 'rate_limit':
      return 'The AI service is busy right now. Wait a moment and try again.';
    case 'network':
      return 'Could not reach the AI service. Check your connection and try again.';
    case 'parse':
    default:
      return fallback;
  }
}

export interface ChatIntakeProps {
  /**
   * Whether the active resume already has structured content. When true the
   * intake acts as a "replace" flow and warns before overwriting (Req 2.8).
   */
  hasExistingData?: boolean;
  /** Called after a successful extraction so the parent can reveal the form. */
  onExtracted?: () => void;
}

export function ChatIntake({ hasExistingData = false, onExtracted }: ChatIntakeProps) {
  const updateActiveResumeData = useResumeStore((s) => s.updateActiveResumeData);

  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = text.trim();
  const canSubmit = trimmed.length > 0 && !pending;

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
        // Req 2.7: recoverable error; existing structured data is preserved
        // because we only replace it on success.
        setError(messageForError(result.error, result.message));
        return;
      }

      // Req 2.3 / 2.8: load structured data into the active version and reveal
      // the editable form, which becomes the source of truth afterwards.
      updateActiveResumeData(() => result.value);
      onExtracted?.();
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="space-y-4" aria-labelledby="intake-title">
      <div className="space-y-2">
        <h2 id="intake-title" className="text-xl font-semibold text-slate-900">
          {hasExistingData ? 'Start over from a new description' : "Let's build your resume"}
        </h2>
        <p className="text-slate-600">
          Tell me about your work experience, education, and skills — just write
          it out like you're talking to a friend. No need for perfect formatting;
          I'll organize it into a resume you can edit.
        </p>
      </div>

      <label htmlFor="intake-text" className="sr-only">
        Describe your background
      </label>
      <textarea
        id="intake-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={pending}
        rows={10}
        placeholder="e.g. I worked at Acme for 3 years as a backend engineer where I built their payments service and led a team of 4. Before that I studied computer science at State University..."
        className="w-full resize-y rounded-lg border border-slate-300 p-4 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50"
      />

      {hasExistingData && (
        <p className="text-sm text-amber-700">
          Building again will replace your current resume content. Your edits so
          far are the source of truth until you replace them.
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
          {pending ? 'Building…' : hasExistingData ? 'Rebuild my resume' : 'Build my resume'}
        </button>
        {pending && (
          <span className="text-sm text-slate-500" role="status">
            Reading your background and organizing it…
          </span>
        )}
      </div>
    </section>
  );
}
