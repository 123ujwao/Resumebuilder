import { describe, expect, it } from 'vitest';
import type { BulletChange, ResumeData } from '@resume-forge/core';
import {
  applyPendingChanges,
  initPendingChanges,
  resolveFinalChanges,
  type PendingChangeMap,
} from './applyChanges';

/**
 * Unit tests for the pure change-composition helpers (Req 4.7).
 */

function tailoredData(): ResumeData {
  return {
    personalInfo: { name: 'Ada', email: '', phone: '', location: '' },
    summary: '',
    experience: [
      {
        id: 'exp-1',
        company: 'Acme',
        title: 'Engineer',
        location: '',
        startDate: '',
        endDate: '',
        bullets: [
          { id: 'b-1', text: 'Tailored bullet one' },
          { id: 'b-2', text: 'Tailored bullet two' },
        ],
      },
    ],
    education: [],
    skills: [],
    projects: [
      {
        id: 'p-1',
        name: 'Proj',
        description: '',
        bullets: [{ id: 'pb-1', text: 'Tailored project bullet' }],
        techStack: [],
      },
    ],
    certifications: [],
  };
}

const changes: BulletChange[] = [
  {
    path: 'experience.0.bullets.0',
    original: 'Original bullet one',
    tailored: 'Tailored bullet one',
    accepted: false,
  },
  {
    path: 'experience.0.bullets.1',
    original: 'Original bullet two',
    tailored: 'Tailored bullet two',
    accepted: false,
  },
  {
    path: 'projects.0.bullets.0',
    original: 'Original project bullet',
    tailored: 'Tailored project bullet',
    accepted: false,
  },
];

describe('initPendingChanges', () => {
  it('starts every change as accepted with the tailored text', () => {
    const pending = initPendingChanges(changes);
    expect(pending['experience.0.bullets.0']).toEqual({
      mode: 'tailored',
      editedText: 'Tailored bullet one',
    });
    expect(Object.keys(pending)).toHaveLength(3);
  });
});

describe('applyPendingChanges', () => {
  it('keeps tailored text for accepted changes', () => {
    const pending = initPendingChanges(changes);
    const result = applyPendingChanges(tailoredData(), changes, pending);
    expect(result.experience[0].bullets[0].text).toBe('Tailored bullet one');
  });

  it('falls back to original text for reverted changes', () => {
    const pending: PendingChangeMap = initPendingChanges(changes);
    pending['experience.0.bullets.0'] = { mode: 'original', editedText: 'Tailored bullet one' };
    const result = applyPendingChanges(tailoredData(), changes, pending);
    expect(result.experience[0].bullets[0].text).toBe('Original bullet one');
    // Others stay tailored.
    expect(result.experience[0].bullets[1].text).toBe('Tailored bullet two');
  });

  it('uses the tweaked text for edited changes', () => {
    const pending: PendingChangeMap = initPendingChanges(changes);
    pending['projects.0.bullets.0'] = { mode: 'tailored', editedText: 'My custom wording' };
    const result = applyPendingChanges(tailoredData(), changes, pending);
    expect(result.projects[0].bullets[0].text).toBe('My custom wording');
  });

  it('does not mutate the input tailored data', () => {
    const input = tailoredData();
    const pending: PendingChangeMap = initPendingChanges(changes);
    pending['experience.0.bullets.0'] = { mode: 'original', editedText: 'x' };
    applyPendingChanges(input, changes, pending);
    expect(input.experience[0].bullets[0].text).toBe('Tailored bullet one');
  });
});

describe('resolveFinalChanges', () => {
  it('records accepted + tweaked text per change', () => {
    const pending: PendingChangeMap = initPendingChanges(changes);
    pending['experience.0.bullets.0'] = { mode: 'original', editedText: 'Tailored bullet one' };
    pending['experience.0.bullets.1'] = { mode: 'tailored', editedText: 'Tweaked two' };

    const final = resolveFinalChanges(changes, pending);
    expect(final[0].accepted).toBe(false); // reverted
    expect(final[1].accepted).toBe(true);
    expect(final[1].tailored).toBe('Tweaked two');
  });
});
