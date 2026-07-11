import { z } from 'zod';
import { resumeDataSchema } from './resume.js';

/**
 * Resume versioning + tailoring metadata.
 *
 * Tailored results are always saved as new versions alongside the base resume,
 * never overwriting it (Req 4.5). BulletChange pairs power the diff view (Req 4.6).
 */

/** A single original-vs-tailored bullet change for the diff view. */
export const bulletChangeSchema = z.object({
  /** Structured path to the changed bullet, e.g. "experience.0.bullets.2". */
  path: z.string(),
  original: z.string(),
  tailored: z.string(),
  accepted: z.boolean(),
});
export type BulletChange = z.infer<typeof bulletChangeSchema>;

/** Metadata attached to a tailored version. */
export const tailoringMetaSchema = z.object({
  jobDescription: z.string(),
  company: z.string().optional(),
  /** 0-100 estimate of how well the resume matches the JD. */
  matchScore: z.number().min(0).max(100),
  /** JD requirements not addressed by the resume, shown as a checklist. */
  gaps: z.array(z.string()),
  /** Per-bullet changes for the diff view. */
  changes: z.array(bulletChangeSchema),
});
export type TailoringMeta = z.infer<typeof tailoringMetaSchema>;

/** The kind of version: the canonical base or a JD-tailored variant. */
export const resumeVersionKindSchema = z.enum(['base', 'tailored']);
export type ResumeVersionKind = z.infer<typeof resumeVersionKindSchema>;

/** A saved resume version (base or tailored). */
export const resumeVersionSchema = z.object({
  id: z.string().min(1),
  /** e.g. "Base Resume" | "Tailored — Acme 2026-07-11" */
  label: z.string(),
  kind: resumeVersionKindSchema,
  data: resumeDataSchema,
  createdAt: z.string(),
  /** Present when kind === 'tailored'. */
  tailoring: tailoringMetaSchema.optional(),
});
export type ResumeVersion = z.infer<typeof resumeVersionSchema>;
