import { describe, it, expect, vi } from 'vitest';
import {
  TAILORING_SYSTEM_PROMPT,
  buildTailoringPrompt,
  enforceNoFabrication,
  computeBulletChanges,
  tailorResume,
} from './tailoring.js';
import { resumeDataSchema, type ResumeData } from '../model/resume.js';
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

/** A fully-formed, valid source resume with stable ids. */
const source: ResumeData = {
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
      bullets: [
        { id: 'b-1', text: 'Developed the first compiler.' },
        { id: 'b-2', text: 'Coined the term debugging.' },
      ],
    },
  ],
  education: [
    {
      id: 'edu-1',
      institution: 'Yale University',
      degree: 'PhD',
      field: 'Mathematics',
      startDate: '1930',
      endDate: '1934',
    },
  ],
  skills: [
    { id: 'skill-1', name: 'Technical', skills: ['COBOL', 'Compilers'] },
  ],
  projects: [
    {
      id: 'proj-1',
      name: 'FLOW-MATIC',
      description: 'English-like data processing language.',
      bullets: [{ id: 'pb-1', text: 'Designed the language.' }],
      techStack: ['UNIVAC'],
    },
  ],
  certifications: [{ id: 'cert-1', name: 'Presidential Medal of Freedom' }],
};

/** Deep clone helper so tests never share mutable references. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('buildTailoringPrompt', () => {
  it('forbids fabrication of employers/dates/degrees/skills in the system prompt', () => {
    const { system } = buildTailoringPrompt(source, 'a jd');
    expect(system).toContain('no-fabrication');
    expect(system).toContain('NEVER invent');
    for (const word of ['employers', 'titles', 'dates', 'degrees', 'skills']) {
      expect(system.toLowerCase()).toContain(word);
    }
  });

  it('requests matchScore and gaps in the output shape', () => {
    const { system } = buildTailoringPrompt(source, 'a jd');
    expect(system).toContain('matchScore');
    expect(system).toContain('gaps');
  });

  it('describes the allowed tailoring behaviour (reorder/re-weight/rephrase)', () => {
    const { system } = buildTailoringPrompt(source, 'a jd');
    expect(system.toLowerCase()).toContain('reorder');
    expect(system.toLowerCase()).toContain('re-weight');
    expect(system.toLowerCase()).toContain('rephrase');
  });

  it('sends both the resume JSON and the JD in the user message (Req 4.1)', () => {
    const { messages } = buildTailoringPrompt(source, 'Seeking a COBOL expert.');
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toContain('Grace Hopper');
    expect(messages[0].content).toContain('Seeking a COBOL expert.');
  });
});

describe('enforceNoFabrication', () => {
  it('passes legitimate rephrasing/reordering through unchanged', () => {
    const tailored = clone(source);
    // Rephrase bullet text + reorder skills — all facts unchanged.
    tailored.summary = 'Pioneering compiler and systems engineer.';
    tailored.experience[0].bullets = [
      { id: 'b-2', text: 'Coined the industry term "debugging".' },
      { id: 'b-1', text: 'Built one of the first working compilers.' },
    ];
    tailored.skills[0].skills = ['Compilers', 'COBOL'];

    const { sanitized, flagged } = enforceNoFabrication(source, tailored);

    expect(flagged).toEqual([]);
    expect(sanitized.experience).toHaveLength(1);
    expect(sanitized.experience[0].company).toBe('US Navy');
    expect(sanitized.skills[0].skills).toEqual(['Compilers', 'COBOL']);
    expect(resumeDataSchema.safeParse(sanitized).success).toBe(true);
  });

  it('is not fooled by case or whitespace differences on facts', () => {
    const tailored = clone(source);
    tailored.experience[0].company = '  us navy  ';
    tailored.skills[0].skills = ['cobol', '  COMPILERS'];
    tailored.education[0].degree = 'phd';

    const { sanitized, flagged } = enforceNoFabrication(source, tailored);

    expect(flagged).toEqual([]);
    expect(sanitized.experience).toHaveLength(1);
    expect(sanitized.skills[0].skills).toEqual(['cobol', '  COMPILERS']);
    expect(sanitized.education).toHaveLength(1);
  });

  it('strips and flags a fabricated employer', () => {
    const tailored = clone(source);
    tailored.experience.push({
      id: 'exp-fake',
      company: 'Google',
      title: 'Rear Admiral',
      location: 'Washington',
      startDate: '1943',
      endDate: '1986',
      bullets: [{ id: 'bf-1', text: 'Invented search.' }],
    });

    const { sanitized, flagged } = enforceNoFabrication(source, tailored);

    expect(sanitized.experience).toHaveLength(1);
    expect(sanitized.experience[0].company).toBe('US Navy');
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toContain('Google');
  });

  it('strips and flags a fabricated degree', () => {
    const tailored = clone(source);
    tailored.education[0].degree = 'MBA';

    const { sanitized, flagged } = enforceNoFabrication(source, tailored);

    expect(sanitized.education).toHaveLength(0);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toContain('MBA');
  });

  it('strips and flags a fabricated skill but keeps legitimate ones', () => {
    const tailored = clone(source);
    tailored.skills[0].skills = ['COBOL', 'Rust', 'Compilers'];

    const { sanitized, flagged } = enforceNoFabrication(source, tailored);

    expect(sanitized.skills[0].skills).toEqual(['COBOL', 'Compilers']);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toContain('Rust');
  });

  it('strips a fabricated techStack entry from a project', () => {
    const tailored = clone(source);
    tailored.projects[0].techStack = ['UNIVAC', 'Kubernetes'];

    const { sanitized, flagged } = enforceNoFabrication(source, tailored);

    expect(sanitized.projects[0].techStack).toEqual(['UNIVAC']);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toContain('Kubernetes');
  });

  it('strips and flags a fabricated certification', () => {
    const tailored = clone(source);
    tailored.certifications.push({ id: 'cert-fake', name: 'AWS Certified' });

    const { sanitized, flagged } = enforceNoFabrication(source, tailored);

    expect(sanitized.certifications).toHaveLength(1);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toContain('AWS Certified');
  });

  it('allows rephrased bullet text freely (bullets are not a fabrication vector)', () => {
    const tailored = clone(source);
    tailored.experience[0].bullets[0].text =
      'Something completely new that mentions Python and Kubernetes.';

    const { flagged } = enforceNoFabrication(source, tailored);

    expect(flagged).toEqual([]);
  });

  it('does not mutate the source or tailored inputs', () => {
    const tailored = clone(source);
    tailored.experience.push({
      id: 'exp-fake',
      company: 'Google',
      title: 'X',
      location: 'Y',
      startDate: '1',
      endDate: '2',
      bullets: [],
    });
    const sourceSnapshot = clone(source);
    const tailoredSnapshot = clone(tailored);

    enforceNoFabrication(source, tailored);

    expect(source).toEqual(sourceSnapshot);
    expect(tailored).toEqual(tailoredSnapshot);
  });
});

describe('computeBulletChanges', () => {
  it('emits a change only for bullets whose text changed, matched by id', () => {
    const tailored = clone(source);
    tailored.experience[0].bullets[0].text = 'Rephrased compiler bullet.';
    // second bullet unchanged

    const changes = computeBulletChanges(source, tailored);

    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({
      path: 'experience.0.bullets.0',
      original: 'Developed the first compiler.',
      tailored: 'Rephrased compiler bullet.',
      accepted: false,
    });
  });

  it('diffs project bullets too', () => {
    const tailored = clone(source);
    tailored.projects[0].bullets[0].text = 'Redesigned the language for the JD.';

    const changes = computeBulletChanges(source, tailored);

    expect(changes).toHaveLength(1);
    expect(changes[0].path).toBe('projects.0.bullets.0');
  });
});

/** A valid AI tailoring envelope built from a resume. */
function envelope(resume: ResumeData, matchScore = 82, gaps: string[] = []) {
  return JSON.stringify({ resume, matchScore, gaps });
}

