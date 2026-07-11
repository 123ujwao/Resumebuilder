/**
 * Site-adapter registry (Req 11.3).
 *
 * Exposes the ordered list of supported portal adapters and a lookup that
 * returns the first adapter whose `matches(url)` is true, or null on
 * unsupported pages. The content script uses this to decide whether a page is a
 * supported posting and which selectors to use.
 */
import { indeedAdapter } from './indeed.js';
import { linkedInAdapter } from './linkedin.js';
import { naukriAdapter } from './naukri.js';
import type { SiteAdapter } from './types.js';

/** All supported adapters, in match-priority order. */
export const adapters: readonly SiteAdapter[] = [
  linkedInAdapter,
  indeedAdapter,
  naukriAdapter,
];

/** Return the first adapter that handles `url`, or null if none do. */
export function getAdapterForUrl(url: string): SiteAdapter | null {
  return adapters.find((adapter) => adapter.matches(url)) ?? null;
}

export type { SiteAdapter } from './types.js';
export { linkedInAdapter } from './linkedin.js';
export { indeedAdapter } from './indeed.js';
export { naukriAdapter } from './naukri.js';
