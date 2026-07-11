/**
 * Pure label-matching autofill mapper (Req 11.5).
 *
 * Given the user's structured {@link ResumeData} and the {@link DetectedField}s
 * a site adapter found on a page, this module decides which resume value (if
 * any) belongs in each field. Matching is heuristic and best-effort: it
 * normalizes each field's label and tests it against ordered keyword sets. Any
 * field that cannot be confidently mapped is returned as `unmatched` so the
 * popup can tell the user to fill it in manually (Req 11.5, 11.7).
 *
 * This is intentionally a pure function (no DOM, no chrome.*) so it can be unit
 * tested exhaustively. The content script consumes the returned `values` map and
 * fills only those fields — it never submits (Req 11.6).
 */
import type { ResumeData } from '@resume-forge/core';
import type { DetectedField } from './fields.js';

/** The resolved autofill plan: values to fill, keyed by field key, plus misses. */
export interface FieldMappingResult {
  /** `{ fieldKey: value }` for every field that matched a non-empty resume value. */
  values: Record<string, string>;
  /** Fields that could not be mapped (no keyword match or empty resume value). */
  unmatched: DetectedField[];
}

/** Normalize a label for tolerant keyword matching (lowercase, single-spaced). */
function normalizeLabel(label: string): string {
  return label.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** True when `haystack` contains any of the given keyword phrases. */
function includesAny(haystack: string, keywords: readonly string[]): boolean {
  return keywords.some((k) => haystack.includes(k));
}

/** The flat set of candidate values derived from the resume. */
interface ResumeValues {
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  portfolio: string;
  currentTitle: string;
  currentCompany: string;
  institution: string;
  degree: string;
}

/** Split a full name into first / last parts (last = everything after first). */
function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

/** Derive the flat candidate values the mapper can draw from. */
function deriveResumeValues(resume: ResumeData): ResumeValues {
  const name = resume.personalInfo.name?.trim() ?? '';
  const { firstName, lastName } = splitName(name);
  // "Most recent" is the first entry; the builder keeps entries in that order.
  const recentExp = resume.experience[0];
  const recentEdu = resume.education[0];
  return {
    name,
    firstName,
    lastName,
    email: resume.personalInfo.email?.trim() ?? '',
    phone: resume.personalInfo.phone?.trim() ?? '',
    location: resume.personalInfo.location?.trim() ?? '',
    linkedin: resume.personalInfo.linkedin?.trim() ?? '',
    portfolio: resume.personalInfo.portfolio?.trim() ?? '',
    currentTitle: recentExp?.title?.trim() ?? '',
    currentCompany: recentExp?.company?.trim() ?? '',
    institution: recentEdu?.institution?.trim() ?? '',
    degree: recentEdu?.degree?.trim() ?? '',
  };
}

/**
 * Resolve the resume value for a single label, or `null` when no heuristic
 * applies. Ordered most-specific first so e.g. "first name" wins over the
 * generic "name" rule and "email address" is not mistaken for a location.
 */
function resolveValue(label: string, v: ResumeValues): string | null {
  const l = normalizeLabel(label);
  if (!l) return null;

  // Email — check before the generic "address" location rule.
  if (includesAny(l, ['email', 'e-mail'])) return v.email || null;

  // Phone / mobile.
  if (includesAny(l, ['phone', 'mobile', 'telephone', 'contact number', 'tel.']))
    return v.phone || null;

  // Profile / portfolio links.
  if (l.includes('linkedin')) return v.linkedin || null;
  if (includesAny(l, ['portfolio', 'personal website', 'website', 'personal site', 'github']))
    return v.portfolio || null;

  // Name variants — specific split labels before the generic name rule.
  if (includesAny(l, ['first name', 'given name', 'forename']))
    return v.firstName || null;
  if (includesAny(l, ['last name', 'surname', 'family name']))
    return v.lastName || null;
  if (includesAny(l, ['full name', 'your name', 'name'])) {
    // Avoid matching "company name" / "username" with the generic name rule.
    if (l.includes('company') || l.includes('user')) {
      // fall through to company handling below
    } else {
      return v.name || null;
    }
  }

  // Current role / employer.
  if (includesAny(l, ['job title', 'current title', 'designation', 'current role']))
    return v.currentTitle || null;
  if (includesAny(l, ['current company', 'current employer', 'employer', 'company', 'organisation', 'organization']))
    return v.currentCompany || null;
  // Bare "title" / "role" as a fallback for the current title.
  if (l === 'title' || l === 'role') return v.currentTitle || null;

  // Education.
  if (includesAny(l, ['institution', 'university', 'college', 'school']))
    return v.institution || null;
  if (includesAny(l, ['degree', 'qualification']))
    return v.degree || null;

  // Location / address / city.
  if (includesAny(l, ['location', 'city', 'address', 'town']))
    return v.location || null;

  return null;
}

/** Field kinds we can meaningfully autofill with a text value. */
const FILLABLE_KINDS: ReadonlySet<DetectedField['kind']> = new Set([
  'text',
  'textarea',
  'email',
  'tel',
]);

/**
 * Map resume data onto detected fields (Req 11.5).
 *
 * Returns a `{ fieldKey: value }` plan for confidently matched fields and the
 * list of `unmatched` fields for manual review. File/select/other controls are
 * never auto-filled and are always reported as unmatched.
 */
export function mapResumeToFields(
  resume: ResumeData,
  fields: DetectedField[],
): FieldMappingResult {
  const v = deriveResumeValues(resume);
  const values: Record<string, string> = {};
  const unmatched: DetectedField[] = [];

  for (const field of fields) {
    if (!FILLABLE_KINDS.has(field.kind)) {
      unmatched.push(field);
      continue;
    }
    const resolved = resolveValue(field.label, v);
    if (resolved && resolved.trim()) {
      values[field.key] = resolved;
    } else {
      unmatched.push(field);
    }
  }

  return { values, unmatched };
}
