import type { BulletChange, ResumeData } from '@resume-forge/core';

/**
 * Pure helpers for composing the final tailored {@link ResumeData} from the
 * per-change decisions the user makes in the diff view (Req 4.6, 4.7).
 *
 * The tailoring pipeline (`@resume-forge/core`'s `tailorResume`) returns the
 * sanitized tailored resume together with a list of {@link BulletChange}s. Each
 * change carries a structured `path` (e.g. `experience.0.bullets.2` or
 * `projects.1.bullets.0`) locating the changed bullet in the tailored data, the
 * `original` text, and the proposed `tailored` text.
 *
 * The user can, per change (Req 4.7):
 *  - **Accept**  → keep the tailored text (the default state);
 *  - **Tweak**   → keep the tailored text but edited to a custom value;
 *  - **Revert**  → fall back to the original bullet text.
 *
 * {@link PendingChange} captures that decision. {@link applyPendingChanges}
 * folds those decisions back onto a clone of the tailored data, so a reverted
 * bullet reads its original text and a tweaked bullet reads the edited text.
 */

/** The user's decision for a single {@link BulletChange}. */
export interface PendingChange {
  /** Whether the tailored (accepted/tweaked) or original text should be kept. */
  mode: 'tailored' | 'original';
  /**
   * The effective tailored text. Starts equal to the change's `tailored` value
   * and is updated when the user tweaks the wording inline.
   */
  editedText: string;
}

/** Map of {@link BulletChange} path → the user's {@link PendingChange}. */
export type PendingChangeMap = Record<string, PendingChange>;

/**
 * Build the initial pending state for a set of changes. Every change starts
 * "accepted" (keeps the tailored text) so the tailored result is applied by
 * default; the user then reverts or tweaks the ones they disagree with.
 */
export function initPendingChanges(changes: BulletChange[]): PendingChangeMap {
  const map: PendingChangeMap = {};
  for (const change of changes) {
    map[change.path] = { mode: 'tailored', editedText: change.tailored };
  }
  return map;
}

/** Deep clone that works in jsdom/node and older runtimes. */
function clone<T>(value: T): T {
  const sc = (globalThis as { structuredClone?: <V>(v: V) => V }).structuredClone;
  if (typeof sc === 'function') return sc(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Resolve a bullet `path` (`<section>.<idx>.bullets.<idx>`) against a resume and
 * set its text, mutating the passed (already-cloned) object. Unknown or
 * malformed paths are ignored so a stale change can never throw.
 */
function setBulletTextAtPath(data: ResumeData, path: string, text: string): void {
  const parts = path.split('.');
  if (parts.length !== 4 || parts[2] !== 'bullets') return;

  const [section, sectionIdxRaw, , bulletIdxRaw] = parts;
  const sectionIdx = Number(sectionIdxRaw);
  const bulletIdx = Number(bulletIdxRaw);
  if (!Number.isInteger(sectionIdx) || !Number.isInteger(bulletIdx)) return;

  const list =
    section === 'experience'
      ? data.experience
      : section === 'projects'
        ? data.projects
        : null;
  if (!list) return;

  const bullets = list[sectionIdx]?.bullets;
  const bullet = bullets?.[bulletIdx];
  if (bullet) {
    bullet.text = text;
  }
}

/**
 * Compose the final tailored resume by folding the user's per-change decisions
 * onto the tailored data (Req 4.7). A cloned copy is returned; `tailoredData` is
 * never mutated. Changes with no pending entry keep their tailored text.
 */
export function applyPendingChanges(
  tailoredData: ResumeData,
  changes: BulletChange[],
  pending: PendingChangeMap,
): ResumeData {
  const result = clone(tailoredData);
  for (const change of changes) {
    const decision = pending[change.path];
    const text =
      !decision || decision.mode === 'tailored'
        ? (decision?.editedText ?? change.tailored)
        : change.original;
    setBulletTextAtPath(result, change.path, text);
  }
  return result;
}

/**
 * Produce the {@link BulletChange} list to persist in the version's tailoring
 * metadata, reflecting the user's final decisions: `accepted` is true when the
 * tailored text was kept, and `tailored` holds any tweaked wording.
 */
export function resolveFinalChanges(
  changes: BulletChange[],
  pending: PendingChangeMap,
): BulletChange[] {
  return changes.map((change) => {
    const decision = pending[change.path];
    if (!decision) return { ...change, accepted: true };
    return {
      ...change,
      tailored: decision.editedText,
      accepted: decision.mode === 'tailored',
    };
  });
}
