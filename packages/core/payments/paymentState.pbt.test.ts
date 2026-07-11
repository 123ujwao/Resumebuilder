import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  applyApprove,
  applyReject,
  initialPaymentRequestState,
  type PaymentRequestState,
  type PaymentStatus,
} from './paymentState.js';

/**
 * Property-based tests for the pure payment-request state machine.
 *
 * These mirror the Supabase `approve_payment` / `reject_payment` RPC semantics
 * (supabase/migrations/0003_rpcs.sql): a request transitions ONLY from
 * 'pending' → 'approved'/'rejected', any call while non-pending is a no-op
 * (the RPC raises and makes no change), and approving grants the product's
 * `unlocks_count` credits exactly once.
 *
 * Strategy: generate an arbitrary sequence of actions (approve with an
 * arbitrary unlocksCount >= 0, or reject), start from 'pending', apply them in
 * order, and assert the Property 6 invariants hold across the whole sequence.
 */

type Action =
  | { kind: 'approve'; unlocksCount: number }
  | { kind: 'reject' };

const actionArb: fc.Arbitrary<Action> = fc.oneof(
  fc.record({
    kind: fc.constant('approve' as const),
    unlocksCount: fc.integer({ min: 0, max: 100 }),
  }),
  fc.record({ kind: fc.constant('reject' as const) }),
);

const NUM_RUNS = 1000;

function applyAction(state: PaymentRequestState, action: Action) {
  return action.kind === 'approve'
    ? applyApprove(state, action.unlocksCount)
    : applyReject(state);
}

describe('paymentState PBT — Property 6a: status monotonicity', () => {
  it('a request undergoes at most one status change; once non-pending it is terminal', () => {
    // **Validates: Requirements 10.6, 10.7**
    fc.assert(
      fc.property(
        fc.array(actionArb, { minLength: 0, maxLength: 30 }),
        (actions) => {
          let state = initialPaymentRequestState();
          expect(state.status).toBe('pending');

          let statusChanges = 0;
          const observedStatuses: PaymentStatus[] = [state.status];

          for (const action of actions) {
            const prev = state;
            const { state: next, changed } = applyAction(state, action);

            if (changed) {
              // A change is only ever allowed out of 'pending'.
              expect(prev.status).toBe('pending');
              // ...and only to a terminal state matching the action.
              expect(next.status).toBe(
                action.kind === 'approve' ? 'approved' : 'rejected',
              );
              statusChanges += 1;
            } else {
              // No-op: state must be byte-identical (RPC raises, changes nothing).
              expect(next).toBe(prev);
            }

            state = next;
            observedStatuses.push(state.status);
          }

          // Across the whole sequence there is at most ONE status change.
          expect(statusChanges).toBeLessThanOrEqual(1);
          // Final status is one of the three valid states.
          expect(['pending', 'approved', 'rejected']).toContain(state.status);
          // Once non-pending, the status never changes again (terminal): the
          // sequence of statuses is pending* followed by an optional single
          // terminal value repeated.
          const firstTerminalIdx = observedStatuses.findIndex(
            (s) => s !== 'pending',
          );
          if (firstTerminalIdx !== -1) {
            const terminal = observedStatuses[firstTerminalIdx];
            for (let i = firstTerminalIdx; i < observedStatuses.length; i++) {
              expect(observedStatuses[i]).toBe(terminal);
            }
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('paymentState PBT — Property 6b: credits granted exactly once', () => {
  it('creditsGranted equals the first successful approval unlocksCount, or 0 if never approved', () => {
    // **Validates: Requirements 10.6, 10.7**
    fc.assert(
      fc.property(
        fc.array(actionArb, { minLength: 0, maxLength: 30 }),
        (actions) => {
          let state = initialPaymentRequestState();

          // Track the unlocksCount of the FIRST approve that succeeds while pending.
          let firstApprovedUnlocks: number | null = null;
          let approvalCount = 0;

          for (const action of actions) {
            const { state: next, changed } = applyAction(state, action);

            if (changed && action.kind === 'approve') {
              approvalCount += 1;
              if (firstApprovedUnlocks === null) {
                firstApprovedUnlocks = action.unlocksCount;
              }
            }

            state = next;
          }

          if (firstApprovedUnlocks === null) {
            // Never approved (rejected or still pending) => no credits granted.
            expect(state.creditsGranted).toBe(0);
            expect(state.status).not.toBe('approved');
          } else {
            // Approved exactly once, granting exactly that unlocksCount.
            expect(approvalCount).toBe(1);
            expect(state.status).toBe('approved');
            expect(state.creditsGranted).toBe(firstApprovedUnlocks);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('no matter how many approve calls follow, credits are never granted more than once', () => {
    // **Validates: Requirements 10.6, 10.7**
    fc.assert(
      fc.property(
        // At least one approve up front, then arbitrary extra approves.
        fc.integer({ min: 0, max: 100 }),
        fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 0, maxLength: 20 }),
        (firstUnlocks, laterUnlocks) => {
          let state = initialPaymentRequestState();

          const first = applyApprove(state, firstUnlocks);
          expect(first.changed).toBe(true);
          state = first.state;
          expect(state.creditsGranted).toBe(firstUnlocks);

          for (const u of laterUnlocks) {
            const { state: next, changed } = applyApprove(state, u);
            expect(changed).toBe(false);
            expect(next.creditsGranted).toBe(firstUnlocks);
            state = next;
          }

          expect(state.creditsGranted).toBe(firstUnlocks);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
