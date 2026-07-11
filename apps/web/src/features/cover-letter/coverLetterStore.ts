import { create } from 'zustand';
import type { CoverLetterTone } from '@resume-forge/core';
import { z } from 'zod';

/**
 * Cover letter state + persistence (Req 5.2, 5.3).
 *
 * Holds the generated/edited cover-letter text, the selected tone, and the JD
 * the letter was written for. Like resume content, the letter stays in the
 * browser (`localStorage`, namespaced `rf.cover_letter`) so an edited letter
 * isn't lost on reload (Req 5.3). Persistence tolerates corrupt/malformed
 * storage by falling back to defaults.
 */

/** `localStorage` key. Namespaced under `rf.` to avoid collisions. */
export const COVER_LETTER_STORAGE_KEY = 'rf.cover_letter';

const TONES = ['formal', 'conversational', 'enthusiastic_student'] as const;

/** Shape written to / read from `localStorage`. */
const persistedSchema = z.object({
  letter: z.string(),
  tone: z.enum(TONES),
  jd: z.string(),
});
type PersistedCoverLetter = z.infer<typeof persistedSchema>;

const DEFAULTS: PersistedCoverLetter = {
  letter: '',
  tone: 'formal',
  jd: '',
};

/** Read + validate persisted cover-letter state, or null when unavailable. */
export function loadPersistedCoverLetter(): PersistedCoverLetter | null {
  let raw: string | null = null;
  try {
    raw = globalThis.localStorage?.getItem(COVER_LETTER_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const result = persistedSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

/** Serialize + write the persistable slice, tolerating storage errors. */
function persist(state: PersistedCoverLetter): void {
  try {
    globalThis.localStorage?.setItem(
      COVER_LETTER_STORAGE_KEY,
      JSON.stringify(state),
    );
  } catch {
    // Ignore storage failures (private mode / quota / disabled storage).
  }
}

export interface CoverLetterStoreState {
  /** The current (editable) cover-letter text. */
  letter: string;
  /** The selected tone that will shape the next generation (Req 5.2). */
  tone: CoverLetterTone;
  /** The JD the letter was written for. */
  jd: string;

  /** Replace the letter text (used by editing + generation). */
  setLetter: (letter: string) => void;
  /** Change the selected tone (Req 5.2). */
  setTone: (tone: CoverLetterTone) => void;
  /** Update the JD text. */
  setJd: (jd: string) => void;
  /** Clear the generated letter (keeps tone/JD). */
  clearLetter: () => void;
}

function initialState(): PersistedCoverLetter {
  return loadPersistedCoverLetter() ?? { ...DEFAULTS };
}

export const useCoverLetterStore = create<CoverLetterStoreState>((set) => ({
  ...initialState(),

  setLetter: (letter) => set({ letter }),
  setTone: (tone) => set({ tone }),
  setJd: (jd) => set({ jd }),
  clearLetter: () => set({ letter: '' }),
}));

// Persist any change to the store so an edited letter survives reload (Req 5.3).
useCoverLetterStore.subscribe((state) => {
  persist({ letter: state.letter, tone: state.tone, jd: state.jd });
});
