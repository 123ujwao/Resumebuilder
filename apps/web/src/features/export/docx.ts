import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from 'docx';
import type { ResumeData, ResumeVersion } from '@resume-forge/core';
import { visibleSections, dateRange, nonEmptyBullets } from '../templates/sections';

/**
 * DOCX export (Task 9, Req 6.2).
 *
 * Maps {@link ResumeData} to a real Word document using the `docx` package with
 * proper heading styles (Heading1 for the name, Heading2 for each section) and
 * bullet-list paragraphs. Because it uses genuine Word structure — not text
 * boxes or tables — the result stays editable in Word and is ATS-parseable
 * (Req 6.2).
 *
 * `buildResumeDocx` returns the docx `Document` object model so it can be unit
 * tested without rendering, and `resumeDataToDocxBlob` packs it into a Blob for
 * download.
 */

/** Join contact fields into a single "•"-separated line. */
function contactLine(data: ResumeData): string {
  const p = data.personalInfo;
  return [p.email, p.phone, p.location, p.linkedin, p.portfolio]
    .map((v) => v?.trim())
    .filter(Boolean)
    .join('  •  ');
}

/** A section heading paragraph (real Word Heading2 style). */
function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 80 },
  });
}

/** A bullet-list paragraph using Word's native bullet numbering. */
function bulletParagraph(text: string): Paragraph {
  return new Paragraph({
    text,
    bullet: { level: 0 },
  });
}

/** Build the ordered list of paragraphs that make up the document body. */
function buildParagraphs(data: ResumeData): Paragraph[] {
  const s = visibleSections(data);
  const p = data.personalInfo;
  const children: Paragraph[] = [];

  // Name as the document title (Heading1).
  if (p.name.trim()) {
    children.push(
      new Paragraph({
        text: p.name.trim(),
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
      }),
    );
  }

  const contact = contactLine(data);
  if (contact) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: contact, size: 20 })],
      }),
    );
  }

  if (s.hasSummary) {
    children.push(sectionHeading('Summary'));
    children.push(new Paragraph({ text: data.summary.trim() }));
  }

  if (s.experience.length > 0) {
    children.push(sectionHeading('Experience'));
    for (const exp of s.experience) {
      const title = [exp.title, exp.company].filter((v) => v.trim()).join(', ');
      const range = dateRange(exp.startDate, exp.endDate);
      children.push(
        new Paragraph({
          spacing: { before: 120 },
          children: [
            new TextRun({ text: title, bold: true }),
            ...(range ? [new TextRun({ text: `   ${range}` })] : []),
          ],
        }),
      );
      if (exp.location.trim()) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: exp.location.trim(), italics: true })],
          }),
        );
      }
      for (const b of nonEmptyBullets(exp.bullets)) {
        children.push(bulletParagraph(b.text));
      }
    }
  }

  if (s.projects.length > 0) {
    children.push(sectionHeading('Projects'));
    for (const proj of s.projects) {
      children.push(
        new Paragraph({
          spacing: { before: 120 },
          children: [new TextRun({ text: proj.name.trim(), bold: true })],
        }),
      );
      if (proj.description.trim()) {
        children.push(new Paragraph({ text: proj.description.trim() }));
      }
      for (const b of nonEmptyBullets(proj.bullets)) {
        children.push(bulletParagraph(b.text));
      }
      const tech = proj.techStack.filter((t) => t.trim());
      if (tech.length > 0) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: 'Tech: ', bold: true }),
              new TextRun({ text: tech.join(', ') }),
            ],
          }),
        );
      }
    }
  }

  if (s.education.length > 0) {
    children.push(sectionHeading('Education'));
    for (const edu of s.education) {
      const range = dateRange(edu.startDate, edu.endDate);
      children.push(
        new Paragraph({
          spacing: { before: 120 },
          children: [
            new TextRun({ text: edu.institution.trim(), bold: true }),
            ...(range ? [new TextRun({ text: `   ${range}` })] : []),
          ],
        }),
      );
      const detail = [edu.degree, edu.field].filter((v) => v.trim()).join(', ');
      const gpa = edu.gpa?.trim() ? `  •  GPA: ${edu.gpa.trim()}` : '';
      if (detail || gpa) {
        children.push(new Paragraph({ text: `${detail}${gpa}` }));
      }
    }
  }

  if (s.skills.length > 0) {
    children.push(sectionHeading('Skills'));
    for (const cat of s.skills) {
      const skills = cat.skills.filter((sk) => sk.trim()).join(', ');
      children.push(
        new Paragraph({
          children: [
            ...(cat.name.trim()
              ? [new TextRun({ text: `${cat.name.trim()}: `, bold: true })]
              : []),
            new TextRun({ text: skills }),
          ],
        }),
      );
    }
  }

  if (s.certifications.length > 0) {
    children.push(sectionHeading('Certifications'));
    for (const cert of s.certifications) {
      const issuer = cert.issuer?.trim() ? ` — ${cert.issuer.trim()}` : '';
      const date = cert.date?.trim() ? ` (${cert.date.trim()})` : '';
      children.push(bulletParagraph(`${cert.name}${issuer}${date}`));
    }
  }

  return children;
}

/**
 * Build the docx {@link Document} object model for a resume. Exposed separately
 * from Blob packing so the mapping can be unit tested deterministically.
 */
export function buildResumeDocx(data: ResumeData): Document {
  return new Document({
    creator: 'ResumeForge',
    sections: [
      {
        properties: {},
        children: buildParagraphs(data),
      },
    ],
  });
}

/** Build a DOCX {@link Blob} for a saved resume version (Req 6.2, 6.3). */
export async function exportResumeDocx(version: ResumeVersion): Promise<Blob> {
  const doc = buildResumeDocx(version.data);
  return Packer.toBlob(doc);
}
