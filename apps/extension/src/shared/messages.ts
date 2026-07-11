/**
 * Typed message contract for extension messaging (Req 11.1).
 *
 * The popup, background service worker, and content script communicate over
 * `chrome.runtime` messaging. This module defines the message shapes and small
 * type-safe helpers so all three surfaces agree on the protocol. The concrete
 * JD-extraction and autofill payloads are filled in by later subtasks (16.2 JD
 * extraction, 16.3 autofill); the channel and contract are established here.
 */
import type { DetectedField } from './fields.js';

/** Messages the popup sends to the content script running in the active tab. */
export type PopupToContentMessage =
  /** Ask the content script whether the current page is a supported posting. */
  | { type: 'PING' }
  /** Request the job description text extracted from the page (16.2). */
  | { type: 'EXTRACT_JD' }
  /** Request the list of detected form fields on the page (16.2/16.3). */
  | { type: 'FIND_FIELDS' }
  /** Request autofill of the given field values (16.3). Never submits. */
  | { type: 'AUTOFILL'; values: Record<string, string> };

/** Responses the content script returns to the popup. */
export type ContentToPopupResponse =
  | { type: 'PONG'; supported: boolean; url: string }
  | { type: 'JD_RESULT'; jd: string | null }
  | { type: 'FIELDS_RESULT'; fields: DetectedField[] }
  /** Reports which fields were filled and which could not be matched (16.3). */
  | { type: 'AUTOFILL_RESULT'; filled: string[]; unmatched: string[] };

/** Any message flowing over the runtime channel. */
export type ExtensionMessage = PopupToContentMessage;

/** Type guard for messages arriving in the content script. */
export function isPopupToContentMessage(
  value: unknown,
): value is PopupToContentMessage {
  if (typeof value !== 'object' || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return (
    type === 'PING' ||
    type === 'EXTRACT_JD' ||
    type === 'FIND_FIELDS' ||
    type === 'AUTOFILL'
  );
}

/**
 * Send a typed message to the content script in the given tab and await the
 * typed response. Returns `null` when messaging is unavailable (e.g. no content
 * script on the page).
 */
export async function sendToTab(
  tabId: number,
  message: PopupToContentMessage,
): Promise<ContentToPopupResponse | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.sendMessage) return null;
  try {
    return (await chrome.tabs.sendMessage(tabId, message)) ?? null;
  } catch {
    // No receiving content script (unsupported page, or not yet injected).
    return null;
  }
}
