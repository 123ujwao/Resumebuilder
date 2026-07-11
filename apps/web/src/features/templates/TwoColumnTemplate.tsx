import type { TemplateComponentProps } from './types';
import { fontFamily, SANS_FALLBACK } from './types';
import { visibleSections, dateRange, nonEmptyBullets } from './sections';

/**
 * Two-column template (Req 3.1, 3.2, 3.3): skills/contact sidebar + main content.
 *
 * Visually two columns, but the layout is built with CSS grid rather than an
 * HTML `<table>`, and the document order places the sidebar (contact + skills)
 * before the main content so text still parses in a reasonable order (Req 3.2).
 * Even so, multi-column resumes are a known ATS risk, so the switcher/preview
 * surfaces a "may not be ATS-safe" warning whenever this template is selected
 * (Req 3.3 — see {@link AtsWarningBadge} in LivePreview).
 *
 * Empty sections are omitted.
 */
export function TwoColumnTemplate({ data, style }: TemplateComponentProps) {
  const s = visibleSections(data);
  const p = data.personalInfo;
  const family = fontFamily(style.font, SANS_FALLBACK);
  const accent = style.accentColor;

  const contactParts = [p.email, p.phone, p.location, p.linkedin, p.portfolio]
    .map((v) => v?.trim())
    .filter(Boolean);

  const hasSidebar = contactParts.length > 0 || s.skills.length > 0 || s.certifications.length > 0;

  return (
    <article
      data-testid="template-two-column"
      className="mx-auto max-w-[850px] bg-white text-[13px] text-slate-800"
      style={{ fontFamily: family }}
    >
      <header className="px-8 pt-8">
        {p.name.trim() && (
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: accent }}>
            {p.name}
          </h1>
        )}
      </header>

      {/* CSS grid layout (no <table>) so text order stays sidebar → main. */}
      <div className="grid grid-cols-1 gap-6 px-8 py-6 sm:grid-cols-[220px_1fr]">
        {/* Sidebar */}
        {hasSidebar && (
          <aside className="space-y-5">
            {contactParts.length > 0 && (
              <SideSection title="Contact" accent={accent}>
                <ul className="space-y-1 break-words">
                  {contactParts.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </SideSection>
            )}

            {s.skills.length > 0 && (
              <SideSection title="Skills" accent={accent}>
                <div className="space-y-2">
                  {s.skills.map((cat) => (
                    <div key={cat.id}>
                      {cat.name.trim() && (
                        <p className="font-semibold text-slate-900">{cat.name}</p>
                      )}
                      <p>{cat.skills.filter((sk) => sk.trim()).join(', ')}</p>
                    </div>
                  ))}
                </div>
              </SideSection>
            )}

            {s.certifications.length > 0 && (
              <SideSection title="Certifications" accent={accent}>
                <ul className="space-y-1">
                  {s.certifications.map((cert) => (
                    <li key={cert.id}>
                      {cert.name}
                      {cert.issuer?.trim() ? ` — ${cert.issuer}` : ''}
                      {cert.date?.trim() ? ` (${cert.date})` : ''}
                    </li>
                  ))}
                </ul>
              </SideSection>
            )}
          </aside>
        )}

        {/* Main content */}
        <div className="space-y-5">
          {s.hasSummary && (
            <MainSection title="Summary" accent={accent}>
              <p className="leading-relaxed">{data.summary}</p>
            </MainSection>
          )}

          {s.experience.length > 0 && (
            <MainSection title="Experience" accent={accent}>
              <div className="space-y-4">
                {s.experience.map((exp) => (
                  <div key={exp.id}>
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="font-semibold text-slate-900">
                        {[exp.title, exp.company].filter((v) => v.trim()).join(', ')}
                      </h3>
                      <span className="whitespace-nowrap text-xs text-slate-500">
                        {dateRange(exp.startDate, exp.endDate)}
                      </span>
                    </div>
                    {exp.location.trim() && (
                      <p className="text-xs italic text-slate-500">{exp.location}</p>
                    )}
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 leading-relaxed">
                      {nonEmptyBullets(exp.bullets).map((b) => (
                        <li key={b.id}>{b.text}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </MainSection>
          )}

          {s.projects.length > 0 && (
            <MainSection title="Projects" accent={accent}>
              <div className="space-y-4">
                {s.projects.map((proj) => (
                  <div key={proj.id}>
                    <h3 className="font-semibold text-slate-900">{proj.name}</h3>
                    {proj.description.trim() && (
                      <p className="leading-relaxed">{proj.description}</p>
                    )}
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 leading-relaxed">
                      {nonEmptyBullets(proj.bullets).map((b) => (
                        <li key={b.id}>{b.text}</li>
                      ))}
                    </ul>
                    {proj.techStack.filter((t) => t.trim()).length > 0 && (
                      <p className="mt-1 text-xs text-slate-500">
                        {proj.techStack.filter((t) => t.trim()).join(', ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </MainSection>
          )}

          {s.education.length > 0 && (
            <MainSection title="Education" accent={accent}>
              <div className="space-y-3">
                {s.education.map((edu) => (
                  <div key={edu.id}>
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="font-semibold text-slate-900">
                        {edu.institution}
                      </h3>
                      <span className="whitespace-nowrap text-xs text-slate-500">
                        {dateRange(edu.startDate, edu.endDate)}
                      </span>
                    </div>
                    <p>
                      {[edu.degree, edu.field].filter((v) => v.trim()).join(', ')}
                      {edu.gpa?.trim() ? `  •  GPA: ${edu.gpa}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            </MainSection>
          )}
        </div>
      </div>
    </article>
  );
}

function SideSection({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2
        className="mb-1 text-[11px] font-bold uppercase tracking-widest"
        style={{ color: accent }}
      >
        {title}
      </h2>
      <div className="text-xs">{children}</div>
    </section>
  );
}

function MainSection({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2
        className="pb-1 text-xs font-bold uppercase tracking-[0.2em]"
        style={{ color: accent, borderBottom: `2px solid ${accent}` }}
      >
        {title}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}
