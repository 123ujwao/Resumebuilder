import type { ResumeData } from '../model/resume.js';
import type { AiResult, AnthropicClient, Message } from './types.js';

/**
 * Cover letter generation (Req 5.1, 5.2).
 *
 * `buildCoverLetterPrompt` produces a prompt that asks the AI to write a
 * 3-4 paragraph cover letter with a specific structure (opening hook →
 * 1-2 paragraphs connecting the applicant's real resume experience to specific
 * JD requirements → closing call-to-action) in the requested tone.
 * `generateCoverLetter` runs the pipeline and returns the letter as PLAIN TEXT.
 *
 * Unlike extraction/tailoring, the output here is prose, not structured data,
 * so there is no JSON parsing: a non-empty string is success and an empty
 * response is treated as a `parse`/empty error. The no-fabrication principle
 * still applies (the prompt forbids inventing experience the resume lacks), but
 * because the output is free text there is no structured set-comparison pass.
 */

/** The supported cover-letter tones (Req 5.2). */
export type CoverLetterTone = 'formal' | 'conversational' | 'enthusiastic_student';

/** All valid tone values, for iteration/validation. */
export const COVER_LETTER_TONES: readonly CoverLetterTone[] = [
  'formal',
  'conversational',
  'enthusiastic_student',
] as const;

/** Human-readable, generation-shaping guidance for each tone (Req 5.2). */
const TONE_GUIDANCE: Record<CoverLetterTone, string> = {
  formal:
    'Formal: polished, professional, and respectful. Use complete, well-structured sentences and a businesslike register. Avoid slang and contractions.',
  conversational:
    'Conversational: warm, natural, and approachable, as if speaking directly to the hiring manager. Contractions are fine. Still professional, never casual to the point of unprofessional.',
  enthusiastic_student:
    'Enthusiastic-student: energetic and eager, appropriate for a student or early-career applicant. Convey genuine excitement and willingness to learn while remaining grounded in real experience.',
};

/**
 * System prompt for cover-letter generation.
 *
 * It is explicit about:
 * 1. Output PLAIN TEXT only — the finished letter, no JSON, no markdown, no
 *    commentary before/after.
 * 2. The required 3-4 paragraph structure (Req 5.1): opening hook, 1-2 body
 *    paragraphs connecting specific resume experience to specific JD
 *    requirements, and a closing call-to-action.
 * 3. The requested tone (Req 5.2), injected per request.
 * 4. The no-fabrication rule: draw only on the applicant's real resume + JD;
 *    never invent employers, roles, skills, or achievements the resume lacks.
 */
export function buildCoverLetterSystemPrompt(tone: CoverLetterTone): string {
  return `You are a cover-letter writer for ResumeForge.

Your job: given an applicant's structured resume (JSON) and a job description (JD), write a compelling cover letter that connects their real experience to the role.

Output rules (STRICT):
- Output ONLY the finished cover letter as PLAIN TEXT. No JSON, no markdown, no code fences, no bullet points, no headers, and no commentary before or after the letter.
- Do NOT include placeholder tokens like "[Your Name]" or "[Company]". Use the applicant's actual name from the resume, and refer to the company/role using details found in the JD. If a detail is unknown, write naturally without a placeholder.

Structure (STRICT — 3 to 4 paragraphs, Req 5.1):
1. An opening hook that states the role of interest and grabs attention.
2. One or two middle paragraphs that connect SPECIFIC experience, projects, or skills from the applicant's resume to SPECIFIC requirements in the job description.
3. A closing paragraph with a clear call-to-action (e.g., expressing interest in an interview and thanking the reader).

Tone (Req 5.2):
${TONE_GUIDANCE[tone]}

No-fabrication rule (mirrors the rest of ResumeForge):
- Draw ONLY on the experience, skills, education, projects, and achievements present in the applicant's resume and the JD.
- NEVER invent employers, job titles, dates, degrees, certifications, skills, or accomplishments the applicant did not provide. If the JD asks for something the applicant lacks, do not claim it — emphasize genuine, relevant strengths instead.`;
}

/** The prompt payload sent to the Anthropic client for cover-letter generation. */
export interface CoverLetterPrompt {
  system: string;
  messages: Message[];
}

/**
 * Build the cover-letter prompt (Req 5.1, 5.2).
 *
 * The full structured resume and the JD are both sent to the AI so the letter
 * can reference concrete experience and JD requirements. The structure, tone,
 * and no-fabrication contract live in the system prompt; the resume JSON and JD
 * text are passed as the user message.
 */
export function buildCoverLetterPrompt(
  resume: ResumeData,
  jd: string,
  tone: CoverLetterTone,
): CoverLetterPrompt {
  return {
    system: buildCoverLetterSystemPrompt(tone),
    messages: [
      {
        role: 'user',
        content: `Here is my resume as JSON:\n\n${JSON.stringify(
          resume,
          null,
          2,
        )}\n\nHere is the job description I'm applying for:\n\n${jd}\n\nWrite my cover letter following the required 3-4 paragraph structure and tone.`,
      },
    ],
  };
}

/**
 * Run the cover-letter generation pipeline (Req 5.1, 5.2).
 *
 * 1. Build + send the prompt (full resume + JD + tone).
 * 2. Propagate any upstream {@link AiResult} error unchanged.
 * 3. Trim the response. Because the output is prose (not JSON) there is no
 *    schema parsing — a non-empty string is success. An empty/whitespace-only
 *    response is treated as a `parse` error so the UI can surface it.
 *
 * Never throws.
 */
export async function generateCoverLetter(
  client: AnthropicClient,
  resume: ResumeData,
  jd: string,
  tone: CoverLetterTone,
): Promise<AiResult<string>> {
  const { system, messages } = buildCoverLetterPrompt(resume, jd, tone);

  const sendResult = await client.send(messages, system);
  if (!sendResult.ok) {
    return sendResult;
  }

  const letter = sendResult.value.trim();
  if (letter.length === 0) {
    return {
      ok: false,
      error: 'parse',
      message:
        'The AI returned an empty cover letter. Please try again.',
    };
  }

  return { ok: true, value: letter };
}
