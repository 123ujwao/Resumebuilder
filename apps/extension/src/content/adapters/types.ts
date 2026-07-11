/**
 * Site adapter contract (Req 11.3).
 *
 * Each supported job portal (LinkedIn Easy Apply, Indeed, Naukri) ships its own
 * adapter because portal DOMs change often and their selectors must be isolated.
 * A `Document` is passed into `extractJD`/`findFormFields` (rather than reading
 * the global `document`) so adapters are unit-testable against saved DOM
 * fixtures via jsdom.
 *
 * This task (16.2) implements `matches` + `extractJD` + `findFormFields`.
 * `fillFields` (autofill) is intentionally not part of this interface yet — it
 * lands in 16.3, and Submit/Apply is never clicked (16.4).
 */
import type { DetectedField } from '../../shared/fields.js';

export interface SiteAdapter {
  /** Stable identifier for the portal (e.g. 'linkedin', 'indeed', 'naukri'). */
  id: string;
  /** Whether this adapter handles the given page URL. */
  matches(url: string): boolean;
  /** Extract the job description text, or null when no JD container is found. */
  extractJD(doc: Document): string | null;
  /** Detect labelled form controls in the application area. */
  findFormFields(doc: Document): DetectedField[];
}
