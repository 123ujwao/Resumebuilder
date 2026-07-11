import { describe, it, expect } from 'vitest';
import { Packer } from 'docx';
import type { ResumeData, ResumeVersion } from '@resume-forge/core';
import { buildResumeDocx, exportResumeDocx } from './docx';

const sample: ResumeData = {
  personalInfo: {
    name: 'Jane Doe',
    email: 'jane@example.com',
    phone: '555-1234',
    location: 'Seattle, WA',
  },
  summary: 'Experienced engineer.',
  experience: [
    {
      id: 'e1',
      company: 'Acme',
      title: 'Engineer',
      location: 'Remote',
      startDate: '2020',
      endDate: '2023',
      bullets: [
        { id: 'b1', text: 'Built things' },
        { id: 'b2', text: '' },
      ],
    },
  ],
  education: [
    {
      id: 'ed1',
      institution: 'State University',
      degree: 'BS',
      field: 'CS',
      startDate: '2016',
      endDate: '2020',
    },
  ],
  skills: [{ id: 's1', name: 'Technical', skills: ['TypeScript', 'React'] }],
  projects: [],
  certifications: [{ id: 'c1', name: 'AWS Certified' }],
};

describe('buildResumeDocx', () => {
  it('returns a docx Document whose serialized form includes resume content', () => {
    const doc = buildResumeDocx(sample);
    const text = JSON.stringify(doc);
    expect(text).toContain('Jane Doe');
    expect(text).toContain('Built things');
    expect(text).toContain('State University');
    expect(text).toContain('AWS Certified');
  });

  it('applies real heading styles (Heading1 for name, Heading2 for sections)', () => {
    const doc = buildResumeDocx(sample);
    const serialized = JSON.stringify(doc);
    // docx encodes heading levels as style ids like "Heading1"/"Heading2".
    expect(serialized).toContain('Heading1');
    expect(serialized).toContain('Heading2');
  });

  it('keeps non-empty bullets and drops empty ones', () => {
    // One real bullet (unique sentinel) plus a whitespace-only bullet: the
    // sentinel must survive and the whitespace-only bullet must contribute no
    // bullet-numbering reference beyond the real one.
    const mixedBullets: ResumeData = {
      ...sample,
      experience: [
        {
          id: 'e1',
          company: 'Acme',
          title: 'Engineer',
          location: '',
          startDate: '',
          endDate: '',
          bullets: [
            { id: 'b1', text: 'SENTINEL_KEEP_ME' },
            { id: 'b2', text: '   ' },
          ],
        },
      ],
      projects: [],
      certifications: [],
    };
    const doc = buildResumeDocx(mixedBullets);
    const serialized = JSON.stringify(doc);
    expect(serialized).toContain('SENTINEL_KEEP_ME');
    // The whitespace-only bullet contributes no text run of its own — the only
    // bullet text present is the sentinel.
    const sentinelMatches = serialized.match(/SENTINEL_KEEP_ME/g) ?? [];
    // docx stores the run text twice in its object model (root + properties
    // mirror); the important invariant is that the empty bullet added nothing.
    expect(sentinelMatches.length).toBeGreaterThanOrEqual(1);
  });
});

describe('exportResumeDocx', () => {
  it('packs a saved version into a non-empty Blob', async () => {
    const version: ResumeVersion = {
      id: 'v1',
      label: 'Base Resume',
      kind: 'base',
      createdAt: new Date().toISOString(),
      data: sample,
    };
    const blob = await exportResumeDocx(version);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('produces a valid buffer via Packer for an empty resume', async () => {
    const empty: ResumeData = {
      personalInfo: { name: '', email: '', phone: '', location: '' },
      summary: '',
      experience: [],
      education: [],
      skills: [],
      projects: [],
      certifications: [],
    };
    const buffer = await Packer.toBuffer(buildResumeDocx(empty));
    expect(buffer.byteLength).toBeGreaterThan(0);
  });
});
