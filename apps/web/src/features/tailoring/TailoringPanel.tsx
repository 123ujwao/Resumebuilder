import { useState } from 'react';
import {
  tailorResume,
  type AiErrorKind,
  type BulletChange,
  type ResumeData,
  type ResumeVersion,
} from '@resume-forge/core';
import { getAiClient } from '../../lib/aiClient';
import { useAuthStore } from '../auth';
import { useResumeStore } from '../../store/resumeStore';
import { Alert, ButtonSpinner, useToast } from '../../components';
import {
  applyPendingChanges,
  initPendingChanges,
  resolveFinalChanges,
  type PendingChangeMap,
} from './applyChanges';
import { MatchScoreMeter } from './MatchScoreMeter';
import { GapsChecklist } from './GapsChecklist';
import { DiffView } from './DiffView';
import { tailoredVersionLabel } from './label';

/**
 * JD-based tailoring panel (Req 4.1, 4.3-4.7).
 *
 * Workflow:
 *  1. The user pastes a job description (and optionally a company name for the
 *     saved version label) and clicks "Tailor to this job".
 *  2. the AI call runs through the proxy client (requires a signed-in session);
 *     we always tailor the BASE resume data (`getBaseVersion().data`) so the
 *     base is the source of truth and is never mutated (Req 4.5).
 *  3. On success we show the matchScore (Req 4.4), the gaps checklist (Req 4.4),
 *     a notice if any fabricated details were stripped (Req 4.3 UX), and a diff
 *     view of every changed bullet with per-change accept/tweak/revert controls
 *     (Req 4.6, 4.7).
 *  4. "Save tailored version" composes the final resume from the user's
 *     decisions and stores it as a NEW version alongside the base (Req 4.5).
 *
 * Loading/error handling here is intentionally basic — Task 14 polishes shared
 * UX states.
 */

/** Map a typed AI error to friendly copy (basic; Task 14 polishes). */
function messageForError(error: AiErrorKind, fallback: string): string {
  switch (error) {
    case 'no_key':
    case 'auth':
      return 'Please sign in to tailor your resume.';
    case 'rate_limit':
      return 'The AI service is busy right now. Wait a moment and try again.';
    case 'network':
      return 'Could not reach the AI service. Check your connection and try again.';
    case 'parse':
    default:
      return fallback;
  }
}

/** The in-progress tailoring result being reviewed before saving. */
interface ActiveResult {
  data: ResumeData;
  matchScore: number;
  gaps: string[];
  changes: BulletChange[];
  flaggedFabrications?: string[];
}

export function TailoringPanel() {
  const getBaseVersion = useResumeStore((s) => s.getBaseVersion);
  const addVersion = useResumeStore((s) => s.addVersion);
  const toast = useToast();

  const [jd, setJd] = useState('');
  const [company, setCompany] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ActiveResult | null>(null);
  const [pendingChanges, setPendingChanges] = useState<PendingChangeMap>({});
  const [savedLabel, setSavedLabel] = useState<string | null>(null);

  const trimmedJd = jd.trim();
  const canSubmit = trimmedJd.length > 0 && !pending;

  const handleTailor = async () => {
    if (!canSubmit) return;
    setError(null);
    setSavedLabel(null);

    setPending(true);
    try {
      const client = getAiClient();
      // Req 4.5: always tailor against the immutable BASE resume data.
      const baseData = getBaseVersion().data;
      const tailored = await tailorResume(client, baseData, trimmedJd);

      if (!tailored.ok) {
        // Not signed in → open the auth modal so the user can sign in and retry.
        if (tailored.error === 'auth') {
          useAuthStore.getState().openModal();
        }
        const msg = messageForError(tailored.error, tailored.message);
        setError(msg);
        toast.error(msg);
        setResult(null);
        return;
      }

      setResult(tailored.value);
      setPendingChanges(initPendingChanges(tailored.value.changes));
    } finally {
      setPending(false);
    }
  };

  const handleSave = () => {
    if (!result) return;

    // Compose the final resume from the user's per-change decisions (Req 4.7).
    const finalData = applyPendingChanges(result.data, result.changes, pendingChanges);
    const finalChanges = resolveFinalChanges(result.changes, pendingChanges);

    const trimmedCompany = company.trim();
    const label = tailoredVersionLabel(trimmedCompany, new Date());

    const version: ResumeVersion = {
      id:
        globalThis.crypto?.randomUUID?.() ??
        `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      label,
      kind: 'tailored',
      data: finalData,
      createdAt: new Date().toISOString(),
      tailoring: {
        jobDescription: trimmedJd,
        ...(trimmedCompany ? { company: trimmedCompany } : {}),
        matchScore: result.matchScore,
        gaps: result.gaps,
        changes: finalChanges,
      },
    };

    // Req 4.5: saved as a NEW version alongside the base; addVersion never
    // touches the base version. The new version becomes active.
    addVersion(version);
    setSavedLabel(label);
    toast.success(`Saved "${label}" as a new version.`);
    // Reset the review state; the base is untouched and ready for another JD.
    setResult(null);
    setPendingChanges({});
    setJd('');
    setCompany('');
  };

  return (
    <section className="space-y-4" aria-labelledby="tailoring-title">
      <div className="space-y-1">
        <h2 id="tailoring-title" className="text-xl font-semibold text-slate-900">
          Tailor to a job
        </h2>
        <p className="text-sm text-slate-600">
          Paste a job description and we'll re-order and rephrase your existing
          resume to match it — without inventing anything. Your base resume is
          never changed; the result is saved as a new version.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="tailor-company" className="text-sm font-medium text-slate-700">
            Company (optional)
          </label>
          <input
            id="tailor-company"
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            disabled={pending}
            placeholder="e.g. Acme Corp"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="tailor-jd" className="text-sm font-medium text-slate-700">
            Job description
          </label>
          <textarea
            id="tailor-jd"
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            disabled={pending}
            rows={6}
            placeholder="Paste the full job description here…"
            className="w-full resize-y rounded-lg border border-slate-300 p-3 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50"
          />
        </div>
      </div>

      {error && (
        // Req 13.3: non-technical, recoverable message with a retry affordance.
        <Alert variant="error" onRetry={() => void handleTailor()}>
          {error}
        </Alert>
      )}

      {savedLabel && (
        <Alert variant="success">
          Saved "{savedLabel}" as a new version. Your base resume is unchanged.
        </Alert>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleTailor}
          disabled={!canSubmit}
          className="inline-flex items-center rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending && <ButtonSpinner />}
          {pending ? 'Tailoring…' : 'Tailor to this job'}
        </button>
        {pending && (
          <span className="text-sm text-slate-500" role="status">
            Matching your experience to the job…
          </span>
        )}
      </div>

      {result && (
        <div className="space-y-5 rounded-lg border border-slate-200 bg-white p-4">
          <MatchScoreMeter score={result.matchScore} />

          {result.flaggedFabrications && result.flaggedFabrications.length > 0 && (
            <div
              role="status"
              className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
            >
              <p className="font-medium">
                Some invented details were removed to keep your resume truthful.
              </p>
              <ul className="mt-1 list-disc pl-5">
                {result.flaggedFabrications.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          )}

          <GapsChecklist gaps={result.gaps} />

          <DiffView
            changes={result.changes}
            pending={pendingChanges}
            onChange={setPendingChanges}
          />

          <div className="flex items-center gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={handleSave}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Save tailored version
            </button>
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setPendingChanges({});
              }}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
