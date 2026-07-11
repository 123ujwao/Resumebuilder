import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
} from 'docx';
import type { ResumeData } from '@resume-forge/core';
import { splitParagraphs } from './coverLetterPdf';

/**
 * Cover-letter DOCX export (Req 5.4).
 *
 * Produces a real Word document (via the `docx` package) with the applicant's
 * name as a heading, a contact line, and the letter body as prose paragraphs.
 * Because it uses genuine Word structure it stays editable in Word — matching
 * the resume DOCX export (features/export/docx.ts) so the letter and resume
 * belong to the same template family (Req 5.4).
 *
 * `buildCoverLetterDocx` returns the docx `Document` model so it can be unit
 * tested without rendering, and `exportCoverLetterDocx` packs it into a Blob.
 */

/** Join contact fields into a single "•"-separated line. */
function contactLine(personalInfo: ResumeData['personalInfo']): string {
  return [
    personalInfo.email,
    personalInfo.phone,
    personalInfo.location,
    personalInfo.linkedin,
    personalInfo.portfolio,
  ]
    .map((v) => v?.trim())
    .filter(Boolean)
    .join('  •  ');
}

/** Build the ordered list of paragraphs for the cover letter document. */
function buildParagraphs(
  letter: string,
  personalInfo: ResumeData['personalInfo'],
): Paragraph[] {
  const children: Paragraph[] = [];

  if (personalInfo.name.trim()) {
    children.push(
      new Paragraph({
        text: personalInfo.name.trim(),
        heading: HeadingLevel.HEADING_1,
      }),
    );
  }

  const contact = contactLine(personalInfo);
  if (contact) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: contact, size: 20 })],
        spacing: { after: 200 },
      }),
    );
  }

  for (const para of splitParagraphs(letter)) {
    children.push(
      new Paragraph({
        text: para,
        spacing: { after: 160 },
      }),
    );
  }

  return children;
}

/**
 * Build the docx {@link Document} object model for a cover letter. Exposed
 * separately from Blob packing so the mapping can be unit tested.
 */
export function buildCoverLetterDocx(
  letter: string,
  personalInfo: ResumeData['personalInfo'],
): Document {
  return new Document({
    creator: 'ResumeForge',
    sections: [
      {
        properties: {},
        children: buildParagraphs(letter, personalInfo),
      },
    ],
  });
}

/** Build a DOCX {@link Blob} for a cover letter (Req 5.4). */
export async function exportCoverLetterDocx(
  letter: string,
  personalInfo: ResumeData['personalInfo'],
): Promise<Blob> {
  const doc = buildCoverLetterDocx(letter, personalInfo);
  return Packer.toBlob(doc);
}
