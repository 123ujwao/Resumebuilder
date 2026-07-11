/**
 * LinkedIn (Easy Apply) site adapter (Req 11.3).
 *
 * Handles job-posting and Easy Apply pages under linkedin.com/jobs. Selectors
 * are best-effort and ordered from most to least specific because LinkedIn's
 * DOM changes frequently.
 */
import type { DetectedField } from '../../shared/fields.js';
import { detectFields, extractFirstMatch } from './dom.js';
import type { SiteAdapter } from './types.js';

/** JD container candidates, most specific first. */
const JD_SELECTORS = [
  '.jobs-description__content',
  '.jobs-box__html-content',
  '.jobs-description-content__text',
  '.description__text',
  '#job-details',
] as const;

/** The Easy Apply modal/form area, when present, otherwise the whole doc. */
const FORM_SELECTORS = [
  '.jobs-easy-apply-content',
  '.jobs-easy-apply-modal',
  'form.jobs-easy-apply-form',
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

export const linkedInAdapter: SiteAdapter = {
  id: 'linkedin',

  matches(url: string): boolean {
    try {
      const { hostname, pathname } = new URL(url);
      return (
        /(^|\.)linkedin\.com$/.test(hostname) && pathname.includes('/jobs')
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
