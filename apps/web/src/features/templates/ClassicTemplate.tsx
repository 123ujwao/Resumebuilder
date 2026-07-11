import type { TemplateComponentProps } from './types';
import { fontFamily, SERIF_FALLBACK } from './types';
import {
  visibleSections,
  dateRange,
  nonEmptyBullets,
} from './sections';

/**
 * Classic template (Req 3.1): single-column, serif.
 *
 * A traditional, ATS-friendly single-column layout using a serif font family.
 * Section headings use a simple uppercase label with an underline rule. Empty
 * sections are omitted entirely.
 */
export function ClassicTemplate({ data, style }: TemplateComponentProps) {
  const s = visibleSections(data);
  const p = data.personalInfo;
  const family = fontFamily(style.font, SERIF_FALLBACK);

  const contactParts = [p.email, p.phone, p.location, p.linkedin, p.portfolio]
    .map((v) => v?.trim())
    .filter(Boolean);

  return (
    <article
      data-testid="template-classic"
      className="mx-auto max-w-[850px] bg-white px-10 py-8 text-slate-900"
      style={{ fontFamily: family }}
    >
      <header className="text-center">
        {p.name.trim() && (
          <h1 className="text-3xl font-bold tracking-tight">{p.name}</h1>
        )}
        {contactParts.length > 0 && (
          <p className="mt-1 text-sm text-slate-600">
            {contactParts.join('  •  ')}
          </p>
        )}
      </header>

      {s.hasSummary && (
        <Section title="Summary">
          <p className="text-sm leading-relaxed">{data.summary}</p>
        </Section>
      )}

      {s.experience.length > 0 && (
        <Section title="Experience">
          <div className="space-y-4">
            {s.experience.map((exp) => (
              <div key={exp.id}>
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-base font-semibold">
                    {[exp.title, exp.company].filter((v) => v.trim()).join(', ')}
                  </h3>
                  <span className="whitespace-nowrap text-sm text-slate-600">
                    {dateRange(exp.startDate, exp.endDate)}
                  </span>
                </div>
                {exp.location.trim() && (
                  <p className="text-sm italic text-slate-600">{exp.location}</p>
                )}
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
        <Section title="Projects">
          <div className="space-y-4">
            {s.projects.map((proj) => (
              <div key={proj.id}>
                <h3 className="text-base font-semibold">{proj.name}</h3>
                {proj.description.trim() && (
                  <p className="text-sm leading-relaxed">{proj.description}</p>
                )}
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm leading-relaxed">
                  {nonEmptyBullets(proj.bullets).map((b) => (
                    <li key={b.id}>{b.text}</li>
                  ))}
                </ul>
                {proj.techStack.filter((t) => t.trim()).length > 0 && (
                  <p className="mt-1 text-sm text-slate-600">
                    <span className="font-semibold">Tech:</span>{' '}
                    {proj.techStack.filter((t) => t.trim()).join(', ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {s.education.length > 0 && (
        <Section title="Education">
          <div className="space-y-3">
            {s.education.map((edu) => (
              <div key={edu.id}>
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-base font-semibold">{edu.institution}</h3>
                  <span className="whitespace-nowrap text-sm text-slate-600">
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
        <Section title="Skills">
          <div className="space-y-1 text-sm">
            {s.skills.map((cat) => (
              <p key={cat.id}>
                {cat.name.trim() && (
                  <span className="font-semibold">{cat.name}: </span>
                )}
                {cat.skills.filter((sk) => sk.trim()).join(', ')}
              </p>
            ))}
          </div>
        </Section>
      )}

      {s.certifications.length > 0 && (
        <Section title="Certifications">
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
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5">
      <h2 className="border-b border-slate-400 pb-1 text-sm font-bold uppercase tracking-widest">
        {title}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}
