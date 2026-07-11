import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  bulletSchema,
  resumeDataSchema,
  experienceItemSchema,
  type ResumeData,
} from './resume.js';

const validResume: ResumeData = {
  personalInfo: {
    name: 'Jane Doe',
    email: 'jane@example.com',
    phone: '555-1234',
    location: 'Remote',
  },
  summary: 'Experienced engineer.',
  experience: [
    {
      id: 'exp-1',
      company: 'Acme',
      title: 'Engineer',
      location: 'Remote',
      startDate: '2020',
      endDate: '2024',
      bullets: [{ id: 'b-1', text: 'Built things' }],
    },
  ],
  education: [
    {
      id: 'edu-1',
      institution: 'State University',
      degree: 'BSc',
      field: 'Computer Science',
      startDate: '2016',
      endDate: '2020',
    },
  ],
  skills: [{ id: 'sk-1', name: 'Technical', skills: ['TypeScript', 'React'] }],
  projects: [
    {
      id: 'proj-1',
      name: 'Side Project',
      description: 'A thing',
      bullets: [{ id: 'pb-1', text: 'Did work' }],
      techStack: ['Node'],
    },
  ],
  certifications: [{ id: 'cert-1', name: 'AWS' }],
};

describe('resumeDataSchema', () => {
  it('accepts a fully valid resume', () => {
    expect(resumeDataSchema.parse(validResume)).toEqual(validResume);
  });

  it('rejects a resume missing required personalInfo fields', () => {
    const bad = { ...validResume, personalInfo: { name: 'x' } };
    expect(resumeDataSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a bullet with an empty id', () => {
    expect(bulletSchema.safeParse({ id: '', text: 'hi' }).success).toBe(false);
  });

  it('keeps optional fields optional', () => {
    const withoutOptional = { ...validResume };
    delete (withoutOptional.personalInfo as { linkedin?: string }).linkedin;
    expect(resumeDataSchema.safeParse(withoutOptional).success).toBe(true);
  });

  it('rejects malformed AI JSON (wrong types)', () => {
    const malformed = { ...validResume, experience: 'not-an-array' };
    expect(resumeDataSchema.safeParse(malformed).success).toBe(false);
  });
});

describe('experienceItemSchema', () => {
  it('requires a stable non-empty id', () => {
    const bad = { ...validResume.experience[0], id: '' };
    expect(experienceItemSchema.safeParse(bad).success).toBe(false);
  });
});

describe('resumeDataSchema property: round-trip', () => {
  const bulletArb = fc.record({
    id: fc.string({ minLength: 1 }),
    text: fc.string(),
  });

  const resumeArb: fc.Arbitrary<ResumeData> = fc.record({
    personalInfo: fc.record({
      name: fc.string(),
      email: fc.string(),
      phone: fc.string(),
      location: fc.string(),
      linkedin: fc.option(fc.string(), { nil: undefined }),
      portfolio: fc.option(fc.string(), { nil: undefined }),
    }),
    summary: fc.string(),
    experience: fc.array(
      fc.record({
        id: fc.string({ minLength: 1 }),
        company: fc.string(),
        title: fc.string(),
        location: fc.string(),
        startDate: fc.string(),
        endDate: fc.string(),
        bullets: fc.array(bulletArb),
      }),
    ),
    education: fc.array(
      fc.record({
        id: fc.string({ minLength: 1 }),
        institution: fc.string(),
        degree: fc.string(),
        field: fc.string(),
        startDate: fc.string(),
        endDate: fc.string(),
        gpa: fc.option(fc.string(), { nil: undefined }),
      }),
    ),
    skills: fc.array(
      fc.record({
        id: fc.string({ minLength: 1 }),
        name: fc.string(),
        skills: fc.array(fc.string()),
      }),
    ),
    projects: fc.array(
      fc.record({
        id: fc.string({ minLength: 1 }),
        name: fc.string(),
        description: fc.string(),
        bullets: fc.array(bulletArb),
        techStack: fc.array(fc.string()),
      }),
    ),
    certifications: fc.array(
      fc.record({
        id: fc.string({ minLength: 1 }),
        name: fc.string(),
        issuer: fc.option(fc.string(), { nil: undefined }),
        date: fc.option(fc.string(), { nil: undefined }),
      }),
    ),
  });

  it('parses any well-formed ResumeData without loss', () => {
    fc.assert(
      fc.property(resumeArb, (resume) => {
        const parsed = resumeDataSchema.parse(resume);
        expect(parsed).toEqual(resume);
      }),
    );
  });
});
