import { describe, it, expect } from 'vitest';
import type { ResumeVersion } from '@resume-forge/core';
import { slugify, exportFilename } from './filename';

function version(name: string, label: string): ResumeVersion {
  return {
    id: 'v1',
    label,
    kind: 'base',
    createdAt: new Date().toISOString(),
    data: {
      personalInfo: { name, email: '', phone: '', location: '' },
      summary: '',
      experience: [],
      education: [],
      skills: [],
      projects: [],
      certifications: [],
    },
  };
}

describe('slugify', () => {
  it('lowercases and replaces non-alphanumerics with underscores', () => {
    expect(slugify('Jane Doe')).toBe('jane_doe');
  });

  it('collapses runs and trims underscores', () => {
    expect(slugify('  Hello --- World!!  ')).toBe('hello_world');
  });

  it('strips diacritics', () => {
    expect(slugify('José Núñez')).toBe('jose_nunez');
  });

  it('returns empty string when nothing survives', () => {
    expect(slugify('!!!')).toBe('');
  });
});

describe('exportFilename', () => {
  it('combines name and label with the extension', () => {
    expect(exportFilename(version('Jane Doe', 'Tailored — Acme'), 'pdf')).toBe(
      'jane_doe_tailored_acme.pdf',
    );
  });

  it('uses the docx extension for Word exports', () => {
    expect(exportFilename(version('Jane Doe', 'Base Resume'), 'docx')).toBe(
      'jane_doe_base_resume.docx',
    );
  });

  it('falls back to "resume" when name and label are empty', () => {
    expect(exportFilename(version('', ''), 'pdf')).toBe('resume.pdf');
  });

  it('uses only the label when name is empty', () => {
    expect(exportFilename(version('', 'Base Resume'), 'pdf')).toBe('base_resume.pdf');
  });
});
