/**
 * Content script (Req 11.1).
 *
 * Runs on supported job-posting pages and establishes the messaging channel
 * with the popup/background. JD extraction and field detection are delegated to
 * per-site adapters (16.2); autofill lands in 16.3 — this file wires the typed
 * `chrome.runtime` listener to the adapter selected for the current URL.
 *
 * HARD RULE: this script never clicks Submit/Apply. No submit behavior is
 * implemented here and none will be (enforced/tested in 16.4).
 */
import {
  isPopupToContentMessage,
  type ContentToPopupResponse,
} from '../shared/messages.js';
import { getAdapterForUrl } from './adapters/index.js';
import { fillFields } from './fillFields.js';

function handleMessage(
  message: unknown,
  sendResponse: (response: ContentToPopupResponse) => void,
): boolean {
  if (!isPopupToContentMessage(message)) return false;

  const adapter = getAdapterForUrl(location.href);

  switch (message.type) {
    case 'PING':
      sendResponse({
        type: 'PONG',
        supported: adapter !== null,
        url: location.href,
      });
      return true;
    case 'EXTRACT_JD':
      sendResponse({
        type: 'JD_RESULT',
        jd: adapter ? adapter.extractJD(document) : null,
      });
      return true;
    case 'FIND_FIELDS':
      sendResponse({
        type: 'FIELDS_RESULT',
        fields: adapter ? adapter.findFormFields(document) : [],
      });
      return true;
    case 'AUTOFILL': {
      // Fills field VALUES only — never clicks Submit/Apply (Req 11.6, 16.4).
      const report = adapter
        ? fillFields(document, message.values)
        : { filled: [], unmatched: Object.keys(message.values) };
      sendResponse({
        type: 'AUTOFILL_RESULT',
        filled: report.filled,
        unmatched: report.unmatched,
      });
      return true;
    }
    default:
      return false;
  }
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    // Returning true keeps the response channel open for async replies.
    return handleMessage(message, sendResponse);
  });
}
