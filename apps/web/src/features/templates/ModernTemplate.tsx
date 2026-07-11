import type { TemplateComponentProps } from './types';
import { fontFamily, SANS_FALLBACK } from './types';
import {
  visibleSections,
  dateRange,
  nonEmptyBullets,
} from './sections';

/**
 * Modern template (Req 3.1): single-column, sans-serif, subtle accent.
 *
 * Same single-column structure as Classic but with a sans-serif font and the
 * user's accent color applied subtly — to the name, section headings, and the
 * heading rule. Layout stays ATS-friendly (no tables/columns). Empty sections
 * are omitted.
 */
export function ModernTemplate({ data, style }: TemplateComponentProps) {
  const s = visibleSections(data);
  const p = data.personalInfo;
  const family = fontFamily(style.font, SANS_FALLBACK);
  const accent = style.accentColor;

  const contactParts = [p.email, p.phone, p.location, p.linkedin, p.portfolio]
    .map((v) => v?.trim())
    .filter(Boolean);

  return (
    <article
      data-testid="template-modern"
      className="mx-auto max-w-[850px] bg-white px-10 py-8 text-slate-800"
      style={{ fontFamily: family }}
    >
      <header>
        {p.name.trim() && (
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: accent }}>
            {p.name}
          </h1>
        )}
        {contactParts.length > 0 && (
          <p className="mt-1 text-sm text-slate-500">{contactParts.join('  •  ')}</p>
        )}
      </header>

      {s.hasSummary && (
        <Section title="Summary" accent={accent}>
          <p className="text-sm leading-relaxed">{data.summary}</p>
        </Section>
      )}

      {s.experience.length > 0 && (
        <Section title="Experience" accent={accent}>
          <div className="space-y-4">
            {s.experience.map((exp) => (
              <div key={exp.id}>
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-base font-semibold text-slate-900">
                    {exp.title.trim() || exp.company}
                  </h3>
                  <span className="whitespace-nowrap text-sm text-slate-500">
                    {dateRange(exp.startDate, exp.endDate)}
                  </span>
                </div>
                <p className="text-sm font-medium" style={{ color: accent }}>
                  {[exp.company, exp.location].filter((v) => v.trim()).join(' • ')}
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm leading-relaxed">
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
          <div className="space-y-4">
            {s.projects.map((proj) => (
              <div key={proj.id}>
                <h3 className="text-base font-semibold text-slate-900">{proj.name}</h3>
                {proj.description.trim() && (
                  <p className="text-sm leading-relaxed">{proj.description}</p>
                )}
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm leading-relaxed">
                  {nonEmptyBullets(proj.bullets).map((b) => (
                    <li key={b.id}>{b.text}</li>
                  ))}
                </ul>
                {proj.techStack.filter((t) => t.trim()).length > 0 && (
                  <p className="mt-1 text-sm text-slate-500">
                    {proj.techStack.filter((t) => t.trim()).join(' · ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {s.education.length > 0 && (
        <Section title="Education" accent={accent}>
          <div className="space-y-3">
            {s.education.map((edu) => (
              <div key={edu.id}>
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-base font-semibold text-slate-900">
                    {edu.institution}
                  </h3>
                  <span className="whitespace-nowrap text-sm text-slate-500">
                    {dateRange(edu.startDate, edu.endDate)}
                  </span>
                </div>
                <p className="text-sm">
                  {[edu.degree, edu.field].filter((v) => v.trim()).join(', ')}
                  {edu.gpa?.trim() ? `  •  GPA: ${edu.gpa}` : ''}
                </p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {s.skills.length > 0 && (
        <Section title="Skills" accent={accent}>
          <div className="space-y-1 text-sm">
            {s.skills.map((cat) => (
              <p key={cat.id}>
                {cat.name.trim() && (
                  <span className="font-semibold" style={{ color: accent }}>
                    {cat.name}:{' '}
                  </span>
                )}
                {cat.skills.filter((sk) => sk.trim()).join(', ')}
              </p>
            ))}
          </div>
        </Section>
      )}

      {s.certifications.length > 0 && (
        <Section title="Certifications" accent={accent}>
          <ul className="list-disc space-y-0.5 pl-5 text-sm">
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
    <section className="mt-5">
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
