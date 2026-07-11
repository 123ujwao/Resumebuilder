import { useEffect, useMemo, useState } from 'react';
import {
  createAnthropicClient,
  tailorResume,
  type ResumeData,
  type AiErrorKind,
} from '@resume-forge/core';
import {
  getSharedState,
  selectActiveResumeData,
  setApiKey as persistApiKey,
  type SharedState,
} from '../shared/storage.js';
import { sendToTab, type ContentToPopupResponse } from '../shared/messages.js';
import { mapResumeToFields } from '../shared/fieldMapping.js';
import type { DetectedField } from '../shared/fields.js';

/**
 * Popup UI (Req 11.4, 11.5, 11.7).
 *
 * On open it finds the active tab, PINGs the content script to learn whether the
 * page is a supported posting, and loads the shared resume data. It then offers:
 *  - "Tailor resume for this job?" — pulls the JD from the page and runs the
 *    shared `tailorResume` flow (Feature 3) using the user's BYOK key (Req 11.4).
 *  - "Autofill this application" — asks the content script for detected fields,
 *    maps resume values with pure label-matching heuristics, sends the plan for
 *    filling, and reports which fields were filled vs. need manual review
 *    (Req 11.5). The content script fills values only — never submits (Req 11.6).
 *
 * A persistent disclaimer states autofill is best-effort and the user always
 * reviews and submits themselves (Req 11.7).
 */

/** Map a typed AI error to friendly copy for the popup. */
function aiErrorMessage(error: AiErrorKind): string {
  switch (error) {
    case 'no_key':
      return 'Add your Anthropic API key below to tailor your resume.';
    case 'auth':
      return 'Your Anthropic API key was rejected. Check it and try again.';
    case 'rate_limit':
      return 'Anthropic is busy right now. Wait a moment and try again.';
    case 'parse':
      return 'The AI response could not be read. Try again.';
    case 'network':
    default:
      return 'Could not reach Anthropic. Check your connection and try again.';
  }
}

interface TailorSummary {
  matchScore: number;
  gaps: string[];
  flaggedFabrications: string[];
}

interface AutofillSummary {
  filled: string[];
  unmatched: string[];
}

async function getActiveTabId(): Promise<number | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) return null;
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    return tab?.id ?? null;
  } catch {
    return null;
  }
}

