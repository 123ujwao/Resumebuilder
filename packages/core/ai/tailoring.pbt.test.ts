import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { enforceNoFabrication } from './tailoring.js';
import { resumeDataSchema, type ResumeData } from '../model/resume.js';

/**
 * Property-based tests for the pure no-fabrication enforcement (Task 12.2).
 *
 * The AI is never invoked in tests, so we validate the ENFORCEMENT layer
 * ({@link enforceNoFabrication}) that guarantees the design's tailoring
 * invariants regardless of what the model returns:
 *
 *  - Property 4 (No fabrication invariant, Req 4.3): every structured fact in
 *    the sanitized output (companies, titles, locations, experience dates,
 *    institutions, degrees, fields, education dates, certification names,
 *    skills incl. project techStack) is a SUBSET of the source's facts under
 *    the same trim + case-insensitive normalization the implementation uses.
 *  - Property 5 (Base immutability, Req 4.5): enforcement never mutates its
 *    inputs — the source (and tailored) ResumeData are deep-equal before and
 *    after. Rephrased bullet text survives (rephrasing is allowed).
 */

/** Same normalization the implementation uses: trim + lowercase. */
function normalizeFact(value: string): string {
  return value.trim().toLowerCase();
}

/** A non-fact value is blank/whitespace-only — enforcement always allows it. */
function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

/** Deep clone helper (structural snapshot for mutation checks). */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Fact-like strings. A small pool keeps overlap between source and tailored
 * realistic (so legitimate reuse is exercised, not only fabrication), while
 * still ranging over case/whitespace variants and blanks.
 */
const factWordArb = fc.constantFrom(
  'Acme Corp',
  'Globex',
  'Initech',
  'Engineer',
  'Senior Engineer',
  'Manager',
  'New York',
  'Remote',
  'Berlin',
  '2019',
  '2020',
  'Present',
  'MIT',
  'Stanford',
  'BSc',
  'MSc',
  'Computer Science',
  'Physics',
  'TypeScript',
  'Python',
  'React',
  'AWS Certified',
  'PMP',
);

/** A distinct id generator (unique per resume via counter suffix). */
function uniqueId(prefix: string): fc.Arbitrary<string> {
  return fc
    .integer({ min: 0, max: 1_000_000 })
    .map((n) => `${prefix}-${n}-${Math.random().toString(36).slice(2, 8)}`);
}

const bulletArb = fc.record({
  id: uniqueId('b'),
  text: fc.string({ maxLength: 40 }),
});

const experienceArb = fc.record({
  id: uniqueId('exp'),
  company: factWordArb,
  title: factWordArb,
  location: factWordArb,
  startDate: factWordArb,
  endDate: factWordArb,
  bullets: fc.array(bulletArb, { maxLength: 3 }),
});

const educationArb = fc.record({
  id: uniqueId('edu'),
  institution: factWordArb,
  degree: factWordArb,
  field: factWordArb,
  startDate: factWordArb,
  endDate: factWordArb,
});

const skillCategoryArb = fc.record({
  id: uniqueId('skill'),
  name: fc.string({ maxLength: 12 }),
  skills: fc.array(factWordArb, { maxLength: 4 }),
});

const projectArb = fc.record({
  id: uniqueId('proj'),
  name: fc.string({ maxLength: 12 }),
  description: fc.string({ maxLength: 30 }),
  bullets: fc.array(bulletArb, { maxLength: 3 }),
  techStack: fc.array(factWordArb, { maxLength: 4 }),
});

const certificationArb = fc.record({
  id: uniqueId('cert'),
  name: factWordArb,
});

