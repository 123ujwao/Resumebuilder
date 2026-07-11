import { describe, it, expect } from 'vitest';
import { Packer } from 'docx';
import type { ResumeData } from '@resume-forge/core';
import { buildCoverLetterDocx, exportCoverLetterDocx } from './coverLetterDocx';
import { splitParagraphs } from './coverLetterPdf';

/**
 * Unit tests for the cover-letter exporters (Req 5.4).
 *
 * The PDF path is exercised via the panel test (mocked), so here we test the
 * pure helpers: paragraph splitting and the DOCX object-model builder, which
 * runs deterministically without a rendering engine.
 */

const personalInfo: ResumeData['personalInfo'] = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: '555-0000',
  location: 'London',
};

const LETTER = 'Dear Hiring Manager,\n\nI am a great fit.\n\nSincerely,\nAda';

describe('splitParagraphs', () => {
  it('splits on blank lines and trims each paragraph', () => {
    expect(splitParagraphs(LETTER)).toEqual([
      'Dear Hiring Manager,',
      'I am a great fit.',
      'Sincerely,\nAda',
    ]);
  });

  it('collapses multiple blank lines and drops empties', () => {
    expect(splitParagraphs('One.\n\n\n\nTwo.\n\n   ')).toEqual(['One.', 'Two.']);
  });

  it('normalizes CRLF line endings', () => {
    expect(splitParagraphs('A.\r\n\r\nB.')).toEqual(['A.', 'B.']);
  });
});

describe('buildCoverLetterDocx', () => {
  it('includes the applicant name, contact line, and letter body', () => {
    const doc = buildCoverLetterDocx(LETTER, personalInfo);
    const serialized = JSON.stringify(doc);
    expect(serialized).toContain('Ada Lovelace');
    expect(serialized).toContain('ada@example.com');
    expect(serialized).toContain('I am a great fit.');
  });

  it('applies a real Heading1 style for the name', () => {
    const doc = buildCoverLetterDocx(LETTER, personalInfo);
    expect(JSON.stringify(doc)).toContain('Heading1');
  });
});

describe('exportCoverLetterDocx', () => {
  it('packs the letter into a non-empty Blob', async () => {
    const blob = await exportCoverLetterDocx(LETTER, personalInfo);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('produces a valid buffer for an empty letter', async () => {
    const buffer = await Packer.toBuffer(buildCoverLetterDocx('', personalInfo));
    expect(buffer.byteLength).toBeGreaterThan(0);
  });
});
