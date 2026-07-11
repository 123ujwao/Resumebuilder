/**
 * Indeed site adapter (Req 11.3).
 *
 * Handles Indeed job-view and application pages across country domains
 * (indeed.com, in.indeed.com, indeed.co.uk, …). Selectors are best-effort and
 * ordered most-specific first.
 */
import type { DetectedField } from '../../shared/fields.js';
import { detectFields, extractFirstMatch } from './dom.js';
import type { SiteAdapter } from './types.js';

const JD_SELECTORS = [
  '#jobDescriptionText',
  '.jobsearch-jobDescriptionText',
  '.jobsearch-JobComponent-description',
  '[data-testid="jobDescriptionText"]',
] as const;

const FORM_SELECTORS = [
  '.ia-BasePage-content',
  'form[action*="apply"]',
  'main',
] as const;

function firstElement(doc: Document, selectors: readonly string[]): Element | null {
  for (const selector of selectors) {
    try {
      const el = doc.querySelector(selector);
      if (el) return el;
    } catch {
      continue;
    }
  }
  return null;
}

export const indeedAdapter: SiteAdapter = {
  id: 'indeed',

  matches(url: string): boolean {
    try {
      const { hostname, pathname } = new URL(url);
      const isIndeed = /(^|\.)indeed\.[a-z.]+$/.test(hostname);
      if (!isIndeed) return false;
      return (
        pathname.includes('/viewjob') ||
        pathname.includes('/jobs') ||
        pathname.includes('/job/') ||
        pathname.includes('/apply')
      );
    } catch {
      return false;
    }
  },

  extractJD(doc: Document): string | null {
    return extractFirstMatch(doc, JD_SELECTORS);
  },

  findFormFields(doc: Document): DetectedField[] {
    const formRoot = firstElement(doc, FORM_SELECTORS);
    return detectFields(doc, formRoot);
  },
};
