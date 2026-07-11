import { describe, expect, it } from 'vitest';
import type { ResumeData } from '@resume-forge/core';
import { mapResumeToFields } from './fieldMapping.js';
import type { DetectedField } from './fields.js';

/**
 * Unit tests for the pure label-matching autofill mapper (Req 11.5).
 *
 * These verify that a variety of real-world label spellings map to the correct
 * structured resume value, and that fields with no confident match (or
 * non-fillable kinds) are reported as unmatched for manual review.
 */

function makeResume(overrides: Partial<ResumeData> = {}): ResumeData {
  return {
    personalInfo: {
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '+1 555 0100',
      location: 'London, UK',
      linkedin: 'https://linkedin.com/in/ada',
      portfolio: 'https://ada.dev',
    },
    summary: 'Pioneering programmer.',
    experience: [
      {
        id: 'e1',
        company: 'Analytical Engine Co',
        title: 'Lead Engineer',
        location: 'London',
        startDate: '2020',
        endDate: 'Present',
        bullets: [],
      },
      {
        id: 'e2',
        company: 'Older Co',
        title: 'Junior',
        location: 'London',
        startDate: '2018',
        endDate: '2020',
        bullets: [],
      },
    ],
    education: [
      {
        id: 'ed1',
        institution: 'University of London',
        degree: 'BSc Mathematics',
        field: 'Mathematics',
        startDate: '2014',
        endDate: '2018',
      },
    ],
    skills: [],
    projects: [],
    certifications: [],
    ...overrides,
  };
}

function field(
  key: string,
  label: string,
  kind: DetectedField['kind'] = 'text',
): DetectedField {
  return { key, label, kind };
}

describe('mapResumeToFields — contact fields', () => {
  const resume = makeResume();

  it('maps email label spellings', () => {
    const { values } = mapResumeToFields(resume, [
      field('a', 'Email'),
      field('b', 'Email Address'),
      field('c', 'E-mail', 'email'),
    ]);
    expect(values.a).toBe('ada@example.com');
    expect(values.b).toBe('ada@example.com');
    expect(values.c).toBe('ada@example.com');
  });

  it('maps phone / mobile spellings', () => {
    const { values } = mapResumeToFields(resume, [
      field('a', 'Phone', 'tel'),
      field('b', 'Mobile Number', 'tel'),
      field('c', 'Contact Number'),
    ]);
    expect(values.a).toBe('+1 555 0100');
    expect(values.b).toBe('+1 555 0100');
    expect(values.c).toBe('+1 555 0100');
  });

  it('maps full name and split first/last name', () => {
    const { values } = mapResumeToFields(resume, [
      field('a', 'Full Name'),
      field('b', 'First Name'),
      field('c', 'Last Name'),
      field('d', 'Name'),
    ]);
    expect(values.a).toBe('Ada Lovelace');
    expect(values.b).toBe('Ada');
    expect(values.c).toBe('Lovelace');
    expect(values.d).toBe('Ada Lovelace');
  });

  it('maps linkedin and portfolio/website links', () => {
    const { values } = mapResumeToFields(resume, [
      field('a', 'LinkedIn Profile'),
      field('b', 'Portfolio'),
      field('c', 'Personal Website'),
    ]);
    expect(values.a).toBe('https://linkedin.com/in/ada');
    expect(values.b).toBe('https://ada.dev');
    expect(values.c).toBe('https://ada.dev');
  });

  it('maps location / city / address to location', () => {
    const { values } = mapResumeToFields(resume, [
      field('a', 'Location'),
      field('b', 'City'),
      field('c', 'Current Address'),
    ]);
    expect(values.a).toBe('London, UK');
    expect(values.b).toBe('London, UK');
    expect(values.c).toBe('London, UK');
  });
});

describe('mapResumeToFields — experience & education', () => {
  const resume = makeResume();

  it('maps current title/company from the most recent experience', () => {
    const { values } = mapResumeToFields(resume, [
      field('a', 'Current Job Title'),
      field('b', 'Current Employer'),
      field('c', 'Designation'),
    ]);
    expect(values.a).toBe('Lead Engineer');
    expect(values.b).toBe('Analytical Engine Co');
    expect(values.c).toBe('Lead Engineer');
  });

  it('maps most recent institution and degree', () => {
    const { values } = mapResumeToFields(resume, [
      field('a', 'University'),
      field('b', 'Degree'),
    ]);
    expect(values.a).toBe('University of London');
    expect(values.b).toBe('BSc Mathematics');
  });
});

describe('mapResumeToFields — unmatched reporting', () => {
  const resume = makeResume();

  it('reports fields with no keyword match as unmatched', () => {
    const unknown = field('x', 'How did you hear about us?');
    const { values, unmatched } = mapResumeToFields(resume, [unknown]);
    expect(values).toEqual({});
    expect(unmatched).toEqual([unknown]);
  });

  it('never fills file/select/other controls and reports them unmatched', () => {
    const resumeFile = field('r', 'Resume', 'file');
    const country = field('c', 'Country', 'select');
    const { values, unmatched } = mapResumeToFields(resume, [
      resumeFile,
      country,
    ]);
    expect(values).toEqual({});
    expect(unmatched).toEqual([resumeFile, country]);
  });

  it('reports a matched label as unmatched when the resume value is empty', () => {
    const noLinkedIn = makeResume({
      personalInfo: {
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        phone: '',
        location: '',
        linkedin: '',
        portfolio: '',
      },
    });
    const phone = field('p', 'Phone', 'tel');
    const { values, unmatched } = mapResumeToFields(noLinkedIn, [phone]);
    expect(values).toEqual({});
    expect(unmatched).toEqual([phone]);
  });

  it('does not mistake "Company Name" for the applicant name', () => {
    const { values } = mapResumeToFields(resume, [
      field('a', 'Company Name'),
    ]);
    // Should map to current company, not the person's name.
    expect(values.a).toBe('Analytical Engine Co');
  });
});
