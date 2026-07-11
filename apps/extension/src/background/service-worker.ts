/**
 * Background service worker (Req 11.1).
 *
 * Manifest V3 uses a service worker instead of a persistent background page.
 * For this scaffold it just logs lifecycle events; later subtasks can route
 * messages or coordinate work here. The shared resume/auth data lives in
 * `chrome.storage.local` (see ../shared/storage.ts, Req 11.2) so the popup and
 * content script read it directly without needing the worker as a broker.
 *
 * HARD RULE: no auto-submit behavior anywhere (enforced/tested in 16.4).
 */

if (typeof chrome !== 'undefined' && chrome.runtime?.onInstalled) {
  chrome.runtime.onInstalled.addListener((details) => {
    // Keep this lightweight; the worker is ephemeral in MV3.
    console.info('[ResumeForge] extension installed:', details.reason);
  });
}

export {};
