import { describe, expect, it } from 'vitest';
import { buildUpiUri, formatUpiAmount } from './upi';

/**
 * Tests for the pure UPI deep-link builder (Task 10, Req 9.1).
 * No DB / network — this is deterministic string construction.
 */

describe('formatUpiAmount', () => {
  it('formats integers and decimals to 2 places', () => {
    expect(formatUpiAmount(49)).toBe('49.00');
    expect(formatUpiAmount(49.5)).toBe('49.50');
    expect(formatUpiAmount('99.9')).toBe('99.90');
  });

  it('falls back to 0.00 for invalid/negative amounts', () => {
    expect(formatUpiAmount(Number.NaN)).toBe('0.00');
    expect(formatUpiAmount(-5)).toBe('0.00');
    expect(formatUpiAmount('not-a-number')).toBe('0.00');
  });
});

describe('buildUpiUri (Req 9.1)', () => {
  it('builds a upi://pay link with pa, am, cu=INR and tn', () => {
    const uri = buildUpiUri({ upiId: 'operator@bank', amount: 49, note: 'ResumeForge' });
    expect(uri).toBe('upi://pay?pa=operator%40bank&am=49.00&cu=INR&tn=ResumeForge');
  });

  it('pre-fills the amount from the price', () => {
    const uri = buildUpiUri({ upiId: 'op@bank', amount: 199.5 });
    expect(uri).toContain('am=199.50');
    expect(uri).toContain('cu=INR');
  });

  it('URL-encodes the note, using %20 for spaces (not +)', () => {
    const uri = buildUpiUri({
      upiId: 'op@bank',
      amount: 10,
      note: 'Resume unlock & more',
    });
    expect(uri).toContain('tn=Resume%20unlock%20%26%20more');
    expect(uri).not.toContain('+');
  });

  it('URL-encodes the payee id', () => {
    const uri = buildUpiUri({ upiId: 'user name@bank', amount: 1 });
    expect(uri).toContain('pa=user%20name%40bank');
  });

  it('omits tn when no note is provided', () => {
    const uri = buildUpiUri({ upiId: 'op@bank', amount: 5 });
    expect(uri).not.toContain('tn=');
  });

  it('throws when upiId is missing', () => {
    expect(() => buildUpiUri({ upiId: '', amount: 10 })).toThrow();
    expect(() => buildUpiUri({ upiId: '   ', amount: 10 })).toThrow();
  });
});
