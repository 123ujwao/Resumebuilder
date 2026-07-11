import { create } from 'zustand';
import {
  resumeVersionSchema,
  type ResumeData,
  type ResumeVersion,
  type ExperienceItem,
  type Bullet,
} from '@resume-forge/core';
import { z } from 'zod';

/**
 * Resume state store + persistence (Req 2.6, 4.5).
 *
 * This store owns everything about the resume-in-progress:
 *  - the list of {@link ResumeVersion}s (the immutable base + tailored variants)
 *  - which version is currently active/selected
 *  - template + style selection (template id, font, accent color)
 *
 * Persistence model
 * -----------------
 * Resume content stays in the browser (privacy by default). We use a custom
 * debounced `localStorage` writer (namespaced `rf.resume_state`) rather than the
 * `zustand/persist` middleware so we can (a) debounce rapid field edits so they
 * don't thrash storage (Req 2.6) and (b) validate persisted data with the zod
 * schemas from `@resume-forge/core` on load, falling back to an empty resume if
 * storage is corrupt or malformed.
 *
 * Base immutability (Req 4.5)
 * ---------------------------
 * Versions are modelled as a list where the base version is preserved when
 * tailoring produces new variants. All updates are immutable: editing the
 * active version replaces only that version's object with a freshly-cloned one,
 * so editing the base never mutates a tailored version and vice versa. Branching
 * a new version deep-clones the source data so the two never share references.
 */

/** `localStorage` key. Namespaced under `rf.` to avoid collisions. */
export const RESUME_STATE_STORAGE_KEY = 'rf.resume_state';

/** Debounce window (ms) for autosaving resume edits to `localStorage`. */
export const AUTOSAVE_DEBOUNCE_MS = 500;

// --- Template / style selection ---------------------------------------------

/** Built-in template ids (see Req 3.1). */
export const TEMPLATE_IDS = [
  'classic',
  'modern',
  'compact',
  'two-column',
  'minimal',
] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

/** Safe font choices offered by the font picker (Req 3.6). */
export const FONT_OPTIONS = [
  'Inter',
  'Georgia',
  'Times New Roman',
  'Arial',
  'Roboto',
] as const;
export type FontOption = (typeof FONT_OPTIONS)[number];

/** Safe accent-color palette offered by the color picker (Req 3.6). */
export const ACCENT_COLORS = [
  '#1e3a8a', // navy
  '#0f766e', // teal
  '#7c3aed', // violet
  '#b91c1c', // red
  '#111827', // near-black
] as const;
export type AccentColor = (typeof ACCENT_COLORS)[number];

export const templateSelectionSchema = z.object({
  templateId: z.enum(TEMPLATE_IDS),
  font: z.string(),
  accentColor: z.string(),
});
export type TemplateSelection = z.infer<typeof templateSelectionSchema>;

export const DEFAULT_TEMPLATE: TemplateSelection = {
  templateId: 'classic',
  font: FONT_OPTIONS[0],
  accentColor: ACCENT_COLORS[0],
};

// --- Factories --------------------------------------------------------------

