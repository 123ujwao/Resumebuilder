import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isPopupToContentMessage,
  sendToTab,
  type PopupToContentMessage,
} from './messages.js';

/** Unit tests for the typed message contract helpers (Req 11.1). */

describe('isPopupToContentMessage', () => {
  it('accepts each known message type', () => {
    const messages: PopupToContentMessage[] = [
      { type: 'PING' },
      { type: 'EXTRACT_JD' },
      { type: 'FIND_FIELDS' },
      { type: 'AUTOFILL', values: { name: 'Ada' } },
    ];
    for (const m of messages) {
      expect(isPopupToContentMessage(m)).toBe(true);
    }
  });

  it('rejects unknown or malformed values', () => {
    expect(isPopupToContentMessage(null)).toBe(false);
    expect(isPopupToContentMessage(undefined)).toBe(false);
    expect(isPopupToContentMessage('PING')).toBe(false);
    expect(isPopupToContentMessage({})).toBe(false);
    expect(isPopupToContentMessage({ type: 'NOPE' })).toBe(false);
  });
});

describe('sendToTab', () => {
  afterEach(() => {
    delete (globalThis as unknown as { chrome?: unknown }).chrome;
  });

  it('returns null when chrome messaging is unavailable', async () => {
    delete (globalThis as unknown as { chrome?: unknown }).chrome;
    expect(await sendToTab(1, { type: 'PING' })).toBeNull();
  });

  it('forwards the message and returns the typed response', async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      type: 'PONG',
      supported: true,
      url: 'https://www.linkedin.com/jobs/view/1',
    });
    (globalThis as unknown as { chrome: unknown }).chrome = {
      tabs: { sendMessage },
    };
    const res = await sendToTab(42, { type: 'PING' });
    expect(sendMessage).toHaveBeenCalledWith(42, { type: 'PING' });
    expect(res).toEqual({
      type: 'PONG',
      supported: true,
      url: 'https://www.linkedin.com/jobs/view/1',
    });
  });

  it('returns null when no content script receives the message', async () => {
    const sendMessage = vi.fn().mockRejectedValue(new Error('no receiver'));
    (globalThis as unknown as { chrome: unknown }).chrome = {
      tabs: { sendMessage },
    };
    expect(await sendToTab(7, { type: 'EXTRACT_JD' })).toBeNull();
  });
});
