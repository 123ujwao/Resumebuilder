import { useResumeStore } from '../../store/resumeStore';

/**
 * Version history + switcher (Req 4.5).
 *
 * Lists every saved version (the immutable base plus each tailored variant) and
 * lets the user switch the active version so the preview and export reflect the
 * selected one. The base is always present and never removable; tailored
 * variants can be removed. For tailored versions we surface the matchScore from
 * the stored tailoring metadata for a quick comparison.
 */
export function VersionSwitcher() {
  const versions = useResumeStore((s) => s.versions);
  const activeVersionId = useResumeStore((s) => s.activeVersionId);
  const setActiveVersion = useResumeStore((s) => s.setActiveVersion);
  const removeVersion = useResumeStore((s) => s.removeVersion);

  // Req 13.2: guide the user when they only have the base resume so far.
  const hasTailored = versions.some((v) => v.kind === 'tailored');

  return (
    <section className="space-y-3" aria-labelledby="versions-title">
      <h2 id="versions-title" className="text-sm font-semibold text-slate-900">
        Versions ({versions.length})
      </h2>
      {!hasTailored && (
        <p className="text-xs text-slate-500">
          Tailor your resume to a job below to save it as a new version alongside
          your base resume.
        </p>
      )}
      <ul className="space-y-2" aria-label="Resume versions">
        {versions.map((version) => {
          const isActive = version.id === activeVersionId;
          return (
            <li
              key={version.id}
              className={`flex items-center justify-between gap-3 rounded-md border p-2.5 ${
                isActive ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white'
              }`}
            >
              <button
                type="button"
                onClick={() => setActiveVersion(version.id)}
                aria-pressed={isActive}
                className="flex-1 text-left"
              >
                <span className="block text-sm font-medium text-slate-900">
                  {version.label}
                </span>
                <span className="block text-xs text-slate-500">
                  {version.kind === 'base' ? 'Base resume' : null}
                  {version.kind === 'tailored' && version.tailoring
                    ? `Match ${version.tailoring.matchScore}/100`
                    : null}
                </span>
              </button>

              <div className="flex items-center gap-2">
                {isActive && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                    Active
                  </span>
                )}
                {version.kind === 'tailored' && (
                  <button
                    type="button"
                    onClick={() => removeVersion(version.id)}
                    aria-label={`Remove ${version.label}`}
                    className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
