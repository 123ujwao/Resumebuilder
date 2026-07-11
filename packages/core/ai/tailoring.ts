import {
  resumeDataSchema,
  type ResumeData,
  type ExperienceItem,
  type EducationItem,
  type Certification,
  type SkillCategory,
  type ProjectItem,
} from '../model/resume.js';
import type { BulletChange } from '../model/version.js';
import type { AiResult, AnthropicClient, Message } from './types.js';
import { stripCodeFences } from './extraction.js';

/**
 * JD-based resume tailoring (Req 4.1-4.4).
 *
 * `buildTailoringPrompt` produces a strict JSON-only prompt that asks the AI to
 * reorder/re-weight/rephrase the user's EXISTING resume content to match a job
 * description, and to return a tailored {@link ResumeData} plus a `matchScore`
 * and a list of `gaps`. `tailorResume` runs the full pipeline:
 * send → parse → id backfill → zod-validate → no-fabrication enforcement →
 * diff, returning sanitized data + tailoring metadata.
 *
 * The no-fabrication guarantee (Req 4.3) is NOT solely prompt-dependent: after
 * the AI responds, {@link enforceNoFabrication} performs a set comparison over
 * structured factual fields (employers, titles, dates, degrees, institutions,
 * certifications, skills) and strips/flags anything the source resume did not
 * contain.
 */

/**
 * System prompt for tailoring.
 *
 * It is explicit about:
 * 1. Output ONLY valid JSON — the tailored resume (same ResumeData schema) plus
 *    `matchScore` and `gaps`. No markdown, no prose.
 * 2. The tailoring behaviour (Req 4.2): identify JD keywords, reorder/re-weight
 *    existing skills & bullets, rephrase existing bullets to mirror JD language
 *    where truthful.
 * 3. The hard no-fabrication rule (Req 4.3): never invent employers, titles,
 *    companies, dates, degrees, institutions, or skills not present in source.
 */
export const TAILORING_SYSTEM_PROMPT = `You are a resume-tailoring assistant for ResumeForge.

Your job: given a user's structured resume (JSON) and a job description (JD), produce a tailored version of that SAME resume that surfaces the most relevant experience for the JD.

Output rules (STRICT):
- Output ONLY valid JSON. No markdown code fences, no backticks, no prose, no explanation before or after.
- The JSON MUST be an object of exactly this shape:

{
  "resume": { ...the tailored resume, using the SAME schema as the input resume... },
  "matchScore": number,   // 0-100, how well the tailored resume matches the JD
  "gaps": [string]        // JD requirements the resume does NOT address
}

- "resume" MUST use the identical structure to the input resume (personalInfo, summary, experience, education, skills, projects, certifications). Preserve every "id" field exactly as given.
- "matchScore" MUST be an integer from 0 to 100.
- "gaps" MUST be a list of short human-readable strings describing JD requirements not addressed by the resume. Never hide gaps; list them honestly.

Tailoring rules (what you MAY do):
- Identify the key skills and keywords in the JD.
- Reorder and re-weight the user's existing skills and bullets so the most JD-relevant items appear first.
- Rephrase existing bullet text and the summary to mirror the JD's language, but ONLY where a truthful overlap already exists in the user's content.

Absolute no-fabrication rules (what you MUST NOT do — Req 4.3):
- NEVER invent, add, or rename employers, companies, job titles, locations, dates, degrees, fields of study, institutions, certifications, or skills that the user did not provide.
- NEVER add new experience, education, project, or certification entries. You may only reorder and rephrase existing ones.
- Every company, title, date, institution, degree, and skill name in your output MUST already exist in the input resume. Only bullet TEXT and the summary may be rephrased.
- If the JD asks for something the user does not have, do NOT add it to the resume — put it in "gaps" instead.`;

/** The prompt payload sent to the Anthropic client for tailoring. */
export interface TailoringPrompt {
  system: string;
  messages: Message[];
}

/**
 * Build the tailoring prompt (Req 4.1, 4.2, 4.4).
 *
 * The full structured resume and the JD are both sent to the AI (Req 4.1). The
 * schema, tailoring behaviour, and no-fabrication contract live in the system
 * prompt; the resume JSON and JD text are passed as the user message.
 */
