import { describe, it, expect } from 'vitest';
import {
  FREE_DOWNLOAD_LIMIT,
  decideDownload,
  type GatingProfile,
  type GatingUserCredit,
} from './gating.js';

const PRODUCT = 'resume_only';
const OTHER_PRODUCT = 'resume_plus_cover_letter';

function profile(overrides: Partial<GatingProfile> = {}): GatingProfile {
  return { is_free_forever: false, free_downloads_used: 0, ...overrides };
}

function credit(
  product_id: string,
  credits_remaining: number,
): GatingUserCredit {
  return { product_id, credits_remaining };
}

describe('decideDownload — free-forever supremacy (Req 8.2)', () => {
  it('allows without accounting even when free downloads are exhausted and no credits exist', () => {
    const result = decideDownload(
      profile({ is_free_forever: true, free_downloads_used: 99 }),
      [],
      PRODUCT,
    );
    expect(result).toEqual({ action: 'allow', reason: 'free_forever' });
  });

  it('takes precedence over available credits', () => {
    const result = decideDownload(
      profile({ is_free_forever: true, free_downloads_used: FREE_DOWNLOAD_LIMIT }),
      [credit(PRODUCT, 5)],
      PRODUCT,
    );
    expect(result).toEqual({ action: 'allow', reason: 'free_forever' });
  });
});

describe('decideDownload — free trial path (Req 8.3, 8.4)', () => {
  it('increments free download when 0 used', () => {
    const result = decideDownload(profile({ free_downloads_used: 0 }), [], PRODUCT);
    expect(result).toEqual({ action: 'allow_and_increment_free' });
  });

  it('increments free download when 1 used (still below the limit)', () => {
    const result = decideDownload(profile({ free_downloads_used: 1 }), [], PRODUCT);
    expect(result).toEqual({ action: 'allow_and_increment_free' });
  });

  it('the free counter is shared across product types', () => {
    // Having consumed 1 free download for any product leaves 1 free download
    // that can be used for a DIFFERENT product (counter is on the profile).
    const result = decideDownload(
      profile({ free_downloads_used: 1 }),
      [],
      OTHER_PRODUCT,
    );
    expect(result).toEqual({ action: 'allow_and_increment_free' });
  });

  it('stops using the free path once the shared limit is reached', () => {
    const result = decideDownload(
      profile({ free_downloads_used: FREE_DOWNLOAD_LIMIT }),
      [],
      PRODUCT,
    );
    expect(result).toEqual({ action: 'require_payment', productId: PRODUCT });
  });
});

describe('decideDownload — credit path (Req 8.5)', () => {
  it('decrements credit when free is exhausted and product has a positive balance', () => {
    const result = decideDownload(
      profile({ free_downloads_used: FREE_DOWNLOAD_LIMIT }),
      [credit(PRODUCT, 3)],
      PRODUCT,
    );
    expect(result).toEqual({ action: 'allow_and_decrement_credit' });
  });

  it('looks up the credit specific to the requested product', () => {
    // Credits exist for OTHER_PRODUCT but not the requested PRODUCT.
    const result = decideDownload(
      profile({ free_downloads_used: FREE_DOWNLOAD_LIMIT }),
      [credit(OTHER_PRODUCT, 5)],
      PRODUCT,
    );
    expect(result).toEqual({ action: 'require_payment', productId: PRODUCT });
  });

  it('picks the matching product when multiple credit entries exist', () => {
    const result = decideDownload(
      profile({ free_downloads_used: FREE_DOWNLOAD_LIMIT }),
      [credit(OTHER_PRODUCT, 0), credit(PRODUCT, 1)],
      PRODUCT,
    );
    expect(result).toEqual({ action: 'allow_and_decrement_credit' });
  });

  it('prefers the free path over credits while free downloads remain', () => {
    const result = decideDownload(
      profile({ free_downloads_used: 0 }),
      [credit(PRODUCT, 5)],
      PRODUCT,
    );
    expect(result).toEqual({ action: 'allow_and_increment_free' });
  });
});

describe('decideDownload — require payment (Req 8.6)', () => {
  it('requires payment when free is exhausted and no credits entry exists', () => {
    const result = decideDownload(
      profile({ free_downloads_used: FREE_DOWNLOAD_LIMIT }),
      [],
      PRODUCT,
    );
    expect(result).toEqual({ action: 'require_payment', productId: PRODUCT });
  });

  it('requires payment when the product credit balance is zero', () => {
    const result = decideDownload(
      profile({ free_downloads_used: FREE_DOWNLOAD_LIMIT }),
      [credit(PRODUCT, 0)],
      PRODUCT,
    );
    expect(result).toEqual({ action: 'require_payment', productId: PRODUCT });
  });
});

describe('decideDownload — defensive handling of corrupt data', () => {
  it('treats a negative credit balance as no download available', () => {
    const result = decideDownload(
      profile({ free_downloads_used: FREE_DOWNLOAD_LIMIT }),
      [credit(PRODUCT, -1)],
      PRODUCT,
    );
    expect(result).toEqual({ action: 'require_payment', productId: PRODUCT });
  });

  it('treats a NaN credit balance as no download available', () => {
    const result = decideDownload(
      profile({ free_downloads_used: FREE_DOWNLOAD_LIMIT }),
      [credit(PRODUCT, Number.NaN)],
      PRODUCT,
    );
    expect(result).toEqual({ action: 'require_payment', productId: PRODUCT });
  });

  it('does not grant a free download from a negative free counter', () => {
    const result = decideDownload(profile({ free_downloads_used: -5 }), [], PRODUCT);
    expect(result).toEqual({ action: 'require_payment', productId: PRODUCT });
  });

  it('does not grant a free download from a NaN free counter', () => {
    const result = decideDownload(
      profile({ free_downloads_used: Number.NaN }),
      [],
      PRODUCT,
    );
    expect(result).toEqual({ action: 'require_payment', productId: PRODUCT });
  });

  it('a corrupt free counter still falls through to a valid credit', () => {
    const result = decideDownload(
      profile({ free_downloads_used: Number.NaN }),
      [credit(PRODUCT, 2)],
      PRODUCT,
    );
    expect(result).toEqual({ action: 'allow_and_decrement_credit' });
  });
});
