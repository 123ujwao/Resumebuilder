import type { TemplateComponentProps } from './types';
import { fontFamily, SERIF_FALLBACK } from './types';
import { visibleSections, dateRange, nonEmptyBullets } from './sections';

/**
 * Minimal template (Req 3.1): whitespace-heavy, understated, executive feel.
 *
 * Generous spacing, quiet headings (light-weight, letter-spaced labels), and a
 * restrained accent used only as a thin divider. Single-column semantic text,
 * so it remains ATS-friendly (Req 3.2). Empty sections are omitted.
 */
export function MinimalTemplate({ data, style }: TemplateComponentProps) {
  const s = visibleSections(data);
  const p = data.personalInfo;
  const family = fontFamily(style.font, SERIF_FALLBACK);
  const accent = style.accentColor;

  const contactParts = [p.email, p.phone, p.location, p.linkedin, p.portfolio]
    .map((v) => v?.trim())
    .filter(Boolean);

  return (
    <article
      data-testid="template-minimal"
      className="mx-auto max-w-[850px] bg-white px-14 py-12 text-[15px] leading-relaxed text-slate-700"
      style={{ fontFamily: family }}
    >
      <header className="text-center">
        {p.name.trim() && (
          <h1 className="text-4xl font-light tracking-wide text-slate-900">
            {p.name}
          </h1>
        )}
        {contactParts.length > 0 && (
          <p className="mt-3 text-xs uppercase tracking-[0.25em] text-slate-400">
            {contactParts.join('   /   ')}
          </p>
        )}
      </header>

      {s.hasSummary && (
        <Section title="Profile" accent={accent}>
          <p>{data.summary}</p>
        </Section>
      )}

      {s.experience.length > 0 && (
        <Section title="Experience" accent={accent}>
          <div className="space-y-6">
            {s.experience.map((exp) => (
              <div key={exp.id}>
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-lg font-normal text-slate-900">
                    {exp.title.trim() || exp.company}
                  </h3>
                  <span className="whitespace-nowrap text-sm text-slate-400">
                    {dateRange(exp.startDate, exp.endDate)}
                  </span>
                </div>
                {[exp.company, exp.location].filter((v) => v.trim()).length > 0 && (
                  <p className="text-sm text-slate-500">
                    {[exp.company, exp.location].filter((v) => v.trim()).join(' · ')}
                  </p>
                )}
                <ul className="mt-2 list-disc space-y-1 pl-5">
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
          <div className="space-y-6">
            {s.projects.map((proj) => (
              <div key={proj.id}>
                <h3 className="text-lg font-normal text-slate-900">{proj.name}</h3>
                {proj.description.trim() && <p>{proj.description}</p>}
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {nonEmptyBullets(proj.bullets).map((b) => (
                    <li key={b.id}>{b.text}</li>
                  ))}
                </ul>
                {proj.techStack.filter((t) => t.trim()).length > 0 && (
                  <p className="mt-1 text-sm text-slate-400">
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
          <div className="space-y-4">
            {s.education.map((edu) => (
              <div key={edu.id}>
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-lg font-normal text-slate-900">
                    {edu.institution}
                  </h3>
                  <span className="whitespace-nowrap text-sm text-slate-400">
                    {dateRange(edu.startDate, edu.endDate)}
                  </span>
                </div>
                <p className="text-sm text-slate-500">
                  {[edu.degree, edu.field].filter((v) => v.trim()).join(', ')}
                  {edu.gpa?.trim() ? `  ·  GPA: ${edu.gpa}` : ''}
                </p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {s.skills.length > 0 && (
        <Section title="Skills" accent={accent}>
          <div className="space-y-1">
            {s.skills.map((cat) => (
              <p key={cat.id}>
                {cat.name.trim() && (
                  <span className="text-slate-900">{cat.name}: </span>
                )}
                {cat.skills.filter((sk) => sk.trim()).join(', ')}
              </p>
            ))}
          </div>
        </Section>
      )}

      {s.certifications.length > 0 && (
        <Section title="Certifications" accent={accent}>
          <ul className="list-disc space-y-1 pl-5">
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
    <section className="mt-10">
      <h2 className="mb-3 flex items-center gap-3 text-xs font-normal uppercase tracking-[0.3em] text-slate-400">
        {title}
        <span className="h-px flex-1" style={{ backgroundColor: accent, opacity: 0.4 }} />
      </h2>
      <div>{children}</div>
    </section>
  );
}
