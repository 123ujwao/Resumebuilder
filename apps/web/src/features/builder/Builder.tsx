import { useMemo, useState } from 'react';
import type { ResumeData } from '@resume-forge/core';
import { useResumeStore } from '../../store/resumeStore';
import { ChatIntake } from './ChatIntake';
import { ResumeImport } from './ResumeImport';
import { ResumeForm } from './ResumeForm';

/**
 * Builder feature container (Req 2.1, 2.3, 2.8).
 *
 * Coordinates the two halves of the natural-language builder:
 *  - {@link ChatIntake}: the chat-like freeform entry point (Req 2.1).
 *  - {@link ResumeForm}: the editable form that is the source of truth after
 *    extraction (Req 2.3, 2.8).
 *
 * The form is revealed once the active resume has any content — either from a
 * successful extraction or from previously-persisted data on reload. The intake
 * stays accessible so the user can start over, but rebuilding warns before it
 * replaces the current data (Req 2.8). This component never destroys form data
 * on its own; only an explicit successful rebuild replaces it.
 */

/** True when a resume has any user-entered content worth editing. */
export function hasResumeContent(data: ResumeData): boolean {
  const p = data.personalInfo;
  return Boolean(
    p.name ||
      p.email ||
      p.phone ||
      p.location ||
      p.linkedin ||
      p.portfolio ||
      data.summary ||
      data.experience.length ||
      data.education.length ||
      data.skills.length ||
      data.projects.length ||
      data.certifications.length,
  );
}

/** Which intake entry point is currently shown (Req 2.5). */
export type IntakeMode = 'describe' | 'import';

export function Builder() {
  const data = useResumeStore((s) => s.getActiveVersion().data);
  const populated = useMemo(() => hasResumeContent(data), [data]);

  // Once populated (via extraction or persisted data), show the form. The user
  // can toggle the intake back open to start over.
  const [intakeOpen, setIntakeOpen] = useState(!populated);
  const [mode, setMode] = useState<IntakeMode>('describe');

  const showForm = populated;
  const showIntake = intakeOpen || !populated;

  return (
    <div className="space-y-6">
      {showForm && (
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Your resume</h2>
          <button
            type="button"
            onClick={() => setIntakeOpen((open) => !open)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {intakeOpen ? 'Hide intake' : 'Start over'}
          </button>
        </div>
      )}

      {showIntake && (
        <div className="space-y-4">
          <div
            role="tablist"
            aria-label="How would you like to start?"
            className="inline-flex rounded-lg border border-slate-300 bg-white p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'describe'}
              onClick={() => setMode('describe')}
              className={`rounded-md px-4 py-1.5 text-sm font-medium ${
                mode === 'describe'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              Describe it
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'import'}
              onClick={() => setMode('import')}
              className={`rounded-md px-4 py-1.5 text-sm font-medium ${
                mode === 'import'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              Import existing
            </button>
          </div>

          {mode === 'describe' ? (
            <ChatIntake
              hasExistingData={populated}
              onExtracted={() => setIntakeOpen(false)}
            />
          ) : (
            <ResumeImport
              hasExistingData={populated}
              onExtracted={() => setIntakeOpen(false)}
            />
          )}
        </div>
      )}

      {showForm && <ResumeForm />}
    </div>
  );
}
