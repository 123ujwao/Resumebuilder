/**
 * Shared DOM helpers for site adapters (Req 11.3).
 *
 * JD extraction and form-field detection follow the same shape across portals —
 * only the selectors differ — so the reusable logic lives here and each adapter
 * supplies its own ordered selector list. Selectors drift as portals change, so
 * extraction is best-effort: adapters try several candidates and fall back.
 */
import type { DetectedField } from '../../shared/fields.js';

/** Collapse runs of whitespace and trim, returning null for empty results. */
export function normalizeText(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw.replace(/\s+/g, ' ').trim();
  return text.length > 0 ? text : null;
}

/**
 * Try each selector in order and return the trimmed text of the first element
 * that yields non-empty content. Returns null when none match.
 */
export function extractFirstMatch(
  doc: Document,
  selectors: readonly string[],
): string | null {
  for (const selector of selectors) {
    let el: Element | null = null;
    try {
      el = doc.querySelector(selector);
    } catch {
      // Ignore malformed selectors so one bad entry can't break extraction.
      continue;
    }
    if (!el) continue;
    const text = normalizeText(el.textContent);
    if (text) return text;
  }
  return null;
}

type FieldControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/** Input `type` values that carry no user-fillable label (buttons, hidden…). */
const IGNORED_INPUT_TYPES = new Set([
  'hidden',
  'submit',
  'button',
  'reset',
  'image',
]);

/** Map a control element to a {@link DetectedField} `kind`. */
function kindOf(el: FieldControl): DetectedField['kind'] {
  const tag = el.tagName.toLowerCase();
  if (tag === 'textarea') return 'textarea';
  if (tag === 'select') return 'select';
  const type = (el.getAttribute('type') ?? 'text').toLowerCase();
  switch (type) {
    case 'email':
      return 'email';
    case 'tel':
      return 'tel';
    case 'file':
      return 'file';
    case 'text':
    case 'search':
    case 'url':
    case '':
      return 'text';
    default:
      return 'other';
  }
}

/** Derive a stable key for a control from its id/name/label. */
function keyOf(el: FieldControl, label: string): string {
  const raw = el.getAttribute('name') || el.id || label || 'field';
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Find the best human-readable label for a control, checking (in order):
 * an associated `<label for>`, an ancestor `<label>`, `aria-label`,
 * `aria-labelledby`, `placeholder`, then the field's `name`/`id`.
 */
function labelFor(doc: Document, el: FieldControl): string | null {
  if (el.id) {
    const escaped = cssEscape(el.id);
    const forLabel = doc.querySelector(`label[for="${escaped}"]`);
    const text = normalizeText(forLabel?.textContent);
    if (text) return text;
  }

  const ancestorLabel = el.closest('label');
  if (ancestorLabel) {
    const text = normalizeText(ancestorLabel.textContent);
    if (text) return text;
  }

  const ariaLabel = normalizeText(el.getAttribute('aria-label'));
  if (ariaLabel) return ariaLabel;

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const parts = labelledBy
      .split(/\s+/)
      .map((id) => normalizeText(doc.getElementById(id)?.textContent))
      .filter((t): t is string => Boolean(t));
    if (parts.length > 0) return parts.join(' ');
  }

  const placeholder = normalizeText(el.getAttribute('placeholder'));
  if (placeholder) return placeholder;

  return normalizeText(el.getAttribute('name')) ?? normalizeText(el.id);
}

/** Minimal CSS attribute-value escape (jsdom lacks CSS.escape). */
function cssEscape(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}

/** A detected field paired with the concrete control element it came from. */
export interface DetectedFieldWithElement {
  field: DetectedField;
  element: FieldControl;
}

/**
 * Detect labelled form controls within `root` (or the whole document), returning
 * each {@link DetectedField} alongside its control element. Controls with no
 * discoverable label, and non-fillable input types, are skipped. Keys are
 * de-duplicated so downstream autofill (16.3) can address fields uniquely.
 *
 * This is the single source of truth for field detection: {@link detectFields}
 * projects away the elements, and the autofill writer (16.3) uses the elements
 * to set values — both share the exact same key assignment so keys always line
 * up between "find fields" and "fill fields".
 */
export function detectFieldsWithElements(
  doc: Document,
  root?: Element | null,
): DetectedFieldWithElement[] {
  const scope: ParentNode = root ?? doc;
  const controls = scope.querySelectorAll<FieldControl>(
    'input, textarea, select',
  );

  const results: DetectedFieldWithElement[] = [];
  const usedKeys = new Set<string>();

  controls.forEach((el) => {
    if (el.tagName.toLowerCase() === 'input') {
      const type = (el.getAttribute('type') ?? 'text').toLowerCase();
      if (IGNORED_INPUT_TYPES.has(type)) return;
    }

    const label = labelFor(doc, el);
    if (!label) return;

    let key = keyOf(el, label);
    if (!key) return;
    if (usedKeys.has(key)) {
      let i = 2;
      while (usedKeys.has(`${key}-${i}`)) i += 1;
      key = `${key}-${i}`;
    }
    usedKeys.add(key);

    results.push({ field: { key, label, kind: kindOf(el) }, element: el });
  });

  return results;
}

/**
 * Detect labelled form controls within `root` (or the whole document). Controls
 * with no discoverable label, and non-fillable input types, are skipped. Keys
 * are de-duplicated so downstream autofill (16.3) can address fields uniquely.
 */
export function detectFields(doc: Document, root?: Element | null): DetectedField[] {
  return detectFieldsWithElements(doc, root).map((r) => r.field);
}