export function buildTailoringPrompt(
  resume: ResumeData,
  jd: string,
): TailoringPrompt {
  return {
    system: TAILORING_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Here is my current resume as JSON:\n\n${JSON.stringify(
          resume,
          null,
          2,
        )}\n\nHere is the job description to tailor it for:\n\n${jd}\n\nReturn the tailored resume plus matchScore and gaps as specified.`,
      },
    ],
  };
}

/** Normalize a fact value for tolerant comparison (trim + case-insensitive). */
function normalizeFact(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * The set of "allowed facts" derived from the source resume, grouped by the
 * kind of structured field they constrain. Membership is checked with
 * {@link normalizeFact} so trivial reformatting (case/whitespace) is not
 * falsely flagged, but a genuinely new value is caught.
 */
interface AllowedFacts {
  companies: Set<string>;
  titles: Set<string>;
  locations: Set<string>;
  experienceDates: Set<string>;
  institutions: Set<string>;
  degrees: Set<string>;
  fields: Set<string>;
  educationDates: Set<string>;
  certifications: Set<string>;
  /** Skill names across skill categories AND project techStack entries. */
  skills: Set<string>;
}

function addFact(set: Set<string>, value: string | undefined): void {
  if (typeof value === 'string' && value.trim().length > 0) {
    set.add(normalizeFact(value));
  }
}

function has(set: Set<string>, value: string | undefined): boolean {
  // Empty/blank values are always allowed — they aren't a fabricated fact.
  if (typeof value !== 'string' || value.trim().length === 0) {
    return true;
  }
  return set.has(normalizeFact(value));
}

/** Compute the set of facts the tailored output is allowed to contain. */
function collectAllowedFacts(source: ResumeData): AllowedFacts {
  const facts: AllowedFacts = {
    companies: new Set(),
    titles: new Set(),
    locations: new Set(),
    experienceDates: new Set(),
    institutions: new Set(),
    degrees: new Set(),
    fields: new Set(),
    educationDates: new Set(),
    certifications: new Set(),
    skills: new Set(),
  };

  for (const exp of source.experience) {
    addFact(facts.companies, exp.company);
    addFact(facts.titles, exp.title);
    addFact(facts.locations, exp.location);
    addFact(facts.experienceDates, exp.startDate);
    addFact(facts.experienceDates, exp.endDate);
  }

  for (const edu of source.education) {
    addFact(facts.institutions, edu.institution);
    addFact(facts.degrees, edu.degree);
    addFact(facts.fields, edu.field);
    addFact(facts.educationDates, edu.startDate);
    addFact(facts.educationDates, edu.endDate);
  }

  for (const cert of source.certifications) {
    addFact(facts.certifications, cert.name);
  }

  for (const category of source.skills) {
    for (const skill of category.skills) {
      addFact(facts.skills, skill);
    }
  }
  // Project techStack entries also count as allowed skills.
  for (const project of source.projects) {
    for (const tech of project.techStack) {
      addFact(facts.skills, tech);
    }
  }

  return facts;
}

/** Result of the no-fabrication post-validation pass. */
export interface NoFabricationResult {
  /** The tailored resume with any fabricated structured facts removed. */
  sanitized: ResumeData;
  /** Human-readable descriptions of every fabrication that was stripped. */
  flagged: string[];
}

/**
 * Enforce the no-fabrication guarantee (Req 4.3) via set comparison.
 *
 * Pure function: given the `source` resume and a `tailored` resume, it walks the
 * tailored structured factual fields and ensures every value is a member of the
 * corresponding source set. Bullet TEXT and the summary are intentionally NOT
 * constrained — rephrasing them is the whole point of tailoring.
 *
 * Fabrications are handled by REMOVING the offending entry (a fabricated
 * experience/education/certification entry is dropped; a fabricated skill or
 * techStack entry is filtered out) and recording a flag string. Structured
 * comparisons are case-insensitive and whitespace-tolerant.
 *
 * Neither `source` nor `tailored` is mutated; a fresh sanitized object is built.
 */
export function enforceNoFabrication(
  source: ResumeData,
  tailored: ResumeData,
): NoFabricationResult {
  const facts = collectAllowedFacts(source);
  const flagged: string[] = [];

  const experience: ExperienceItem[] = [];
  for (const exp of tailored.experience) {
    const reasons: string[] = [];
    if (!has(facts.companies, exp.company)) {
      reasons.push(`company "${exp.company}"`);
    }
    if (!has(facts.titles, exp.title)) {
      reasons.push(`title "${exp.title}"`);
    }
    if (!has(facts.locations, exp.location)) {
      reasons.push(`location "${exp.location}"`);
    }
    if (!has(facts.experienceDates, exp.startDate)) {
      reasons.push(`start date "${exp.startDate}"`);
    }
    if (!has(facts.experienceDates, exp.endDate)) {
      reasons.push(`end date "${exp.endDate}"`);
    }
    if (reasons.length > 0) {
      flagged.push(
        `Removed fabricated experience entry (${reasons.join(', ')}).`,
      );
      continue;
    }
    experience.push({ ...exp, bullets: exp.bullets.map((b) => ({ ...b })) });
  }

  const education: EducationItem[] = [];
  for (const edu of tailored.education) {
    const reasons: string[] = [];
    if (!has(facts.institutions, edu.institution)) {
      reasons.push(`institution "${edu.institution}"`);
    }
    if (!has(facts.degrees, edu.degree)) {
      reasons.push(`degree "${edu.degree}"`);
    }
    if (!has(facts.fields, edu.field)) {
      reasons.push(`field "${edu.field}"`);
    }
    if (!has(facts.educationDates, edu.startDate)) {
      reasons.push(`start date "${edu.startDate}"`);
    }
    if (!has(facts.educationDates, edu.endDate)) {
      reasons.push(`end date "${edu.endDate}"`);
    }
    if (reasons.length > 0) {
      flagged.push(
        `Removed fabricated education entry (${reasons.join(', ')}).`,
      );
      continue;
    }
    education.push({ ...edu });
  }

  const certifications: Certification[] = [];
  for (const cert of tailored.certifications) {
    if (!has(facts.certifications, cert.name)) {
      flagged.push(`Removed fabricated certification "${cert.name}".`);
      continue;
    }
    certifications.push({ ...cert });
  }

  const skills: SkillCategory[] = tailored.skills.map((category) => {
    const kept: string[] = [];
    for (const skill of category.skills) {
      if (has(facts.skills, skill)) {
        kept.push(skill);
      } else {
        flagged.push(`Removed fabricated skill "${skill}".`);
      }
    }
    return { ...category, skills: kept };
  });

  const projects: ProjectItem[] = tailored.projects.map((project) => {
    const keptTech: string[] = [];
    for (const tech of project.techStack) {
      if (has(facts.skills, tech)) {
        keptTech.push(tech);
      } else {
        flagged.push(
          `Removed fabricated tech "${tech}" from project "${project.name}".`,
        );
      }
    }
    return {
      ...project,
      techStack: keptTech,
      bullets: project.bullets.map((b) => ({ ...b })),
    };
  });

  const sanitized: ResumeData = {
    personalInfo: { ...tailored.personalInfo },
    summary: tailored.summary,
    experience,
    education,
    skills,
    projects,
    certifications,
  };

  return { sanitized, flagged };
}

/**
 * Compute the per-bullet diff (Req 4.6) between the source and sanitized
 * tailored resume, matching bullets by their stable id. Only bullets whose text
 * actually changed produce a {@link BulletChange} (all start `accepted: false`).
 */
export function computeBulletChanges(
  source: ResumeData,
  tailored: ResumeData,
): BulletChange[] {
  const changes: BulletChange[] = [];

  const originalById = new Map<string, string>();
  source.experience.forEach((exp) => {
    exp.bullets.forEach((b) => originalById.set(b.id, b.text));
  });
  source.projects.forEach((proj) => {
    proj.bullets.forEach((b) => originalById.set(b.id, b.text));
  });

  tailored.experience.forEach((exp, expIdx) => {
    exp.bullets.forEach((bullet, bulletIdx) => {
      const original = originalById.get(bullet.id);
      if (original !== undefined && original !== bullet.text) {
        changes.push({
          path: `experience.${expIdx}.bullets.${bulletIdx}`,
          original,
          tailored: bullet.text,
          accepted: false,
        });
      }
    });
  });

  tailored.projects.forEach((proj, projIdx) => {
    proj.bullets.forEach((bullet, bulletIdx) => {
      const original = originalById.get(bullet.id);
      if (original !== undefined && original !== bullet.text) {
        changes.push({
          path: `projects.${projIdx}.bullets.${bulletIdx}`,
          original,
          tailored: bullet.text,
          accepted: false,
        });
      }
    });
  });

  return changes;
}

/** The successful payload returned by {@link tailorResume}. */
export interface TailoringResult {
  /** The sanitized tailored resume (fabrications stripped). */
  data: ResumeData;
  /** 0-100 match estimate from the AI. */
  matchScore: number;
  /** JD requirements not addressed by the resume. */
  gaps: string[];
  /** Per-bullet changes for the diff view (all `accepted: false` initially). */
  changes: BulletChange[];
  /** Human-readable descriptions of any fabrications that were stripped. */
  flaggedFabrications?: string[];
}

let idCounter = 0;
function makeId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-tailor-${idCounter}`;
}

/**
 * Backfill stable ids on any tailored sections/bullets the model dropped, so the
 * output satisfies the schema's non-empty id requirement. The prompt asks the
 * model to preserve ids; this is a defensive fallback and never throws.
 */
function backfillIds(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) {
    return raw;
  }
  const data = raw as Record<string, unknown>;

  const withId = <T>(item: T, prefix: string): T => {
    if (typeof item !== 'object' || item === null) return item;
    const obj = item as Record<string, unknown>;
    const existing = obj['id'];
    if (typeof existing !== 'string' || existing.length === 0) {
      obj['id'] = makeId(prefix);
    }
    return item;
  };

  const backfillBullets = (bullets: unknown, prefix: string): unknown => {
    if (!Array.isArray(bullets)) return bullets;
    return bullets.map((b) => withId(b, prefix));
  };

  if (Array.isArray(data['experience'])) {
    data['experience'] = data['experience'].map((exp, i) => {
      const withExpId = withId(exp, 'exp') as Record<string, unknown>;
      if (withExpId && typeof withExpId === 'object') {
        withExpId['bullets'] = backfillBullets(
          withExpId['bullets'],
          `exp-${i}-bullet`,
        );
      }
      return withExpId;
    });
  }

  if (Array.isArray(data['projects'])) {
    data['projects'] = data['projects'].map((proj, i) => {
      const withProjId = withId(proj, 'proj') as Record<string, unknown>;
      if (withProjId && typeof withProjId === 'object') {
        withProjId['bullets'] = backfillBullets(
          withProjId['bullets'],
          `proj-${i}-bullet`,
        );
      }
      return withProjId;
    });
  }

  if (Array.isArray(data['education'])) {
    data['education'] = data['education'].map((edu) => withId(edu, 'edu'));
  }
  if (Array.isArray(data['skills'])) {
    data['skills'] = data['skills'].map((cat) => withId(cat, 'skill'));
  }
  if (Array.isArray(data['certifications'])) {
    data['certifications'] = data['certifications'].map((cert) =>
      withId(cert, 'cert'),
    );
  }

  return data;
}

