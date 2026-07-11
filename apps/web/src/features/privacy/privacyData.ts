import {
  useResumeStore,
  RESUME_STATE_STORAGE_KEY,
  type PersistedResumeState,
} from '../../store/resumeStore';
import {
  useCoverLetterStore,
  COVER_LETTER_STORAGE_KEY,
} from '../cover-letter';
import { useApiKeyStore, API_KEY_STORAGE_KEY } from '../api-key';
import { triggerBlobDownload } from '../export';
import type { CoverLetterTone } from '@resume-forge/core';

/**
 * Data privacy controls (Task 15, Req 12.3, 12.4, 12.5, 12.6).
 *
 * ResumeForge keeps all resume content in the browser (`localStorage`) — it is
 * never sent to Supabase (which only holds account metadata, Req 12.6) unless
 * the user explicitly opts into cross-device sync (see {@link ./cloudSync}).
 *
 * This module implements the two user-facing controls:
 *  - {@link exportMyData}   — download all locally-stored resume content as JSON.
 *  - {@link deleteAllMyData} — clear all locally-stored resume content.
 *
 * PRIVACY INVARIANT (Req 12.5): the Anthropic API key is a secret and is NEVER
 * included in the exported payload. It also never leaves this device except to
 * `api.anthropic.com`; it is stored in `localStorage` only (see api-key store)
 * and is never written to Supabase. The export deliberately excludes it.
 */

/** Version stamp so future imports can detect the export schema. */
export const DATA_EXPORT_VERSION = 1 as const;

/** Default filename for the exported data bundle (Req 12.3). */
export const DATA_EXPORT_FILENAME = 'resumeforge-data.json';

/** The locally-stored cover-letter content included in the export. */
export interface ExportedCoverLetter {
  letter: string;
  tone: CoverLetterTone;
  jd: string;
}

/**
 * The shape of the exported data bundle. Contains resume content and the cover
 * letter only — NEVER the Anthropic API key (Req 12.5) and no account metadata
 * (that lives server-side in Supabase, Req 12.6).
 */
export interface DataExportPayload {
  app: 'ResumeForge';
  version: typeof DATA_EXPORT_VERSION;
  exportedAt: string;
  /** Resume versions + active selection + template/style (from resume store). */
  resume: PersistedResumeState;
  /** The locally-stored cover letter, tone, and JD. */
  coverLetter: ExportedCoverLetter;
}

/**
 * Gather all locally-stored resume content into a single, serializable object.
 *
 * Pure and side-effect free (no download): reads the current in-memory store
 * state (which is what gets persisted to `localStorage`). Intentionally omits
 * the API key (Req 12.5).
 */
export function buildDataExportPayload(): DataExportPayload {
  const resumeState = useResumeStore.getState();
  const coverLetter = useCoverLetterStore.getState();

  return {
    app: 'ResumeForge',
    version: DATA_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    resume: {
      versions: resumeState.versions,
      activeVersionId: resumeState.activeVersionId,
      template: resumeState.template,
    },
    coverLetter: {
      letter: coverLetter.letter,
      tone: coverLetter.tone,
      jd: coverLetter.jd,
    },
  };
}

/**
 * Export locally-stored resume content as a downloadable JSON file (Req 12.3).
 *
 * Works whether or not Supabase is configured — this reads only local data.
 */
export function exportMyData(filename: string = DATA_EXPORT_FILENAME): void {
  const payload = buildDataExportPayload();
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  triggerBlobDownload(blob, filename);
}

/** Options controlling what {@link deleteAllMyData} removes. */
export interface DeleteDataOptions {
  /**
   * When true, also remove the stored Anthropic API key from `localStorage`.
   * Defaults to false: the key is a device-local credential the user may want
   * to keep even after clearing resume content, so deleting it is opt-in.
   */
  includeApiKey?: boolean;
}

/**
 * Clear all locally-stored resume content (Req 12.4).
 *
 * This removes the resume state and cover letter from `localStorage` and resets
 * the in-memory stores so the UI reflects an empty state immediately. It clears
 * LOCAL data only — it does NOT delete the user's Supabase account or any
 * account metadata (that is out of scope for this control).
 *
 * Callers are responsible for confirming with the user before invoking this
 * (the {@link ./PrivacySettings} panel requires an explicit confirmation).
 */
export function deleteAllMyData(options: DeleteDataOptions = {}): void {
  // 1) Reset the in-memory stores so the UI updates right away.
  useResumeStore.getState().reset();

  const coverLetter = useCoverLetterStore.getState();
  coverLetter.setLetter('');
  coverLetter.setJd('');
  coverLetter.setTone('formal');

  if (options.includeApiKey) {
    useApiKeyStore.getState().clearKey();
  }

  // 2) Best-effort removal of the persisted keys. The store subscriptions will
  //    re-persist their (now empty) state, but explicitly removing guarantees
  //    nothing stale lingers even if a store isn't subscribed yet.
  try {
    globalThis.localStorage?.removeItem(RESUME_STATE_STORAGE_KEY);
    globalThis.localStorage?.removeItem(COVER_LETTER_STORAGE_KEY);
    if (options.includeApiKey) {
      globalThis.localStorage?.removeItem(API_KEY_STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures (private mode / disabled storage).
  }
}
