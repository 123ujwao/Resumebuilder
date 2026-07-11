import { describe, it, expect } from 'vitest';
import {
  resumeVersionSchema,
  tailoringMetaSchema,
  bulletChangeSchema,
} from './version.js';

const baseData = {
  personalInfo: { name: 'A', email: 'a@b.c', phone: '1', location: 'X' },
  summary: '',
  experience: [],
  education: [],
  skills: [],
  projects: [],
  certifications: [],
};

describe('resumeVersionSchema', () => {
  it('accepts a base version without tailoring', () => {
    const v = {
      id: 'v-1',
      label: 'Base Resume',
      kind: 'base' as const,
      data: baseData,
      createdAt: '2026-01-01',
    };
    expect(resumeVersionSchema.parse(v)).toEqual(v);
  });

  it('accepts a tailored version with tailoring meta', () => {
    const v = {
      id: 'v-2',
      label: 'Tailored — Acme',
      kind: 'tailored' as const,
      data: baseData,
      createdAt: '2026-01-02',
      tailoring: {
        jobDescription: 'JD text',
        matchScore: 80,
        gaps: ['Kubernetes'],
        changes: [],
      },
    };
    expect(resumeVersionSchema.safeParse(v).success).toBe(true);
  });

  it('rejects an invalid kind', () => {
    const v = {
      id: 'v-3',
      label: 'x',
      kind: 'other',
      data: baseData,
      createdAt: '2026-01-03',
    };
    expect(resumeVersionSchema.safeParse(v).success).toBe(false);
  });
});

describe('tailoringMetaSchema', () => {
  it('rejects a matchScore out of the 0-100 range', () => {
    const meta = { jobDescription: '', matchScore: 150, gaps: [], changes: [] };
    expect(tailoringMetaSchema.safeParse(meta).success).toBe(false);
  });

  it('accepts a matchScore within range', () => {
    const meta = { jobDescription: '', matchScore: 0, gaps: [], changes: [] };
    expect(tailoringMetaSchema.safeParse(meta).success).toBe(true);
  });
});

describe('bulletChangeSchema', () => {
  it('requires the accepted flag as a boolean', () => {
    const change = { path: 'experience.0.bullets.0', original: 'a', tailored: 'b' };
    expect(bulletChangeSchema.safeParse(change).success).toBe(false);
  });
});
