import type { ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { computeReorder } from './dnd';

/**
 * Reusable drag-and-drop sorting primitives (Task 4.3, Req 2.4 + 13.4).
 *
 * `SortableList` wires up a @dnd-kit `DndContext` + `SortableContext` over a
 * list of ids and translates the pointer/keyboard drag into an index-based
 * `onReorder(from, to)` callback so it maps cleanly onto the resume store's
 * index-based reorder actions.
 *
 * Accessibility (Req 13.4): a `PointerSensor` (with a small activation distance
 * so clicks on inputs/buttons inside a row aren't hijacked) plus a
 * `KeyboardSensor` using `sortableKeyboardCoordinates` means rows can be
 * reordered entirely from the keyboard. Each row exposes a labelled drag handle.
 */

export interface SortableListProps {
  /** Ordered list of stable ids matching the rendered children order. */
  ids: string[];
  /** Called with the source/target indices when a drag completes. */
  onReorder: (fromIndex: number, toIndex: number) => void;
  children: ReactNode;
}

export function SortableList({ ids, onReorder, children }: SortableListProps) {
  const sensors = useSensors(
    // Require a tiny drag distance so interacting with inputs/buttons inside a
    // row doesn't start a drag by accident.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const move = computeReorder(ids, event.active?.id, event.over?.id);
    if (move) onReorder(move.from, move.to);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
      {/* Empty overlay keeps drag cursor consistent across the document. */}
      <DragOverlay />
    </DndContext>
  );
}

export interface SortableItemProps {
  id: string;
  /** Accessible label for the drag handle, e.g. "Reorder experience". */
  handleLabel: string;
  /**
   * Render prop receiving the drag handle element to place wherever the row
   * wants it. The handle carries the listeners/attributes and cursor styling.
   */
  children: (handle: ReactNode) => ReactNode;
}

/**
 * A single sortable row. Applies the live transform/transition from @dnd-kit
 * for smooth movement and elevates + fades the row while it's being dragged so
 * the drag state is visually obvious (Req 13.4).
 */
export function SortableItem({ id, handleLabel, children }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : undefined,
    boxShadow: isDragging ? '0 8px 20px rgba(15, 23, 42, 0.18)' : undefined,
    position: 'relative',
  };

  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      aria-label={handleLabel}
      className="cursor-grab touch-none select-none rounded-md border border-slate-300 px-2 py-1 text-slate-400 hover:bg-white hover:text-slate-600 active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      {/* Six-dot drag affordance. */}
      <span aria-hidden="true" className="text-sm leading-none">
        ⠿
      </span>
    </button>
  );

  return (
    <div ref={setNodeRef} style={style} data-dragging={isDragging || undefined}>
      {children(handle)}
    </div>
  );
}
