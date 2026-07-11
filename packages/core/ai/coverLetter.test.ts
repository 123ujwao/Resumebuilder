import { describe, it, expect, vi } from 'vitest';
import {
  COVER_LETTER_TONES,
  buildCoverLetterSystemPrompt,
  buildCoverLetterPrompt,
  generateCoverLetter,
  type CoverLetterTone,
} from './coverLetter.js';
import type { ResumeData } from '../model/resume.js';
import type { AiResult, AnthropicClient } from './types.js';

/**
 * Tests for the cover letter generator (Req 5.1, 5.2).
 *
 * - buildCoverLetterPrompt includes the tone guidance, the 3-4 paragraph
 *   structure guidance, and both the resume and the JD.
 * - generateCoverLetter returns the trimmed letter text on success, propagates
 *   upstream errors unchanged, and treats an empty response as a parse error.
 */

function mockClient(result: AiResult<string>): {
  client: AnthropicClient;
  send: ReturnType<typeof vi.fn>;
} {
  const send = vi.fn(async () => result);
  return { client: { send } as unknown as AnthropicClient, send };
}

const resume: ResumeData = {
  personalInfo: {
    name: 'Grace Hopper',
    email: 'grace@example.com',
    phone: '555-0100',
    location: 'New York',
  },
  summary: 'Compiler pioneer and systems programmer.',
  experience: [
    {
      id: 'exp-1',
      company: 'US Navy',
      title: 'Rear Admiral',
      location: 'Washington',
      startDate: '1943',
      endDate: '1986',
      bullets: [{ id: 'b-1', text: 'Developed the first compiler.' }],
    },
  ],
  education: [],
  skills: [{ id: 'skill-1', name: 'Technical', skills: ['COBOL'] }],
  projects: [],
  certifications: [],
};

describe('buildCoverLetterSystemPrompt', () => {
  it('describes the required 3-4 paragraph structure (Req 5.1)', () => {
    const system = buildCoverLetterSystemPrompt('formal');
    expect(system).toContain('3 to 4 paragraphs');
    expect(system.toLowerCase()).toContain('opening hook');
    expect(system.toLowerCase()).toContain('call-to-action');
    // Body paragraphs connect specific resume experience to specific JD needs.
    expect(system.toLowerCase()).toContain('job description');
    expect(system.toLowerCase()).toContain('specific');
  });

  it('instructs plain-text (no JSON) output', () => {
    const system = buildCoverLetterSystemPrompt('formal');
    expect(system.toLowerCase()).toContain('plain text');
    expect(system).toContain('No JSON');
  });

  it('enforces the no-fabrication rule', () => {
    const system = buildCoverLetterSystemPrompt('formal');
    expect(system).toContain('NEVER invent');
  });

  it.each(COVER_LETTER_TONES)('injects distinct guidance for tone %s', (tone) => {
    const system = buildCoverLetterSystemPrompt(tone);
    const marker: Record<CoverLetterTone, string> = {
      formal: 'Formal:',
      conversational: 'Conversational:',
      enthusiastic_student: 'Enthusiastic-student:',
    };
    expect(system).toContain(marker[tone]);
  });

  it('produces different prompts for different tones (Req 5.2)', () => {
    const formal = buildCoverLetterSystemPrompt('formal');
    const conversational = buildCoverLetterSystemPrompt('conversational');
    const student = buildCoverLetterSystemPrompt('enthusiastic_student');
    expect(formal).not.toBe(conversational);
    expect(conversational).not.toBe(student);
    expect(formal).not.toBe(student);
  });
});

describe('buildCoverLetterPrompt', () => {
  it('sends both the resume JSON and the JD in the user message (Req 5.1)', () => {
    const { messages } = buildCoverLetterPrompt(
      resume,
      'Seeking a COBOL expert.',
      'formal',
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toContain('Grace Hopper');
    expect(messages[0].content).toContain('Seeking a COBOL expert.');
  });

  it('applies the requested tone to the system prompt (Req 5.2)', () => {
    const { system } = buildCoverLetterPrompt(resume, 'a jd', 'enthusiastic_student');
    expect(system).toContain('Enthusiastic-student:');
  });
});

describe('generateCoverLetter', () => {
  it('returns the trimmed letter text on success', async () => {
    const letter =
      'Dear Hiring Manager,\n\nI am excited to apply...\n\nSincerely,\nGrace';
    const { client, send } = mockClient({ ok: true, value: `  ${letter}  \n` });

    const result = await generateCoverLetter(client, resume, 'JD text', 'formal');

    expect(send).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(letter);
  });

  it('passes the tone-specific system prompt to the client (Req 5.2)', async () => {
    const { client, send } = mockClient({ ok: true, value: 'A letter.' });

    await generateCoverLetter(client, resume, 'JD text', 'conversational');

    const [, system] = send.mock.calls[0];
    expect(system).toContain('Conversational:');
  });

  it('treats an empty response as a parse error', async () => {
    const { client } = mockClient({ ok: true, value: '   \n  ' });

    const result = await generateCoverLetter(client, resume, 'JD text', 'formal');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('parse');
  });

  it('propagates upstream errors unchanged', async () => {
    for (const error of ['no_key', 'auth', 'rate_limit', 'network'] as const) {
      const upstream: AiResult<string> = {
        ok: false,
        error,
        message: `err-${error}`,
      };
      const { client } = mockClient(upstream);

      const result = await generateCoverLetter(client, resume, 'JD text', 'formal');

      expect(result).toEqual(upstream);
    }
  });
});