/** Clamp + round a raw matchScore into the 0-100 integer range. */
function clampScore(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Run the full tailoring pipeline (Req 4.1-4.4).
 *
 * 1. Build + send the tailoring prompt (full resume + JD).
 * 2. Propagate any upstream {@link AiResult} error unchanged.
 * 3. Parse the JSON envelope `{ resume, matchScore, gaps }`.
 * 4. Backfill ids + zod-validate the tailored resume.
 * 5. Enforce no-fabrication (strip + flag fabricated facts) — Req 4.3.
 * 6. Diff bullets against the source for the diff view — Req 4.6.
 *
 * Any malformed/schema-invalid output resolves to `{ ok: false, error: 'parse' }`
 * (never throws) so the caller can keep the base resume unchanged.
 */
export async function tailorResume(
  client: AnthropicClient,
  resume: ResumeData,
  jd: string,
): Promise<AiResult<TailoringResult>> {
  const { system, messages } = buildTailoringPrompt(resume, jd);

  const sendResult = await client.send(messages, system);
  if (!sendResult.ok) {
    return sendResult;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(sendResult.value));
  } catch {
    return {
      ok: false,
      error: 'parse',
      message:
        'The AI returned a response that was not valid JSON. Your base resume was kept unchanged.',
    };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return parseError();
  }
  const envelope = parsed as Record<string, unknown>;

  const matchScore = clampScore(envelope['matchScore']);
  if (matchScore === null) {
    return parseError();
  }

  const rawGaps = envelope['gaps'];
  if (
    !Array.isArray(rawGaps) ||
    !rawGaps.every((g) => typeof g === 'string')
  ) {
    return parseError();
  }
  const gaps = rawGaps as string[];

  const backfilled = backfillIds(envelope['resume']);
  const validation = resumeDataSchema.safeParse(backfilled);
  if (!validation.success) {
    return parseError();
  }

  const { sanitized, flagged } = enforceNoFabrication(resume, validation.data);
  const changes = computeBulletChanges(resume, sanitized);

  return {
    ok: true,
    value: {
      data: sanitized,
      matchScore,
      gaps,
      changes,
      ...(flagged.length > 0 ? { flaggedFabrications: flagged } : {}),
    },
  };
}

function parseError(): AiResult<never> {
  return {
    ok: false,
    error: 'parse',
    message:
      'The AI response did not match the expected tailoring structure. Your base resume was kept unchanged.',
  };
}
