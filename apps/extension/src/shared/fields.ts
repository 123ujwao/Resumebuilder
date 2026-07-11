/**
 * Shared form-field types for autofill (Req 11.5).
 *
 * The `SiteAdapter` implementations (16.2) detect fields on a posting page and
 * the popup (16.3) maps `ResumeData` values onto them. Only the shapes are
 * defined here so the message contract and adapters can share them without a
 * circular dependency.
 */

/** A form input detected on a job-application page. */
export interface DetectedField {
  /** A stable key derived from the field's label/name/id. */
  key: string;
  /** The human-readable label associated with the field, when found. */
  label: string;
  /** The kind of control, used to decide how to fill it. */
  kind: 'text' | 'textarea' | 'email' | 'tel' | 'select' | 'file' | 'other';
}

/** The outcome of an autofill pass: what was filled and what was not (Req 11.5). */
export interface FillReport {
  /** Field keys that were successfully filled. */
  filled: string[];
  /** Field keys that could not be matched and need manual review. */
  unmatched: string[];
}
