import type { ResumeVersion } from '@resume-forge/core';

/**
 * Filename helpers for exported resumes (Task 9, Req 6.3).
 *
 * Filenames are derived from the person's name plus the version label so a user
 * exporting the base resume and several tailored variants gets distinct,
 * human-recognizable files. Everything is sanitized to a filesystem-safe slug.
 */

/**
 * Slugify an arbitrary string into a filesystem-safe token:
 * lowercased, non-alphanumeric runs collapsed to single underscores, and
 * leading/trailing underscores trimmed. Returns '' when nothing survives.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    // Drop diacritic marks so "José" -> "jose".
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Build a download filename for a resume export.
 *
 * @param version   the saved version being exported (its label distinguishes
 *                  base vs tailored variants — Req 6.3).
 * @param extension file extension WITHOUT the dot, e.g. `'pdf'` or `'docx'`.
 * @returns e.g. `"jane_doe_tailored_acme.pdf"`, or `"resume.pdf"` when neither
 *          a name nor a usable label is present.
 */
export function exportFilename(version: ResumeVersion, extension: string): string {
  const namePart = slugify(version.data.personalInfo.name ?? '');
  const labelPart = slugify(version.label ?? '');

  const parts = [namePart, labelPart].filter(Boolean);
  const base = parts.join('_') || 'resume';
  return `${base}.${extension}`;
}
