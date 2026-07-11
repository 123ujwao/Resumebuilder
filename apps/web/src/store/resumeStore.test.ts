import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResumeVersion } from '@resume-forge/core';
import {
  useResumeStore,
  createBaseVersion,
  createEmptyResume,
  loadPersistedState,
  flushPendingSave,
  RESUME_STATE_STORAGE_KEY,
  AUTOSAVE_DEBOUNCE_MS,
  DEFAULT_TEMPLATE,
} from './resumeStore';

/**
 * Unit tests for the resume state store + persistence (Req 2.6, 4.5).
 *
 * Covers: store actions, debounced localStorage autosave (fake timers),
 * corrupt-storage fallback on load, and base immutability when tailoring
 * produces new versions.
 */

/** Reset the store to a fresh single-base state and clear storage. */
function resetStore() {
  localStorage.clear();
  useResumeStore.getState().reset();
}

/** Build a tailored version cloned from the active resume data. */
function makeTailoredVersion(id = 'tailored-1'): ResumeVersion {
  return {
    id,
    label: 'Tailored — Acme',
    kind: 'tailored',
    data: createEmptyResume(),
    createdAt: new Date().toISOString(),
    tailoring: { jobDescription: 'jd', matchScore: 80, gaps: [], changes: [] },
  };
}

describe('useResumeStore actions', () => {
  beforeEach(resetStore);

  it('starts with a single immutable base version selected', () => {
    const state = useResumeStore.getState();
    expect(state.versions).toHaveLength(1);
    expect(state.versions[0].kind).toBe('base');
    expect(state.activeVersionId).toBe(state.versions[0].id);
    expect(state.template).toEqual(DEFAULT_TEMPLATE);
  });

  it('updates personal info on the active version', () => {
    useResumeStore.getState().updatePersonalInfo({ name: 'Ada', email: 'a@b.co' });
    const data = useResumeStore.getState().getActiveResumeData();
    expect(data.personalInfo.name).toBe('Ada');
    expect(data.personalInfo.email).toBe('a@b.co');
  });

  it('sets the summary', () => {
    useResumeStore.getState().setSummary('Senior engineer');
    expect(useResumeStore.getState().getActiveResumeData().summary).toBe(
      'Senior engineer',
    );
  });

  it('adds, updates, and removes experience entries', () => {
    const store = useResumeStore.getState();
    store.addExperience({ company: 'Acme', title: 'Eng' });
    let exp = useResumeStore.getState().getActiveResumeData().experience;
    expect(exp).toHaveLength(1);
    expect(exp[0].company).toBe('Acme');

    const id = exp[0].id;
    useResumeStore.getState().updateExperience(id, { title: 'Staff Eng' });
    expect(useResumeStore.getState().getActiveResumeData().experience[0].title).toBe(
      'Staff Eng',
    );

    useResumeStore.getState().removeExperience(id);
    expect(useResumeStore.getState().getActiveResumeData().experience).toHaveLength(0);
  });

  it('reorders experience entries by index', () => {
    const store = useResumeStore.getState();
    store.addExperience({ company: 'A' });
    store.addExperience({ company: 'B' });
    store.addExperience({ company: 'C' });
    useResumeStore.getState().reorderExperience(0, 2);
    const companies = useResumeStore
      .getState()
      .getActiveResumeData()
      .experience.map((e) => e.company);
    expect(companies).toEqual(['B', 'C', 'A']);
  });

  it('adds, updates, removes, and reorders bullets', () => {
    useResumeStore.getState().addExperience({ company: 'A' });
    const expId = useResumeStore.getState().getActiveResumeData().experience[0].id;

    useResumeStore.getState().addBullet(expId, 'first');
    useResumeStore.getState().addBullet(expId, 'second');
    let bullets = useResumeStore.getState().getActiveResumeData().experience[0].bullets;
    expect(bullets.map((b) => b.text)).toEqual(['first', 'second']);

    useResumeStore.getState().updateBullet(expId, bullets[0].id, 'updated');
    useResumeStore.getState().reorderBullets(expId, 0, 1);
    bullets = useResumeStore.getState().getActiveResumeData().experience[0].bullets;
    expect(bullets.map((b) => b.text)).toEqual(['second', 'updated']);

    useResumeStore.getState().removeBullet(expId, bullets[0].id);
    bullets = useResumeStore.getState().getActiveResumeData().experience[0].bullets;
    expect(bullets.map((b) => b.text)).toEqual(['updated']);
  });

  it('reorders project bullets by index (Req 2.4)', () => {
    useResumeStore.getState().updateActiveResumeData((d) => ({
      ...d,
      projects: [
        {
          id: 'proj-1',
          name: 'Site',
          description: '',
          techStack: [],
          bullets: [
            { id: 'pb-1', text: 'first' },
            { id: 'pb-2', text: 'second' },
            { id: 'pb-3', text: 'third' },
          ],
        },
      ],
    }));

    useResumeStore.getState().reorderProjectBullets('proj-1', 2, 0);
    const bullets = useResumeStore.getState().getActiveResumeData().projects[0].bullets;
    expect(bullets.map((b) => b.text)).toEqual(['third', 'first', 'second']);
  });

  it('updates template, font, and accent color selection', () => {
    useResumeStore.getState().setTemplate('two-column');
    useResumeStore.getState().setFont('Georgia');
    useResumeStore.getState().setAccentColor('#0f766e');
    const { template } = useResumeStore.getState();
    expect(template).toEqual({
      templateId: 'two-column',
      font: 'Georgia',
      accentColor: '#0f766e',
    });
  });
});

