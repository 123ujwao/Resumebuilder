/**
 * Gaps checklist (Req 4.4).
 *
 * Displays JD requirements the resume does not address as a visible checklist,
 * never silently hidden. An empty gaps list is a good outcome, so we say so
 * explicitly rather than rendering nothing.
 */
export interface GapsChecklistProps {
  gaps: string[];
}

export function GapsChecklist({ gaps }: GapsChecklistProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-slate-700">
        Gaps ({gaps.length})
      </h3>
      {gaps.length === 0 ? (
        <p className="text-sm text-green-700">
          No gaps found — your resume addresses the job's key requirements.
        </p>
      ) : (
        <ul className="space-y-1" aria-label="Gaps checklist">
          {gaps.map((gap, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
              <span aria-hidden className="mt-0.5 text-amber-500">
                ☐
              </span>
              <span>{gap}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