/** Generates a schema-valid ResumeData with a handful of entries. */
const arbResumeData: fc.Arbitrary<ResumeData> = fc.record({
  personalInfo: fc.record({
    name: fc.string({ maxLength: 20 }),
    email: fc.string({ maxLength: 20 }),
    phone: fc.string({ maxLength: 15 }),
    location: factWordArb,
  }),
  summary: fc.string({ maxLength: 60 }),
  experience: fc.array(experienceArb, { maxLength: 3 }),
  education: fc.array(educationArb, { maxLength: 2 }),
  skills: fc.array(skillCategoryArb, { maxLength: 3 }),
  projects: fc.array(projectArb, { maxLength: 2 }),
  certifications: fc.array(certificationArb, { maxLength: 2 }),
});

/** A value guaranteed NOT to normalize to anything in the fact pool. */
const fabricatedValueArb = fc
  .constantFrom(
    'FabricatedCo-XYZ',
    'GhostTitle-9000',
    'Atlantis',
    '1776',
    'Hogwarts',
    'Sorcery',
    'COBOL-77-unheard',
    'QuantumForge-Cert',
  )
  .map((v) => `${v}-${Math.random().toString(36).slice(2, 6)}`);

/**
 * Describes an optional fabrication injected into a tailored candidate so the
 * property test knows which flag to expect.
 */
interface Fabrication {
  kind: 'company' | 'skill' | 'techStack' | 'certification';
  value: string;
}

/**
 * Derive a "tailored" candidate from a source resume by:
 *  - rephrasing some bullet texts (free-form — must NOT be flagged),
 *  - reordering skills within the first category,
 *  - optionally injecting a tracked fabricated fact.
 */
const arbTailoredFromSource: fc.Arbitrary<{
  source: ResumeData;
  tailored: ResumeData;
  fabrications: Fabrication[];
  rephrasedBullet: { text: string } | null;
}> = arbResumeData.chain((source) =>
  fc
    .record({
      rephrase: fc.string({ maxLength: 40 }),
      doRephrase: fc.boolean(),
      reorderSkills: fc.boolean(),
      injectCompany: fc.option(fabricatedValueArb, { nil: null }),
      injectSkill: fc.option(fabricatedValueArb, { nil: null }),
      injectTech: fc.option(fabricatedValueArb, { nil: null }),
      injectCert: fc.option(fabricatedValueArb, { nil: null }),
    })
    .map((ops) => {
      const tailored = clone(source);
      const fabrications: Fabrication[] = [];
      let rephrasedBullet: { text: string } | null = null;

      // Rephrase the first available bullet (allowed — not a fabrication).
      if (ops.doRephrase) {
        const exp = tailored.experience.find((e) => e.bullets.length > 0);
        if (exp) {
          exp.bullets[0].text = ops.rephrase;
          rephrasedBullet = { text: ops.rephrase };
        }
      }

      // Reorder skills within the first category (allowed).
      if (ops.reorderSkills && tailored.skills[0]?.skills.length > 1) {
        tailored.skills[0].skills = [...tailored.skills[0].skills].reverse();
      }

      // Inject a fabricated company via a brand-new experience entry.
      if (ops.injectCompany !== null) {
        tailored.experience.push({
          id: `exp-fab-${Math.random().toString(36).slice(2, 8)}`,
          company: ops.injectCompany,
          title: 'Engineer',
          location: 'Remote',
          startDate: '2020',
          endDate: 'Present',
          bullets: [],
        });
        fabrications.push({ kind: 'company', value: ops.injectCompany });
      }

      // Inject a fabricated skill into a category (or a new one).
      if (ops.injectSkill !== null) {
        if (tailored.skills[0]) {
          tailored.skills[0].skills.push(ops.injectSkill);
        } else {
          tailored.skills.push({
            id: `skill-fab-${Math.random().toString(36).slice(2, 8)}`,
            name: 'Extra',
            skills: [ops.injectSkill],
          });
        }
        fabrications.push({ kind: 'skill', value: ops.injectSkill });
      }

      // Inject a fabricated techStack entry into a project (or a new one).
      if (ops.injectTech !== null) {
        if (tailored.projects[0]) {
          tailored.projects[0].techStack.push(ops.injectTech);
        } else {
          tailored.projects.push({
            id: `proj-fab-${Math.random().toString(36).slice(2, 8)}`,
            name: 'Extra',
            description: '',
            bullets: [],
            techStack: [ops.injectTech],
          });
        }
        fabrications.push({ kind: 'techStack', value: ops.injectTech });
      }

      // Inject a fabricated certification.
      if (ops.injectCert !== null) {
        tailored.certifications.push({
          id: `cert-fab-${Math.random().toString(36).slice(2, 8)}`,
          name: ops.injectCert,
        });
        fabrications.push({ kind: 'certification', value: ops.injectCert });
      }

      return { source, tailored, fabrications, rephrasedBullet };
    }),
);

