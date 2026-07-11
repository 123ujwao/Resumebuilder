import { describe, expect, it } from 'vitest';
import { computeReorder } from './dnd';

/**
 * Unit tests for the pure reorder wiring (Task 4.3, Req 2.4).
 *
 * @dnd-kit pointer drags can't be simulated in jsdom, so we test the reorder
 * logic that maps active/over ids to store indices directly.
 */
describe('computeReorder', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('maps active/over ids to from/to indices', () => {
    expect(computeReorder(ids, 'a', 'c')).toEqual({ from: 0, to: 2 });
    expect(computeReorder(ids, 'd', 'b')).toEqual({ from: 3, to: 1 });
  });

  it('accepts numeric ids by coercing to string', () => {
    expect(computeReorder(['1', '2', '3'], 1, 3)).toEqual({ from: 0, to: 2 });
  });

  it('returns null when the item did not move', () => {
    expect(computeReorder(ids, 'b', 'b')).toBeNull();
  });

  it('returns null when dropped outside any item (over is null)', () => {
    expect(computeReorder(ids, 'a', null)).toBeNull();
    expect(computeReorder(ids, 'a', undefined)).toBeNull();
  });

  it('returns null when active id is missing', () => {
    expect(computeReorder(ids, null, 'b')).toBeNull();
  });

  it('returns null when an id is not present in the list (defensive guard)', () => {
    expect(computeReorder(ids, 'z', 'b')).toBeNull();
    expect(computeReorder(ids, 'a', 'z')).toBeNull();
  });
});
