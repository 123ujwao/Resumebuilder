import type { TemplateComponentProps } from './types';
import { fontFamily, SANS_FALLBACK } from './types';
import { visibleSections, dateRange, nonEmptyBullets } from './sections';

/**
 * Compact template (Req 3.1): dense single-column layout for students/freshers.
 *
 * Tight spacing and smaller type help fit limited experience onto a single
 * page. Stays ATS-friendly: a single column of semantic text with no tables or
 * graphics (Req 3.2). Empty sections are omitted.
 */
export function CompactTemplate({ data, style }: TemplateComponentProps) {
  const s = visibleSections(data);
  const p = data.personalInfo;
  const family = fontFamily(style.font, SANS_FALLBACK);
  const accent = style.accentColor;

  const contactParts = [p.email, p.phone, p.location, p.linkedin, p.portfolio]
    .map((v) => v?.trim())
    .filter(Boolean);

  return (
    <article
      data-testid="template-compact"
      className="mx-auto max-w-[850px] bg-white px-8 py-5 text-[13px] leading-snug text-slate-800"
      style={{ fontFamily: family }}
    >
      <header className="border-b border-slate-300 pb-2">
        {p.name.trim() && (
          <h1 className="text-xl font-bold tracking-tight" style={{ color: accent }}>
            {p.name}
          </h1>
        )}
        {contactParts.length > 0 && (
          <p className="text-xs text-slate-500">{contactParts.join('  •  ')}</p>
        )}
      </header>

      {s.hasSummary && (
        <Section title="Summary" accent={accent}>
          <p className="leading-snug">{data.summary}</p>
        </Section>
      )}

      {s.experience.length > 0 && (
        <Section title="Experience" accent={accent}>
          <div className="space-y-2">
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
                <ul className="list-disc space-y-0 pl-4">
                  {nonEmptyBullets(exp.bullets).map((b) => (
                    <li key={b.id}>{b.text}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      )}

      {s.projects.length > 0 && (
        <Section title="Projects" accent={accent}>
          <div className="space-y-2">
            {s.projects.map((proj) => (
              <div key={proj.id}>
                <h3 className="font-semibold text-slate-900">{proj.name}</h3>
                {proj.description.trim() && <p>{proj.description}</p>}
                <ul className="list-disc space-y-0 pl-4">
                  {nonEmptyBullets(proj.bullets).map((b) => (
                    <li key={b.id}>{b.text}</li>
                  ))}
                </ul>
                {proj.techStack.filter((t) => t.trim()).length > 0 && (
                  <p className="text-xs text-slate-500">
                    {proj.techStack.filter((t) => t.trim()).join(', ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {s.education.length > 0 && (
        <Section title="Education" accent={accent}>
          <div className="space-y-1">
            {s.education.map((edu) => (
              <div key={edu.id} className="flex items-baseline justify-between gap-3">
                <span>
                  <span className="font-semibold text-slate-900">
                    {edu.institution}
                  </span>
                  {[edu.degree, edu.field].filter((v) => v.trim()).length > 0 && (
                    <span>
                      {' — '}
                      {[edu.degree, edu.field].filter((v) => v.trim()).join(', ')}
                    </span>
                  )}
                  {edu.gpa?.trim() ? ` • GPA: ${edu.gpa}` : ''}
                </span>
                <span className="whitespace-nowrap text-xs text-slate-500">
                  {dateRange(edu.startDate, edu.endDate)}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {s.skills.length > 0 && (
        <Section title="Skills" accent={accent}>
          <div className="space-y-0.5">
            {s.skills.map((cat) => (
              <p key={cat.id}>
                {cat.name.trim() && <span className="font-semibold">{cat.name}: </span>}
                {cat.skills.filter((sk) => sk.trim()).join(', ')}
              </p>
            ))}
          </div>
        </Section>
      )}

      {s.certifications.length > 0 && (
        <Section title="Certifications" accent={accent}>
          <ul className="list-disc space-y-0 pl-4">
            {s.certifications.map((cert) => (
              <li key={cert.id}>
                {cert.name}
                {cert.issuer?.trim() ? ` — ${cert.issuer}` : ''}
                {cert.date?.trim() ? ` (${cert.date})` : ''}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </article>
  );
}

function Section({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-3">
      <h2
        className="text-[11px] font-bold uppercase tracking-widest"
        style={{ color: accent }}
      >
        {title}
      </h2>
      <div className="mt-1">{children}</div>
    </section>
  );
}