// ---------------------------------------------------------------------------
// Fact-set helpers (mirror the implementation's grouping)
// ---------------------------------------------------------------------------

interface FactSets {
  companies: Set<string>;
  titles: Set<string>;
  locations: Set<string>;
  experienceDates: Set<string>;
  institutions: Set<string>;
  degrees: Set<string>;
  fields: Set<string>;
  educationDates: Set<string>;
  certifications: Set<string>;
  skills: Set<string>;
}

function add(set: Set<string>, value: string): void {
  if (!isBlank(value)) set.add(normalizeFact(value));
}

/** Collect the normalized source fact-sets the output must be a subset of. */
function sourceFactSets(source: ResumeData): FactSets {
  const f: FactSets = {
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
  for (const e of source.experience) {
    add(f.companies, e.company);
    add(f.titles, e.title);
    add(f.locations, e.location);
    add(f.experienceDates, e.startDate);
    add(f.experienceDates, e.endDate);
  }
  for (const e of source.education) {
    add(f.institutions, e.institution);
    add(f.degrees, e.degree);
    add(f.fields, e.field);
    add(f.educationDates, e.startDate);
    add(f.educationDates, e.endDate);
  }
  for (const c of source.certifications) add(f.certifications, c.name);
  for (const cat of source.skills) for (const s of cat.skills) add(f.skills, s);
  for (const p of source.projects) for (const t of p.techStack) add(f.skills, t);
  return f;
}

/** Assert every non-blank value in `values` is present in `allowed`. */
function assertSubset(values: string[], allowed: Set<string>, label: string) {
  for (const v of values) {
    if (isBlank(v)) continue;
    expect(
      allowed.has(normalizeFact(v)),
      `${label} "${v}" should be a subset of the source facts`,
    ).toBe(true);
  }
}

// ---------------------------------------------------------------------------
// Property 4: No fabrication invariant (Req 4.3)
// ---------------------------------------------------------------------------

describe('Tailoring PBT — Property 4: No fabrication invariant (Req 4.3)', () => {
  it('sanitized output facts are always a subset of the source facts', () => {
    // **Validates: Requirements 4.3**
    fc.assert(
      fc.property(arbTailoredFromSource, ({ source, tailored }) => {
        const { sanitized } = enforceNoFabrication(source, tailored);
        const facts = sourceFactSets(source);

        // Sanitized must always remain schema-valid.
        expect(resumeDataSchema.safeParse(sanitized).success).toBe(true);

        assertSubset(
          sanitized.experience.map((e) => e.company),
          facts.companies,
          'company',
        );
        assertSubset(
          sanitized.experience.map((e) => e.title),
          facts.titles,
          'title',
        );
        assertSubset(
          sanitized.experience.map((e) => e.location),
          facts.locations,
          'location',
        );
        assertSubset(
          sanitized.experience.flatMap((e) => [e.startDate, e.endDate]),
          facts.experienceDates,
          'experience date',
        );
        assertSubset(
          sanitized.education.map((e) => e.institution),
          facts.institutions,
          'institution',
        );
        assertSubset(
          sanitized.education.map((e) => e.degree),
          facts.degrees,
          'degree',
        );
        assertSubset(
          sanitized.education.map((e) => e.field),
          facts.fields,
          'field',
        );
        assertSubset(
          sanitized.education.flatMap((e) => [e.startDate, e.endDate]),
          facts.educationDates,
          'education date',
        );
        assertSubset(
          sanitized.certifications.map((c) => c.name),
          facts.certifications,
          'certification',
        );
        assertSubset(
          sanitized.skills.flatMap((c) => c.skills),
          facts.skills,
          'skill',
        );
        assertSubset(
          sanitized.projects.flatMap((p) => p.techStack),
          facts.skills,
          'techStack',
        );
      }),
      { numRuns: 300 },
    );
  });

  it('flags any injected fabrication and never leaks its value into sanitized', () => {
    // **Validates: Requirements 4.3**
    fc.assert(
      fc.property(arbTailoredFromSource, ({ source, tailored, fabrications }) => {
        const { sanitized, flagged } = enforceNoFabrication(source, tailored);
        const facts = sourceFactSets(source);

        for (const fab of fabrications) {
          const normalized = normalizeFact(fab.value);
          // A fabricated value is only guaranteed flagged/absent if it does not
          // coincide with a genuine source fact of the same kind.
          switch (fab.kind) {
            case 'company': {
              if (facts.companies.has(normalized)) break;
              expect(flagged.length).toBeGreaterThan(0);
              expect(
                sanitized.experience.some(
                  (e) => normalizeFact(e.company) === normalized,
                ),
              ).toBe(false);
              break;
            }
            case 'skill':
            case 'techStack': {
              if (facts.skills.has(normalized)) break;
              expect(flagged.length).toBeGreaterThan(0);
              expect(
                sanitized.skills.some((c) =>
                  c.skills.some((s) => normalizeFact(s) === normalized),
                ),
              ).toBe(false);
              expect(
                sanitized.projects.some((p) =>
                  p.techStack.some((t) => normalizeFact(t) === normalized),
                ),
              ).toBe(false);
              break;
            }
            case 'certification': {
              if (facts.certifications.has(normalized)) break;
              expect(flagged.length).toBeGreaterThan(0);
              expect(
                sanitized.certifications.some(
                  (c) => normalizeFact(c.name) === normalized,
                ),
              ).toBe(false);
              break;
            }
          }
        }
      }),
      { numRuns: 300 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5: Base immutability (Req 4.5)
// ---------------------------------------------------------------------------

describe('Tailoring PBT — Property 5: Base immutability (Req 4.5)', () => {
  it('does not mutate the source or tailored inputs', () => {
    // **Validates: Requirements 4.5**
    fc.assert(
      fc.property(arbTailoredFromSource, ({ source, tailored }) => {
        const sourceSnapshot = clone(source);
        const tailoredSnapshot = clone(tailored);

        enforceNoFabrication(source, tailored);

        // Byte-identical (deep-equal) before and after — the base is never
        // overwritten by tailoring.
        expect(source).toEqual(sourceSnapshot);
        expect(tailored).toEqual(tailoredSnapshot);
      }),
      { numRuns: 300 },
    );
  });

  it('preserves rephrased bullet text into the sanitized output (rephrasing is allowed)', () => {
    // **Validates: Requirements 4.5**
    fc.assert(
      fc.property(
        arbTailoredFromSource,
        ({ source, tailored, rephrasedBullet }) => {
          const { sanitized } = enforceNoFabrication(source, tailored);
          if (rephrasedBullet === null) return;

          const allBulletTexts = sanitized.experience.flatMap((e) =>
            e.bullets.map((b) => b.text),
          );
          // The free-form rephrased text survives — it is not a fabrication.
          expect(allBulletTexts).toContain(rephrasedBullet.text);
        },
      ),
      { numRuns: 300 },
    );
  });
});
