import { describe, it, expect } from 'vitest';
import {
  applyApprove,
  applyReject,
  initialPaymentRequestState,
  type PaymentRequestState,
} from './paymentState.js';

describe('paymentState — transition table', () => {
  it('starts pending with no credits granted', () => {
    expect(initialPaymentRequestState()).toEqual({
      status: 'pending',
      creditsGranted: 0,
    });
  });

  it('pending -> approve: transitions to approved and grants unlocksCount credits', () => {
    const before = initialPaymentRequestState();
    const { state, changed } = applyApprove(before, 3);
    expect(changed).toBe(true);
    expect(state).toEqual({ status: 'approved', creditsGranted: 3 });
  });

  it('pending -> reject: transitions to rejected and grants no credits', () => {
    const before = initialPaymentRequestState();
    const { state, changed } = applyReject(before);
    expect(changed).toBe(true);
    expect(state).toEqual({ status: 'rejected', creditsGranted: 0 });
  });

  it('approved -> approve: no-op (no double-grant)', () => {
    const before: PaymentRequestState = { status: 'approved', creditsGranted: 3 };
    const { state, changed } = applyApprove(before, 5);
    expect(changed).toBe(false);
    expect(state).toEqual(before);
  });

  it('approved -> reject: no-op (cannot flip a terminal state)', () => {
    const before: PaymentRequestState = { status: 'approved', creditsGranted: 3 };
    const { state, changed } = applyReject(before);
    expect(changed).toBe(false);
    expect(state).toEqual(before);
  });

  it('rejected -> approve: no-op', () => {
    const before: PaymentRequestState = { status: 'rejected', creditsGranted: 0 };
    const { state, changed } = applyApprove(before, 5);
    expect(changed).toBe(false);
    expect(state).toEqual(before);
  });

  it('rejected -> reject: no-op', () => {
    const before: PaymentRequestState = { status: 'rejected', creditsGranted: 0 };
    const { state, changed } = applyReject(before);
    expect(changed).toBe(false);
    expect(state).toEqual(before);
  });
});