describe('version management + base immutability (Req 4.5)', () => {
  beforeEach(resetStore);

  it('adds a version and makes it active', () => {
    const v = makeTailoredVersion();
    useResumeStore.getState().addVersion(v);
    const state = useResumeStore.getState();
    expect(state.versions).toHaveLength(2);
    expect(state.activeVersionId).toBe(v.id);
  });

  it('switches the active version', () => {
    const base = useResumeStore.getState().versions[0];
    const v = makeTailoredVersion();
    useResumeStore.getState().addVersion(v);
    useResumeStore.getState().setActiveVersion(base.id);
    expect(useResumeStore.getState().activeVersionId).toBe(base.id);
  });

  it('editing a tailored version does not mutate the base version', () => {
    // Seed base with content.
    useResumeStore.getState().updatePersonalInfo({ name: 'Base Name' });
    const baseBefore = useResumeStore.getState().getBaseVersion();
    const baseSnapshot = JSON.stringify(baseBefore.data);

    // Branch a tailored version cloned from the base, switch to it, edit it.
    const tailored = makeTailoredVersion();
    tailored.data = JSON.parse(JSON.stringify(baseBefore.data));
    useResumeStore.getState().addVersion(tailored);
    useResumeStore.getState().updatePersonalInfo({ name: 'Tailored Name' });

    const baseAfter = useResumeStore.getState().getBaseVersion();
    // Base data is byte-identical and its object reference is unchanged.
    expect(JSON.stringify(baseAfter.data)).toBe(baseSnapshot);
    expect(baseAfter).toBe(baseBefore);
    expect(useResumeStore.getState().getActiveResumeData().personalInfo.name).toBe(
      'Tailored Name',
    );
  });

  it('editing the base does not mutate an existing tailored version', () => {
    const tailored = makeTailoredVersion();
    useResumeStore.getState().addVersion(tailored);
    useResumeStore.getState().updatePersonalInfo({ name: 'Tailored Name' });

    const tailoredBefore = useResumeStore
      .getState()
      .versions.find((v) => v.id === tailored.id)!;
    const tailoredSnapshot = JSON.stringify(tailoredBefore.data);

    // Switch back to base and edit it.
    const baseId = useResumeStore.getState().getBaseVersion().id;
    useResumeStore.getState().setActiveVersion(baseId);
    useResumeStore.getState().updatePersonalInfo({ name: 'Base Edited' });

    const tailoredAfter = useResumeStore
      .getState()
      .versions.find((v) => v.id === tailored.id)!;
    expect(JSON.stringify(tailoredAfter.data)).toBe(tailoredSnapshot);
    expect(tailoredAfter).toBe(tailoredBefore);
  });

  it('addVersion deep-clones data so branch and source do not share references', () => {
    const source = makeTailoredVersion();
    useResumeStore.getState().addVersion(source);
    const stored = useResumeStore.getState().versions.find((v) => v.id === source.id)!;
    expect(stored.data).not.toBe(source.data);
    // Mutating the caller's original object must not affect stored state.
    source.data.summary = 'mutated externally';
    expect(useResumeStore.getState().getActiveResumeData().summary).toBe('');
  });

  it('never removes the base version', () => {
    const baseId = useResumeStore.getState().getBaseVersion().id;
    useResumeStore.getState().removeVersion(baseId);
    expect(useResumeStore.getState().versions.some((v) => v.id === baseId)).toBe(true);
  });

  it('removes a tailored version and reselects the base if it was active', () => {
    const v = makeTailoredVersion();
    useResumeStore.getState().addVersion(v);
    useResumeStore.getState().removeVersion(v.id);
    const state = useResumeStore.getState();
    expect(state.versions).toHaveLength(1);
    expect(state.getActiveVersion().kind).toBe('base');
  });
});

