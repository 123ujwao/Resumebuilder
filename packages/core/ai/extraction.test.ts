import { describe, it, expect, vi } from 'vitest';
import {
  EXTRACTION_SYSTEM_PROMPT,
  buildExtractionPrompt,
  extractResume,
  stripCodeFences,
} from './extraction.js';
import { resumeDataSchema } from '../model/resume.js';
import type { AiResult, AnthropicClient } from './types.js';

/**
 * Build a mock AnthropicClient whose `send` resolves to a fixed result.
 * Captures the last (messages, system) it was called with.
 */
function mockClient(result: AiResult<string>): {
  client: AnthropicClient;
  send: ReturnType<typeof vi.fn>;
} {
  const send = vi.fn(async () => result);
  return { client: { send } as unknown as AnthropicClient, send };
}

/** A minimal valid ResumeData JSON object (no ids — pipeline backfills them). */
const validExtraction = {
  personalInfo: {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: '555-0100',
    location: 'London',
  },
  summary: 'Analytical engine pioneer.',
  experience: [
    {
      company: 'Analytical Engine Co',
      title: 'Mathematician',
      location: 'London',
      startDate: '1842',
      endDate: '1843',
      bullets: [{ text: 'Wrote the first algorithm.' }],
    },
  ],
  education: [
    {
      institution: 'Private Tutoring',
      degree: 'Mathematics',
      field: 'Mathematics',
      startDate: '1830',
      endDate: '1835',
    },
  ],
  skills: [{ name: 'Technical', skills: ['Mathematics', 'Logic'] }],
  projects: [
    {
      name: 'Note G',
      description: 'Bernoulli number algorithm',
      bullets: [{ text: 'Designed the computation.' }],
      techStack: ['Analytical Engine'],
    },
  ],
  certifications: [{ name: 'Honorary Fellow' }],
};

describe('buildExtractionPrompt', () => {
  it('includes the JSON-only instruction in the system prompt', () => {
    const { system } = buildExtractionPrompt('some text');
    expect(system).toContain('Output ONLY valid JSON');
    expect(system).toContain('No markdown code fences');
  });

  it('mentions every top-level ResumeData schema field', () => {
    const { system } = buildExtractionPrompt('some text');
    for (const field of [
      'personalInfo',
      'summary',
      'experience',
      'education',
      'skills',
      'projects',
      'certifications',
    ]) {
      expect(system).toContain(field);
    }
  });

  it('mentions key nested fields from the schema', () => {
    const { system } = buildExtractionPrompt('some text');
    for (const field of [
      'linkedin',
      'portfolio',
      'company',
      'title',
      'startDate',
      'endDate',
      'institution',
      'degree',
      'techStack',
      'issuer',
    ]) {
      expect(system).toContain(field);
    }
  });

  it('instructs the model not to fabricate content', () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('Do NOT invent facts');
  });

  it('passes the freeform text through as the user message', () => {
    const { messages } = buildExtractionPrompt('I worked at Acme.');
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toContain('I worked at Acme.');
  });
});

describe('stripCodeFences', () => {
  it('leaves bare JSON untouched', () => {
    expect(stripCodeFences('{"a":1}')).toBe('{"a":1}');
  });

  it('strips ```json fences', () => {
    expect(stripCodeFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('strips bare ``` fences', () => {
    expect(stripCodeFences('```\n{"a":1}\n```')).toBe('{"a":1}');
  });
});

describe('extractResume pipeline', () => {
  it('returns ok with validated data on valid JSON and backfills ids', async () => {
    const { client, send } = mockClient({
      ok: true,
      value: JSON.stringify(validExtraction),
    });

    const result = await extractResume(client, 'my background');

    expect(send).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Schema requires non-empty ids everywhere.
      expect(resumeDataSchema.safeParse(result.value).success).toBe(true);
      expect(result.value.experience[0].id.length).toBeGreaterThan(0);
      expect(result.value.experience[0].bullets[0].id.length).toBeGreaterThan(0);
      expect(result.value.projects[0].id.length).toBeGreaterThan(0);
      expect(result.value.projects[0].bullets[0].id.length).toBeGreaterThan(0);
      expect(result.value.education[0].id.length).toBeGreaterThan(0);
      expect(result.value.skills[0].id.length).toBeGreaterThan(0);
      expect(result.value.certifications[0].id.length).toBeGreaterThan(0);
      // Content is preserved, not fabricated.
      expect(result.value.personalInfo.name).toBe('Ada Lovelace');
      expect(result.value.experience[0].company).toBe('Analytical Engine Co');
    }
  });

  it('tolerates JSON wrapped in markdown code fences', async () => {
    const { client } = mockClient({
      ok: true,
      value: '```json\n' + JSON.stringify(validExtraction) + '\n```',
    });

    const result = await extractResume(client, 'my background');

    expect(result.ok).toBe(true);
  });

  it('preserves existing ids when the model supplies them', async () => {
    const withIds = {
      ...validExtraction,
      experience: [{ ...validExtraction.experience[0], id: 'exp-keep' }],
    };
    const { client } = mockClient({ ok: true, value: JSON.stringify(withIds) });

    const result = await extractResume(client, 'my background');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.experience[0].id).toBe('exp-keep');
    }
  });

  it('returns a parse error on malformed JSON', async () => {
    const { client } = mockClient({ ok: true, value: 'not json at all {' });

    const result = await extractResume(client, 'my background');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('parse');
  });

  it('returns a parse error on schema-invalid JSON', async () => {
    // Valid JSON, but missing required sections / wrong shapes.
    const { client } = mockClient({
      ok: true,
      value: JSON.stringify({ personalInfo: { name: 'X' } }),
    });

    const result = await extractResume(client, 'my background');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('parse');
  });

  it('propagates a no_key upstream error unchanged', async () => {
    const upstream: AiResult<string> = {
      ok: false,
      error: 'no_key',
      message: 'No key',
    };
    const { client } = mockClient(upstream);

    const result = await extractResume(client, 'my background');

    expect(result).toEqual(upstream);
  });

  it('propagates auth / rate_limit / network errors unchanged', async () => {
    for (const error of ['auth', 'rate_limit', 'network'] as const) {
      const upstream: AiResult<string> = {
        ok: false,
        error,
        message: `err-${error}`,
      };
      const { client } = mockClient(upstream);

      const result = await extractResume(client, 'my background');

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe(error);
    }
  });
});
