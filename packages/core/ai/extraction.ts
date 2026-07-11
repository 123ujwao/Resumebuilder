import { resumeDataSchema, type ResumeData } from '../model/resume.js';
import type { AiResult, AnthropicClient, Message } from './types.js';

/**
 * Natural-language resume extraction (Req 2.2, 2.7).
 *
 * `buildExtractionPrompt` produces a strict JSON-only prompt targeting the
 * {@link ResumeData} schema, and `extractResume` runs the full pipeline:
 * send → parse → id backfill → zod-validate. Any parse/schema failure is
 * returned as a typed `parse` {@link AiResult} error (never thrown) so the
 * caller can preserve any existing structured data (Req 2.7).
 */

/**
 * System prompt for extraction.
 *
 * It is explicit about two things:
 * 1. Output ONLY valid JSON matching the ResumeData schema — no markdown
 *    fences, no prose.
 * 2. Structure only what the user wrote; never invent employers, dates,
 *    degrees, or skills the user did not provide (faithful to the input).
 */
export const EXTRACTION_SYSTEM_PROMPT = `You are a resume-parsing assistant for ResumeForge.

Your job: read the user's freeform description of their work experience, education, and skills, and convert it into a single structured JSON object.

Output rules (STRICT):
- Output ONLY valid JSON. No markdown code fences, no backticks, no prose, no explanation before or after.
- The JSON MUST match exactly this schema:

{
  "personalInfo": {
    "name": string,
    "email": string,
    "phone": string,
    "location": string,
    "linkedin"?: string,
    "portfolio"?: string
  },
  "summary": string,
  "experience": [
    {
      "company": string,
      "title": string,
      "location": string,
      "startDate": string,
      "endDate": string,
      "bullets": [{ "text": string }]
    }
  ],
  "education": [
    {
      "institution": string,
      "degree": string,
      "field": string,
      "startDate": string,
      "endDate": string,
      "gpa"?: string
    }
  ],
  "skills": [
    { "name": string, "skills": [string] }
  ],
  "projects": [
    {
      "name": string,
      "description": string,
      "bullets": [{ "text": string }],
      "techStack": [string]
    }
  ],
  "certifications": [
    { "name": string, "issuer"?: string, "date"?: string }
  ]
}

Content rules:
- Do NOT invent facts. Only structure what the user actually wrote. Never fabricate employers, job titles, dates, degrees, or skills that the user did not mention.
- If a field is unknown, use an empty string "" (or omit optional fields). Use empty arrays [] for sections the user did not mention.
- "skills" groups the user's skills into named categories (e.g. "Technical", "Tools", "Soft Skills"). Only categorize skills the user actually listed.
- Do NOT include "id" fields; they are assigned by the application after parsing.`;

/** The prompt payload sent to the Anthropic client for extraction. */
export interface ExtractionPrompt {
  system: string;
  messages: Message[];
}

/**
 * Build the extraction prompt targeting the {@link ResumeData} schema (Req 2.2).
 *
 * The user's freeform text is passed through verbatim as the sole user message;
 * the schema and JSON-only contract live in the system prompt.
 */
export function buildExtractionPrompt(freeformText: string): ExtractionPrompt {
  return {
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Here is my background. Extract it into the JSON schema:\n\n${freeformText}`,
      },
    ],
  };
}

/**
 * Strip accidental markdown code fences from a model response so raw JSON can
 * be parsed. Tolerates ```json / ``` wrappers even though the prompt forbids
 * them, since models sometimes add them anyway.
 */
export function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) {
    return trimmed;
  }
  // Remove the opening fence (optionally with a language tag) and the closing fence.
  return trimmed
    .replace(/^```[^\n]*\n?/, '')
    .replace(/\n?```$/, '')
    .trim();
}

let idCounter = 0;
/** Generate a stable, non-empty id for a backfilled section/bullet. */
function makeId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

/**
 * Assign stable ids to sections/bullets that the model omitted so the parsed
 * object satisfies the schema's non-empty id requirement (the model should not
 * invent ids). Operates defensively on unknown input and never throws.
 */
function backfillIds(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) {
    return raw;
  }
  const data = raw as Record<string, unknown>;

  const withId = <T>(item: T, prefix: string): T => {
    if (typeof item !== 'object' || item === null) {
      return item;
    }
    const obj = item as Record<string, unknown>;
    const existing = obj['id'];
    if (typeof existing !== 'string' || existing.length === 0) {
      obj['id'] = makeId(prefix);
    }
    return item;
  };

  const backfillBullets = (bullets: unknown, prefix: string): unknown => {
    if (!Array.isArray(bullets)) return bullets;
    return bullets.map((b) => withId(b, prefix));
  };

  if (Array.isArray(data['experience'])) {
    data['experience'] = data['experience'].map((exp, i) => {
      const withExpId = withId(exp, 'exp') as Record<string, unknown>;
      if (withExpId && typeof withExpId === 'object') {
        withExpId['bullets'] = backfillBullets(
          withExpId['bullets'],
          `exp-${i}-bullet`,
        );
      }
      return withExpId;
    });
  }

  if (Array.isArray(data['projects'])) {
    data['projects'] = data['projects'].map((proj, i) => {
      const withProjId = withId(proj, 'proj') as Record<string, unknown>;
      if (withProjId && typeof withProjId === 'object') {
        withProjId['bullets'] = backfillBullets(
          withProjId['bullets'],
          `proj-${i}-bullet`,
        );
      }
      return withProjId;
    });
  }

  if (Array.isArray(data['education'])) {
    data['education'] = data['education'].map((edu) => withId(edu, 'edu'));
  }

  if (Array.isArray(data['skills'])) {
    data['skills'] = data['skills'].map((cat) => withId(cat, 'skill'));
  }

  if (Array.isArray(data['certifications'])) {
    data['certifications'] = data['certifications'].map((cert) =>
      withId(cert, 'cert'),
    );
  }

  return data;
}

/**
 * Run the full extraction pipeline (Req 2.2, 2.7).
 *
 * 1. Send the extraction prompt via the client.
 * 2. Propagate any upstream {@link AiResult} error unchanged (no_key/auth/etc).
 * 3. Strip accidental code fences and parse the text as JSON.
 * 4. Backfill stable ids the model omitted.
 * 5. Validate against {@link resumeDataSchema}.
 *
 * Any JSON or schema failure resolves to `{ ok: false, error: 'parse' }` so the
 * caller can keep existing structured data (Req 2.7). Never throws.
 */
export async function extractResume(
  client: AnthropicClient,
  freeformText: string,
): Promise<AiResult<ResumeData>> {
  const { system, messages } = buildExtractionPrompt(freeformText);

  const sendResult = await client.send(messages, system);
  // Req 2.7: propagate upstream errors unchanged so callers preserve state.
  if (!sendResult.ok) {
    return sendResult;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(sendResult.value));
  } catch {
    return {
      ok: false,
      error: 'parse',
      message:
        'The AI returned a response that was not valid JSON. Your existing resume data was kept unchanged.',
    };
  }

  const backfilled = backfillIds(parsed);
  const validation = resumeDataSchema.safeParse(backfilled);
  if (!validation.success) {
    return {
      ok: false,
      error: 'parse',
      message:
        'The AI response did not match the expected resume structure. Your existing resume data was kept unchanged.',
    };
  }

  return { ok: true, value: validation.data };
}