describe('debounced autosave persistence (Req 2.6)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetStore();
    // reset() runs a scheduled save; flush it out and clear storage cleanly.
    vi.runAllTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not write to localStorage before the debounce window elapses', () => {
    useResumeStore.getState().setSummary('a');
    useResumeStore.getState().setSummary('ab');
    expect(localStorage.getItem(RESUME_STATE_STORAGE_KEY)).toBeNull();
  });

  it('writes once after the debounce window elapses', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    useResumeStore.getState().setSummary('a');
    useResumeStore.getState().setSummary('ab');
    useResumeStore.getState().setSummary('abc');
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);

    const rfWrites = setItem.mock.calls.filter(
      ([key]) => key === RESUME_STATE_STORAGE_KEY,
    );
    expect(rfWrites).toHaveLength(1);
    const persisted = loadPersistedState();
    expect(persisted?.versions[0].data.summary).toBe('abc');
    setItem.mockRestore();
  });

  it('flushPendingSave writes immediately without waiting', () => {
    useResumeStore.getState().setSummary('flushed');
    flushPendingSave();
    expect(loadPersistedState()?.versions[0].data.summary).toBe('flushed');
  });
});

describe('persistence load + corrupt-storage fallback', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when storage is empty', () => {
    expect(loadPersistedState()).toBeNull();
  });

  it('returns null for non-JSON garbage', () => {
    localStorage.setItem(RESUME_STATE_STORAGE_KEY, '{not valid json');
    expect(loadPersistedState()).toBeNull();
  });

  it('returns null for JSON that fails schema validation', () => {
    localStorage.setItem(
      RESUME_STATE_STORAGE_KEY,
      JSON.stringify({ versions: [], activeVersionId: 'x', template: {} }),
    );
    expect(loadPersistedState()).toBeNull();
  });

  it('returns null when activeVersionId does not reference a stored version', () => {
    const base = createBaseVersion();
    localStorage.setItem(
      RESUME_STATE_STORAGE_KEY,
      JSON.stringify({
        versions: [base],
        activeVersionId: 'missing-id',
        template: DEFAULT_TEMPLATE,
      }),
    );
    expect(loadPersistedState()).toBeNull();
  });

  it('loads a valid persisted state', () => {
    const base = createBaseVersion();
    base.data.summary = 'restored';
    localStorage.setItem(
      RESUME_STATE_STORAGE_KEY,
      JSON.stringify({
        versions: [base],
        activeVersionId: base.id,
        template: DEFAULT_TEMPLATE,
      }),
    );
    const loaded = loadPersistedState();
    expect(loaded).not.toBeNull();
    expect(loaded?.versions[0].data.summary).toBe('restored');
    expect(loaded?.activeVersionId).toBe(base.id);
  });
});
