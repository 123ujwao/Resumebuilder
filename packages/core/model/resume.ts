import { z } from 'zod';

/**
 * Core resume data model for ResumeForge.
 *
 * Every shape is defined as a zod schema first, and the TypeScript type is
 * inferred from it. This guarantees a validator exists for every model shape
 * (Req 2.7) and keeps types and runtime validation in sync.
 *
 * Stable IDs live on bullets and every list section so drag-and-drop reordering
 * and tailoring diffs can track individual items (Req 2.4, 4.6).
 */

/** A single resume bullet. The id enables drag-and-drop + diffing. */
export const bulletSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
});
export type Bullet = z.infer<typeof bulletSchema>;

/** Personal / contact information block. */
export const personalInfoSchema = z.object({
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  location: z.string(),
  linkedin: z.string().optional(),
  portfolio: z.string().optional(),
});
export type PersonalInfo = z.infer<typeof personalInfoSchema>;

/** A single work-experience entry. */
export const experienceItemSchema = z.object({
  id: z.string().min(1),
  company: z.string(),
  title: z.string(),
  location: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  bullets: z.array(bulletSchema),
});
export type ExperienceItem = z.infer<typeof experienceItemSchema>;

/** A categorized group of skills (e.g. Technical, Tools, Soft Skills). */
export const skillCategorySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  skills: z.array(z.string()),
});
export type SkillCategory = z.infer<typeof skillCategorySchema>;

/** A single project entry. */
export const projectItemSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string(),
  bullets: z.array(bulletSchema),
  techStack: z.array(z.string()),
});
export type ProjectItem = z.infer<typeof projectItemSchema>;

/** A single education entry. */
export const educationItemSchema = z.object({
  id: z.string().min(1),
  institution: z.string(),
  degree: z.string(),
  field: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  gpa: z.string().optional(),
});
export type EducationItem = z.infer<typeof educationItemSchema>;

/** A single certification entry. */
export const certificationSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  issuer: z.string().optional(),
  date: z.string().optional(),
});
export type Certification = z.infer<typeof certificationSchema>;

/** The full structured resume. */
export const resumeDataSchema = z.object({
  personalInfo: personalInfoSchema,
  summary: z.string(),
  experience: z.array(experienceItemSchema),
  education: z.array(educationItemSchema),
  skills: z.array(skillCategorySchema),
  projects: z.array(projectItemSchema),
  certifications: z.array(certificationSchema),
});
export type ResumeData = z.infer<typeof resumeDataSchema>;
