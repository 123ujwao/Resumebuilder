import type {
  ResumeData,
  ExperienceItem,
  EducationItem,
  SkillCategory,
  ProjectItem,
  Certification,
} from '@resume-forge/core';

/**
 * Section-presence helpers shared by every template.
 *
 * Templates gracefully omit empty sections (Req 3.4 / clean output): a section
 * is only rendered when it has meaningful content. These predicates centralize
 * that "is there anything worth showing?" logic so all templates agree on what
 * counts as empty.
 */

const hasText = (v?: string): boolean => Boolean(v && v.trim());

export function hasContact(data: ResumeData): boolean {
  const p = data.personalInfo;
  return [p.email, p.phone, p.location, p.linkedin, p.portfolio].some(hasText);
}

export function experienceHasContent(exp: ExperienceItem): boolean {
  return (
    hasText(exp.company) ||
    hasText(exp.title) ||
    hasText(exp.location) ||
    hasText(exp.startDate) ||
    hasText(exp.endDate) ||
    exp.bullets.some((b) => hasText(b.text))
  );
}

export function educationHasContent(edu: EducationItem): boolean {
  return (
    hasText(edu.institution) ||
    hasText(edu.degree) ||
    hasText(edu.field) ||
    hasText(edu.startDate) ||
    hasText(edu.endDate) ||
    hasText(edu.gpa)
  );
}

export function skillCategoryHasContent(cat: SkillCategory): boolean {
  return hasText(cat.name) || cat.skills.some(hasText);
}

export function projectHasContent(proj: ProjectItem): boolean {
  return (
    hasText(proj.name) ||
    hasText(proj.description) ||
    proj.bullets.some((b) => hasText(b.text)) ||
    proj.techStack.some(hasText)
  );
}

export function certificationHasContent(cert: Certification): boolean {
  return hasText(cert.name) || hasText(cert.issuer) || hasText(cert.date);
}

/** Filter each list section down to entries that have real content. */
export function visibleSections(data: ResumeData) {
  return {
    experience: data.experience.filter(experienceHasContent),
    education: data.education.filter(educationHasContent),
    skills: data.skills.filter(skillCategoryHasContent),
    projects: data.projects.filter(projectHasContent),
    certifications: data.certifications.filter(certificationHasContent),
    hasSummary: hasText(data.summary),
    hasContact: hasContact(data),
  };
}

/** Join a start/end date pair into a compact "start – end" range. */
export function dateRange(start?: string, end?: string): string {
  const s = start?.trim();
  const e = end?.trim();
  if (s && e) return `${s} – ${e}`;
  return s || e || '';
}

/** Filter bullets down to those with text. */
export function nonEmptyBullets(bullets: { id: string; text: string }[]) {
  return bullets.filter((b) => b.text.trim());
}
