/**
 * Stable-id helper for builder-created sections/bullets.
 *
 * The model requires non-empty ids on every list item and bullet so
 * drag-and-drop (Task 4.3) and tailoring diffs can track items. When the user
 * adds a new entry in the editable form we mint an id here. Tolerates runtimes
 * without `crypto.randomUUID` (older browsers / jsdom).
 */
export function newId(prefix = 'id'): string {
  try {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid) return `${prefix}-${uuid}`;
  } catch {
    // fall through to the fallback below
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