/** Generate a stable id, tolerating environments without `crypto.randomUUID`. */
function newId(): string {
  try {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid) return uuid;
  } catch {
    // fall through to the fallback below
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** An empty, valid {@link ResumeData} used as the starting point / fallback. */
export function createEmptyResume(): ResumeData {
  return {
    personalInfo: { name: '', email: '', phone: '', location: '' },
    summary: '',
    experience: [],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
  };
}

/** Build the canonical base version wrapping the given (or empty) resume. */
export function createBaseVersion(data: ResumeData = createEmptyResume()): ResumeVersion {
  return {
    id: newId(),
    label: 'Base Resume',
    kind: 'base',
    data: structuredCloneSafe(data),
    createdAt: new Date().toISOString(),
  };
}

/** Deep clone that works in jsdom/node and older runtimes. */
function structuredCloneSafe<T>(value: T): T {
  const sc = (globalThis as { structuredClone?: <V>(v: V) => V }).structuredClone;
  if (typeof sc === 'function') return sc(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

// --- Persistence ------------------------------------------------------------

/** Shape written to / read from `localStorage`. */
export const persistedResumeStateSchema = z.object({
  versions: z.array(resumeVersionSchema).min(1),
  activeVersionId: z.string().min(1),
  template: templateSelectionSchema,
});
export type PersistedResumeState = z.infer<typeof persistedResumeStateSchema>;

/**
 * Read + validate persisted resume state from `localStorage`.
 *
 * Returns `null` when nothing is stored, storage is unavailable, the JSON is
 * corrupt, the shape fails zod validation, or the persisted `activeVersionId`
 * doesn't reference a stored version. Callers fall back to a fresh empty resume.
 */
export function loadPersistedState(): PersistedResumeState | null {
  let raw: string | null = null;
  try {
    raw = globalThis.localStorage?.getItem(RESUME_STATE_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Corrupt / malformed JSON in storage — guard against it.
    return null;
  }

  const result = persistedResumeStateSchema.safeParse(parsed);
  if (!result.success) return null;

  // The active version must reference a stored version, otherwise the state is
  // inconsistent and we fall back rather than pointing at a missing version.
  const { versions, activeVersionId } = result.data;
  if (!versions.some((v) => v.id === activeVersionId)) return null;

  return result.data;
}

/** Serialize + write the persistable slice, tolerating storage errors. */
export function persistResumeState(state: PersistedResumeState): void {
  try {
    globalThis.localStorage?.setItem(
      RESUME_STATE_STORAGE_KEY,
      JSON.stringify(state),
    );
  } catch {
    // Ignore storage failures (private mode / quota / disabled storage).
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced write so rapid edits don't thrash `localStorage` (Req 2.6). */
function scheduleSave(state: PersistedResumeState): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persistResumeState(state);
  }, AUTOSAVE_DEBOUNCE_MS);
}

/** Flush any pending debounced save immediately (used on unload / in tests). */
export function flushPendingSave(): void {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  persistResumeState(pickPersistable(useResumeStore.getState()));
}

/** Extract just the persistable slice from the full store state. */
function pickPersistable(state: ResumeStoreState): PersistedResumeState {
  return {
    versions: state.versions,
    activeVersionId: state.activeVersionId,
    template: state.template,
  };
}

// --- Store ------------------------------------------------------------------

export interface ResumeStoreState {
  /** All saved versions: exactly one base plus any tailored variants. */
  versions: ResumeVersion[];
  /** Id of the currently active/selected version. */
  activeVersionId: string;
  /** Template + style selection applied to the preview/export. */
  template: TemplateSelection;

  // --- selectors ---
  /** The currently active version object (falls back to the first version). */
  getActiveVersion: () => ResumeVersion;
  /** The immutable base version. */
  getBaseVersion: () => ResumeVersion;
  /** The active version's resume data. */
  getActiveResumeData: () => ResumeData;

  // --- resume editing (operates on the active version) ---
  /** Replace the active version's data via an immutable updater recipe. */
  updateActiveResumeData: (recipe: (data: ResumeData) => ResumeData) => void;
  updatePersonalInfo: (patch: Partial<ResumeData['personalInfo']>) => void;
  setSummary: (summary: string) => void;

  addExperience: (item?: Partial<Omit<ExperienceItem, 'id'>>) => void;
  updateExperience: (id: string, patch: Partial<Omit<ExperienceItem, 'id'>>) => void;
  removeExperience: (id: string) => void;
  reorderExperience: (fromIndex: number, toIndex: number) => void;

  addBullet: (experienceId: string, text?: string) => void;
  updateBullet: (experienceId: string, bulletId: string, text: string) => void;
  removeBullet: (experienceId: string, bulletId: string) => void;
  reorderBullets: (experienceId: string, fromIndex: number, toIndex: number) => void;

  /** Reorder the bullets of a project (Req 2.4). Mirrors {@link reorderBullets}. */
  reorderProjectBullets: (projectId: string, fromIndex: number, toIndex: number) => void;

  // --- template / style ---
  setTemplate: (templateId: TemplateId) => void;
  setFont: (font: string) => void;
  setAccentColor: (accentColor: string) => void;

  // --- version management ---
  addVersion: (version: ResumeVersion) => void;
  setActiveVersion: (id: string) => void;
  removeVersion: (id: string) => void;
  /** Reset the whole store to a fresh empty base resume. */
  reset: () => void;
}

/** Move an item within an array immutably. Out-of-range indices are clamped. */
function moveImmutable<T>(list: readonly T[], fromIndex: number, toIndex: number): T[] {
  const next = list.slice();
  if (fromIndex < 0 || fromIndex >= next.length) return next;
  const clampedTo = Math.max(0, Math.min(toIndex, next.length - 1));
  const [moved] = next.splice(fromIndex, 1);
  next.splice(clampedTo, 0, moved);
  return next;
}

function buildInitialState(): Pick<
  ResumeStoreState,
  'versions' | 'activeVersionId' | 'template'
> {
  const persisted = loadPersistedState();
  if (persisted) {
    return {
      versions: persisted.versions,
      activeVersionId: persisted.activeVersionId,
      template: persisted.template,
    };
  }
  const base = createBaseVersion();
  return {
    versions: [base],
    activeVersionId: base.id,
    template: { ...DEFAULT_TEMPLATE },
  };
}

export const useResumeStore = create<ResumeStoreState>((set, get) => {
  /**
   * Replace the active version's `data` immutably. Only the active version's
   * object is rebuilt; every other version (e.g. the base or other tailored
   * variants) keeps its original reference, guaranteeing base immutability
   * (Req 4.5).
   */
  const updateActiveResumeData: ResumeStoreState['updateActiveResumeData'] = (
    recipe,
  ) => {
    set((state) => {
      const versions = state.versions.map((v) => {
        if (v.id !== state.activeVersionId) return v;
        // Clone before handing to the recipe so accidental in-place mutation of
        // the current data object cannot leak into the previous state.
        const nextData = recipe(structuredCloneSafe(v.data));
        return { ...v, data: nextData };
      });
      return { versions };
    });
  };

  return {
    ...buildInitialState(),

    getActiveVersion: () => {
      const { versions, activeVersionId } = get();
      return versions.find((v) => v.id === activeVersionId) ?? versions[0];
    },
    getBaseVersion: () => {
      const { versions } = get();
      return versions.find((v) => v.kind === 'base') ?? versions[0];
    },
    getActiveResumeData: () => get().getActiveVersion().data,

    updateActiveResumeData,

    updatePersonalInfo: (patch) =>
      updateActiveResumeData((data) => ({
        ...data,
        personalInfo: { ...data.personalInfo, ...patch },
      })),

    setSummary: (summary) =>
      updateActiveResumeData((data) => ({ ...data, summary })),

    addExperience: (item) =>
      updateActiveResumeData((data) => ({
        ...data,
        experience: [
          ...data.experience,
          {
            id: newId(),
            company: '',
            title: '',
            location: '',
            startDate: '',
            endDate: '',
            bullets: [],
            ...item,
          },
        ],
      })),

    updateExperience: (id, patch) =>
      updateActiveResumeData((data) => ({
        ...data,
        experience: data.experience.map((exp) =>
          exp.id === id ? { ...exp, ...patch } : exp,
        ),
      })),

    removeExperience: (id) =>
      updateActiveResumeData((data) => ({
        ...data,
        experience: data.experience.filter((exp) => exp.id !== id),
      })),

    reorderExperience: (fromIndex, toIndex) =>
      updateActiveResumeData((data) => ({
        ...data,
        experience: moveImmutable(data.experience, fromIndex, toIndex),
      })),

    addBullet: (experienceId, text = '') =>
      updateActiveResumeData((data) => ({
        ...data,
        experience: data.experience.map((exp) =>
          exp.id === experienceId
            ? { ...exp, bullets: [...exp.bullets, { id: newId(), text }] }
            : exp,
        ),
      })),

    updateBullet: (experienceId, bulletId, text) =>
      updateActiveResumeData((data) => ({
        ...data,
        experience: data.experience.map((exp) =>
          exp.id === experienceId
            ? {
                ...exp,
                bullets: exp.bullets.map((b: Bullet) =>
                  b.id === bulletId ? { ...b, text } : b,
                ),
              }
            : exp,
        ),
      })),

    removeBullet: (experienceId, bulletId) =>
      updateActiveResumeData((data) => ({
        ...data,
        experience: data.experience.map((exp) =>
          exp.id === experienceId
            ? { ...exp, bullets: exp.bullets.filter((b) => b.id !== bulletId) }
            : exp,
        ),
      })),

    reorderBullets: (experienceId, fromIndex, toIndex) =>
      updateActiveResumeData((data) => ({
        ...data,
        experience: data.experience.map((exp) =>
          exp.id === experienceId
            ? { ...exp, bullets: moveImmutable(exp.bullets, fromIndex, toIndex) }
            : exp,
        ),
      })),

    reorderProjectBullets: (projectId, fromIndex, toIndex) =>
      updateActiveResumeData((data) => ({
        ...data,
        projects: data.projects.map((proj) =>
          proj.id === projectId
            ? { ...proj, bullets: moveImmutable(proj.bullets, fromIndex, toIndex) }
            : proj,
        ),
      })),

    setTemplate: (templateId) =>
      set((state) => ({ template: { ...state.template, templateId } })),
    setFont: (font) => set((state) => ({ template: { ...state.template, font } })),
    setAccentColor: (accentColor) =>
      set((state) => ({ template: { ...state.template, accentColor } })),

    addVersion: (version) =>
      set((state) => ({
        // Deep clone on branch so the new version never shares references with
        // an existing one (base immutability, Req 4.5).
        versions: [...state.versions, { ...version, data: structuredCloneSafe(version.data) }],
        activeVersionId: version.id,
      })),

    setActiveVersion: (id) =>
      set((state) =>
        state.versions.some((v) => v.id === id) ? { activeVersionId: id } : {},
      ),

    removeVersion: (id) =>
      set((state) => {
        const target = state.versions.find((v) => v.id === id);
        // The base version is never removable — tailored variants are saved
        // alongside it and it must always be preserved (Req 4.5).
        if (!target || target.kind === 'base') return {};
        const versions = state.versions.filter((v) => v.id !== id);
        const activeVersionId =
          state.activeVersionId === id
            ? (versions.find((v) => v.kind === 'base') ?? versions[0]).id
            : state.activeVersionId;
        return { versions, activeVersionId };
      }),

    reset: () => {
      const base = createBaseVersion();
      set({
        versions: [base],
        activeVersionId: base.id,
        template: { ...DEFAULT_TEMPLATE },
      });
    },
  };
});

// Debounced autosave: any change to the persistable slice schedules a write to
// `localStorage` (Req 2.6). The subscription is set up once at module load.
useResumeStore.subscribe((state) => {
  scheduleSave(pickPersistable(state));
});

// Best-effort flush of pending edits when the tab is closing so a debounce
// window that hasn't elapsed doesn't lose the latest edit.
if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('beforeunload', flushPendingSave);
}
