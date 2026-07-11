/**
 * Naukri site adapter (Req 11.3).
 *
 * Handles Naukri job-detail pages under naukri.com. Naukri's JD container class
 * names are hashed/generated, so the selector list mixes stable-ish class
 * prefixes with more generic fallbacks. Best-effort and most-specific first.
 */
import type { DetectedField } from '../../shared/fields.js';
import { detectFields, extractFirstMatch } from './dom.js';
import type { SiteAdapter } from './types.js';

const JD_SELECTORS = [
  '.styles_JDC__dang-inner-html__',
  '[class*="JDC__dang-inner-html"]',
  '.job-desc',
  '.jd-container',
  '.dang-inner-html',
  'section.job-desc',
] as const;

const FORM_SELECTORS = [
  '.styles_apply-form__',
  '[class*="apply-form"]',
  'form',
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

export const naukriAdapter: SiteAdapter = {
  id: 'naukri',

  matches(url: string): boolean {
    try {
      const { hostname, pathname } = new URL(url);
      if (!/(^|\.)naukri\.com$/.test(hostname)) return false;
      // Naukri job pages typically end in "-job-listings-..." or "/job-listings-".
      return (
        pathname.includes('job-listings') ||
        pathname.includes('/jobs') ||
        /-\d{6,}$/.test(pathname)
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
