/**
 * Pure drag-and-drop reordering helpers (Task 4.3, Req 2.4, 13.4).
 *
 * @dnd-kit reports reorders in terms of the *ids* of the active (dragged) item
 * and the item it was dropped over. The resume store, however, exposes
 * index-based reorder actions (`reorderExperience`, `reorderBullets`, ...). This
 * module bridges the two with a small pure function so the wiring can be unit
 * tested without simulating real pointer drags (which jsdom can't do).
 */

export interface ReorderResult {
  /** Index the dragged item started at. */
  from: number;
  /** Index the dragged item should move to. */
  to: number;
}

/**
 * Given the ordered list of item ids and the active/over ids reported by
 * @dnd-kit's `onDragEnd`, compute the `from`/`to` indices for an index-based
 * reorder action.
 *
 * Returns `null` (a no-op) when:
 *  - `overId` is null/undefined (dropped outside any sortable item),
 *  - the active and over ids are the same (item didn't move), or
 *  - either id isn't present in the list (defensive guard).
 */
export function computeReorder(
  ids: readonly string[],
  activeId: string | number | null | undefined,
  overId: string | number | null | undefined,
): ReorderResult | null {
  if (activeId == null || overId == null) return null;
  const from = ids.indexOf(String(activeId));
  const to = ids.indexOf(String(overId));
  if (from === -1 || to === -1) return null;
  if (from === to) return null;
  return { from, to };
}