describe('tailorResume pipeline', () => {
  it('returns ok with sanitized data, matchScore, gaps, and changes on valid output', async () => {
    const tailored = clone(source);
    tailored.experience[0].bullets[0].text = 'Built the first working compiler.';
    const { client, send } = mockClient({
      ok: true,
      value: envelope(tailored, 88, ['5+ years managing cloud infra']),
    });

    const result = await tailorResume(client, source, 'JD text');

    expect(send).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.matchScore).toBe(88);
      expect(result.value.gaps).toEqual(['5+ years managing cloud infra']);
      expect(result.value.changes).toHaveLength(1);
      expect(result.value.changes[0].tailored).toBe(
        'Built the first working compiler.',
      );
      expect(result.value.flaggedFabrications).toBeUndefined();
      expect(resumeDataSchema.safeParse(result.value.data).success).toBe(true);
    }
  });

  it('strips fabricated facts from AI output and reports them via flaggedFabrications', async () => {
    const tailored = clone(source);
    tailored.skills[0].skills = ['COBOL', 'Rust'];
    const { client } = mockClient({ ok: true, value: envelope(tailored) });

    const result = await tailorResume(client, source, 'JD text');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.data.skills[0].skills).toEqual(['COBOL']);
      expect(result.value.flaggedFabrications).toBeDefined();
      expect(result.value.flaggedFabrications?.[0]).toContain('Rust');
    }
  });

  it('clamps and rounds an out-of-range matchScore', async () => {
    const { client } = mockClient({
      ok: true,
      value: envelope(clone(source), 150.7),
    });

    const result = await tailorResume(client, source, 'JD text');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.matchScore).toBe(100);
  });

  it('tolerates JSON wrapped in markdown code fences', async () => {
    const { client } = mockClient({
      ok: true,
      value: '```json\n' + envelope(clone(source)) + '\n```',
    });

    const result = await tailorResume(client, source, 'JD text');

    expect(result.ok).toBe(true);
  });

  it('returns a parse error on malformed JSON', async () => {
    const { client } = mockClient({ ok: true, value: 'not json {' });

    const result = await tailorResume(client, source, 'JD text');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('parse');
  });

  it('returns a parse error when matchScore is missing', async () => {
    const { client } = mockClient({
      ok: true,
      value: JSON.stringify({ resume: clone(source), gaps: [] }),
    });

    const result = await tailorResume(client, source, 'JD text');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('parse');
  });

  it('returns a parse error when gaps is not a string array', async () => {
    const { client } = mockClient({
      ok: true,
      value: JSON.stringify({ resume: clone(source), matchScore: 50, gaps: [1, 2] }),
    });

    const result = await tailorResume(client, source, 'JD text');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('parse');
  });

  it('returns a parse error when the resume fails schema validation', async () => {
    const { client } = mockClient({
      ok: true,
      value: JSON.stringify({
        resume: { personalInfo: { name: 'X' } },
        matchScore: 50,
        gaps: [],
      }),
    });

    const result = await tailorResume(client, source, 'JD text');

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

      const result = await tailorResume(client, source, 'JD text');

      expect(result).toEqual(upstream);
    }
  });
});