export function Popup() {
  const [loading, setLoading] = useState(true);
  const [shared, setShared] = useState<SharedState>({
    resumeState: null,
    auth: null,
    apiKey: null,
  });
  const [tabId, setTabId] = useState<number | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [busy, setBusy] = useState<null | 'tailor' | 'autofill'>(null);
  const [error, setError] = useState<string | null>(null);
  const [tailorResult, setTailorResult] = useState<TailorSummary | null>(null);
  const [autofillResult, setAutofillResult] = useState<AutofillSummary | null>(
    null,
  );

  useEffect(() => {
    let active = true;
    (async () => {
      const [state, id] = await Promise.all([
        getSharedState(),
        getActiveTabId(),
      ]);
      if (!active) return;
      setShared(state);
      setTabId(id);
      if (id !== null) {
        const pong = await sendToTab(id, { type: 'PING' });
        if (active) {
          setSupported(pong?.type === 'PONG' ? pong.supported : false);
        }
      } else {
        setSupported(false);
      }
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const resume: ResumeData | null = useMemo(
    () => selectActiveResumeData(shared.resumeState),
    [shared.resumeState],
  );
  const hasResume = resume !== null;
  const resumeName = resume?.personalInfo.name?.trim();
  const canAct = hasResume && supported === true && tabId !== null;

  /** Ensure a key is available, persisting a freshly typed one to storage. */
  async function ensureApiKey(): Promise<string | null> {
    if (shared.apiKey) return shared.apiKey;
    const typed = apiKeyInput.trim();
    if (!typed) return null;
    await persistApiKey(typed);
    setShared((s) => ({ ...s, apiKey: typed }));
    return typed;
  }

  async function handleTailor() {
    if (!resume || tabId === null) return;
    setError(null);
    setTailorResult(null);
    setBusy('tailor');
    try {
      const jdResp = await sendToTab(tabId, { type: 'EXTRACT_JD' });
      const jd =
        jdResp?.type === 'JD_RESULT' && jdResp.jd ? jdResp.jd.trim() : '';
      if (!jd) {
        setError(
          'No job description found on this page. Open a supported job posting and try again.',
        );
        return;
      }
      const key = await ensureApiKey();
      if (!key) {
        setError(aiErrorMessage('no_key'));
        return;
      }
      const client = createAnthropicClient({ apiKey: key });
      const result = await tailorResume(client, resume, jd);
      if (!result.ok) {
        setError(aiErrorMessage(result.error));
        return;
      }
      setTailorResult({
        matchScore: result.value.matchScore,
        gaps: result.value.gaps,
        flaggedFabrications: result.value.flaggedFabrications ?? [],
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleAutofill() {
    if (!resume || tabId === null) return;
    setError(null);
    setAutofillResult(null);
    setBusy('autofill');
    try {
      const fieldsResp = await sendToTab(tabId, { type: 'FIND_FIELDS' });
      const fields: DetectedField[] =
        fieldsResp?.type === 'FIELDS_RESULT' ? fieldsResp.fields : [];
      if (fields.length === 0) {
        setError(
          'No form fields were detected on this page. You may need to open the application form first.',
        );
        return;
      }
      const { values, unmatched } = mapResumeToFields(resume, fields);
      const fillResp: ContentToPopupResponse | null = await sendToTab(tabId, {
        type: 'AUTOFILL',
        values,
      });
      const filled =
        fillResp?.type === 'AUTOFILL_RESULT' ? fillResp.filled : [];
      // Fields the content script couldn't locate + fields we never mapped.
      const unmatchedLabels = unmatched.map((f) => f.label);
      const notLocated =
        fillResp?.type === 'AUTOFILL_RESULT' ? fillResp.unmatched : [];
      setAutofillResult({
        filled,
        unmatched: [...unmatchedLabels, ...notLocated],
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rf-popup">
      <h1>ResumeForge</h1>
      <p className="rf-tagline">Tailor your resume and autofill applications.</p>

      {loading ? (
        <div className="rf-status">Loading your resume…</div>
      ) : hasResume ? (
        <div className="rf-status rf-ok">
          Resume ready{resumeName ? ` for ${resumeName}` : ''}.
        </div>
      ) : (
        <div className="rf-status rf-empty">
          No resume found. Open the ResumeForge web app to build one.
        </div>
      )}

      {!loading && hasResume && supported === false && (
        <div className="rf-status rf-empty">
          This page isn’t a supported job posting. Open a LinkedIn, Indeed, or
          Naukri job to tailor and autofill.
        </div>
      )}

      {!loading && hasResume && !shared.apiKey && (
        <div className="rf-keyrow">
          <label htmlFor="rf-apikey">Anthropic API key</label>
          <input
            id="rf-apikey"
            type="password"
            placeholder="sk-ant-…"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            autoComplete="off"
          />
          <span className="rf-hint">
            Stored on this device only, sent only to Anthropic.
          </span>
        </div>
      )}

      <div className="rf-actions">
        <button
          type="button"
          onClick={handleTailor}
          disabled={!canAct || busy !== null}
        >
          {busy === 'tailor' ? 'Tailoring…' : 'Tailor resume for this job'}
        </button>
        <button
          type="button"
          onClick={handleAutofill}
          disabled={!canAct || busy !== null}
        >
          {busy === 'autofill' ? 'Autofilling…' : 'Autofill this application'}
        </button>
      </div>

      {error && <div className="rf-status rf-error">{error}</div>}

      {tailorResult && (
        <div className="rf-result">
          <div className="rf-result-score">
            Match score: <strong>{tailorResult.matchScore}/100</strong>
          </div>
          {tailorResult.gaps.length > 0 && (
            <details open>
              <summary>Gaps to address ({tailorResult.gaps.length})</summary>
              <ul>
                {tailorResult.gaps.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </details>
          )}
          {tailorResult.flaggedFabrications.length > 0 && (
            <div className="rf-hint">
              Some AI-suggested details were removed because they weren’t in your
              resume.
            </div>
          )}
        </div>
      )}

      {autofillResult && (
        <div className="rf-result">
          <div>
            Filled <strong>{autofillResult.filled.length}</strong> field
            {autofillResult.filled.length === 1 ? '' : 's'}.
          </div>
          {autofillResult.unmatched.length > 0 && (
            <details open>
              <summary>
                Needs manual review ({autofillResult.unmatched.length})
              </summary>
              <ul>
                {autofillResult.unmatched.map((label, i) => (
                  <li key={i}>{label}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <p className="rf-disclaimer">
        Autofill is best-effort and may not match every field — always review the
        application and correct anything before you submit. You always click
        Submit yourself; ResumeForge never submits for you.
      </p>
    </div>
  );
}
