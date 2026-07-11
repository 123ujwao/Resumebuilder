import { useResumeStore, TEMPLATE_IDS } from '../../store/resumeStore';
import type { TemplateId } from '../../store/resumeStore';
import { EmptyState } from '../../components';
import { hasResumeContent } from '../builder/Builder';
import { getTemplate, hasTemplate, implementedTemplates } from './registry';
import { styleFromSelection } from './types';
import { StyleControls } from './StyleControls';

/**
 * Live preview panel (Req 3.4, 3.5, 13.5).
 *
 * Subscribes directly to the Zustand store's active resume data and template
 * selection. Because both are store-backed, any edit in the builder form
 * updates this preview in real time with no manual wiring (Req 3.4, 13.5), and
 * switching the selected template re-renders the *same* underlying data through
 * a different renderer with no data loss (Req 3.5).
 */
export function LivePreview() {
  const data = useResumeStore((s) => s.getActiveVersion().data);
  const selection = useResumeStore((s) => s.template);

  const definition = getTemplate(selection.templateId);
  const { ScreenComponent } = definition;
  const style = styleFromSelection(selection);
  // Req 13.2: show a friendly placeholder until the resume has real content.
  const isEmpty = !hasResumeContent(data);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Live preview
        </h2>
        <TemplateSwitcher />
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <StyleControls />
        {selection.templateId === 'two-column' && <AtsWarningBadge />}
      </div>
      <div className="flex-1 overflow-auto rounded-lg border border-slate-200 bg-slate-100 p-4">
        {isEmpty ? (
          <EmptyState
            title="Your resume preview will appear here"
            hint="Describe your background or import an existing resume on the left, and this preview updates live as you edit."
          />
        ) : (
          <div className="shadow-sm ring-1 ring-slate-200">
            <ScreenComponent data={data} style={style} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * ATS warning badge (Req 3.3). Shown only while the Two-column template is
 * selected, warning that its multi-column layout "may not be ATS-safe".
 */
export function AtsWarningBadge() {
  return (
    <span
      role="status"
      data-testid="ats-warning"
      className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="h-3.5 w-3.5 fill-amber-500"
      >
        <path d="M8.257 3.099c.765-1.36 2.721-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 10-2 0 1 1 0 002 0zm-1-2a1 1 0 001-1V7a1 1 0 10-2 0v3a1 1 0 001 1z" />
      </svg>
      May not be ATS-safe
    </span>
  );
}

/** Human labels for template ids not yet implemented (Task 5.2). */
const TEMPLATE_LABELS: Record<TemplateId, string> = {
  classic: 'Classic',
  modern: 'Modern',
  compact: 'Compact',
  'two-column': 'Two-column',
  minimal: 'Minimal',
};

/**
 * Simple template selector over the built-in template ids. Ids without a
 * registered renderer yet (Task 5.2) are shown but disabled so the intent is
 * visible without breaking. Full style controls (font/color) land in Task 5.2.
 */
export function TemplateSwitcher() {
  const templateId = useResumeStore((s) => s.template.templateId);
  const setTemplate = useResumeStore((s) => s.setTemplate);

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-slate-600">Template</span>
      <select
        aria-label="Template"
        value={templateId}
        onChange={(e) => setTemplate(e.target.value as TemplateId)}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
      >
        {TEMPLATE_IDS.map((id) => (
          <option key={id} value={id} disabled={!hasTemplate(id)}>
            {TEMPLATE_LABELS[id]}
            {hasTemplate(id) ? '' : ' (soon)'}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Exposed for tests / future callers that want the implemented set directly. */
export { implementedTemplates };
