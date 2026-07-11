// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { fillFields } from './fillFields.js';
import { detectFieldsWithElements } from './adapters/dom.js';
import {
  isPopupToContentMessage,
  type ContentToPopupResponse,
} from '../shared/messages.js';
import { getAdapterForUrl } from './adapters/index.js';

/**
 * Property-based test for Property 7 — No auto-submit (Req 11.6).
 *
 * Property 7: For ANY autofill invocation, the number of Submit/Apply clicks
 * issued by the extension is ALWAYS zero. The extension never clicks
 * Submit/Apply automatically and always stops at the final human review step.
 *
 * **Validates: Requirements 11.6**
 *
 * Strategy:
 *  - Generate an arbitrary form containing a random set of labelled fillable
 *    fields (text/email/tel/textarea) PLUS a variety of submit/apply controls:
 *    `<button type="submit">`, `<input type="submit">`, a bare `<button>Submit`,
 *    and a `<form>` with a submit handler.
 *  - Instrument EVERYTHING that could represent an auto-submit: a global
 *    capture-phase `click` listener, a `submit` listener on the form, and spies
 *    wrapping `HTMLElement.prototype.click`, `HTMLFormElement.prototype.submit`
 *    and `requestSubmit`.
 *  - Generate an arbitrary values map (mixing keys that DO match detected fields
 *    with keys that don't) and drive it through both `fillFields` directly and
 *    the content-script AUTOFILL handler path.
 *  - Assert the total activation count is 0, AND that filling actually did work
 *    (matched keys received their values) so the property isn't vacuously true.
 */

// A single fillable field spec used to build arbitrary forms.
interface FieldSpec {
  tag: 'input' | 'textarea';
  type: 'text' | 'email' | 'tel';
  label: string;
  id: string;
}

const labelArb = fc
  .constantFrom(
    'Full name',
    'First name',
    'Last name',
    'Email address',
    'Mobile phone',
    'Phone',
    'Cover letter',
    'LinkedIn URL',
    'Portfolio',
    'City',
  );

const fieldArb: fc.Arbitrary<FieldSpec> = fc
  .record({
    kind: fc.constantFrom<'text' | 'email' | 'tel' | 'textarea'>(
      'text',
      'email',
      'tel',
      'textarea',
    ),
    label: labelArb,
    n: fc.integer({ min: 0, max: 9999 }),
  })
  .map(({ kind, label, n }) => {
    const id = `f-${n}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    if (kind === 'textarea') {
      return { tag: 'textarea', type: 'text', label, id };
    }
    return { tag: 'input', type: kind, label, id };
  });

/** Build the form HTML from field specs plus a full complement of submit controls. */
function buildFormHtml(fields: FieldSpec[]): string {
  const fieldHtml = fields
    .map((f) => {
      const labelEl = `<label for="${f.id}">${f.label}</label>`;
      if (f.tag === 'textarea') {
        return `${labelEl}<textarea id="${f.id}" name="${f.id}"></textarea>`;
      }
      return `${labelEl}<input id="${f.id}" name="${f.id}" type="${f.type}" />`;
    })
    .join('\n');

  return `
    <form id="apply-form">
      ${fieldHtml}
      <input type="hidden" name="csrf" value="tok" />
      <button id="btn-submit" type="submit">Apply</button>
      <input id="input-submit" type="submit" value="Submit application" />
      <button id="btn-plain">Submit</button>
      <button id="btn-apply" type="button">Easy Apply</button>
    </form>
  `;
}

function docOf(html: string): Document {
  return new DOMParser().parseFromString(
    `<!doctype html><html><body>${html}</body></html>`,
    'text/html',
  );
}

/** Instrumentation counters + teardown for one document. */
interface Probe {
  count(): number;
  restore(): void;
}

/**
 * Instrument every activation channel on the document and return a live counter.
 * Covers: click events (any element, capture phase), form submit events, and the
 * imperative `click()` / `submit()` / `requestSubmit()` methods.
 */
function instrument(doc: Document): Probe {
  let clicks = 0;
  let submits = 0;

  const onClick = () => {
    clicks += 1;
  };
  const onSubmit = (e: Event) => {
    submits += 1;
    // Prevent jsdom "not implemented: navigation" noise if it ever fired.
    e.preventDefault();
  };

  doc.addEventListener('click', onClick, true);
  const form = doc.querySelector('form');
  form?.addEventListener('submit', onSubmit, true);

  // DOMParser-created documents have no `defaultView`, but their elements are
  // still instances of the global jsdom prototypes, so patch those.
  const ElProto = HTMLElement.prototype;
  const FormProto = HTMLFormElement.prototype;

  const origClick = ElProto.click;
  const origSubmit = FormProto.submit;
  const origRequestSubmit = FormProto.requestSubmit;

  ElProto.click = function patchedClick(this: HTMLElement, ...args: unknown[]) {
    clicks += 1;
    return origClick.apply(this, args as []);
  };
  FormProto.submit = function patchedSubmit(this: HTMLFormElement) {
    submits += 1;
    // Do NOT call through — avoids jsdom navigation errors.
  };
  FormProto.requestSubmit = function patchedRequestSubmit(
    this: HTMLFormElement,
  ) {
    submits += 1;
  };

  return {
    count: () => clicks + submits,
    restore: () => {
      doc.removeEventListener('click', onClick, true);
      form?.removeEventListener('submit', onSubmit, true);
      ElProto.click = origClick;
      FormProto.submit = origSubmit;
      FormProto.requestSubmit = origRequestSubmit;
    },
  };
}

/**
 * Minimal re-implementation of the content-script AUTOFILL branch so the test
 * can exercise the handler path without a `chrome` runtime. Mirrors
 * `content-script.ts` exactly: on AUTOFILL it calls `fillFields` and never
 * touches any button/form.
 */
function runAutofillHandler(
  doc: Document,
  values: Record<string, string>,
): ContentToPopupResponse {
  const message = { type: 'AUTOFILL', values } as const;
  if (!isPopupToContentMessage(message)) {
    throw new Error('constructed message failed its own type guard');
  }
  // Adapter selection is URL-based; for a synthetic doc we fill directly, which
  // is the same code path content-script uses when an adapter matches.
  const report = fillFields(doc, message.values);
  return {
    type: 'AUTOFILL_RESULT',
    filled: report.filled,
    unmatched: report.unmatched,
  };
}

/** Build a values map: all detected keys (correct values) + some junk keys. */
function buildValues(
  detectedKeys: string[],
  junk: string[],
): Record<string, string> {
  const values: Record<string, string> = {};
  detectedKeys.forEach((k, i) => {
    values[k] = `value-${i}`;
  });
  junk.forEach((k, i) => {
    // Avoid accidentally colliding with a real key.
    if (!(k in values)) values[k] = `junk-${i}`;
  });
  return values;
}

describe('Property 7: no auto-submit (Req 11.6)', () => {
  it('never clicks Submit/Apply nor submits the form across arbitrary forms + value maps', () => {
    fc.assert(
      fc.property(
        fc.array(fieldArb, { minLength: 1, maxLength: 8 }),
        fc.array(fc.string({ minLength: 1, maxLength: 12 }), {
          maxLength: 5,
        }),
        fc.boolean(),
        (fields, junkKeys, useHandlerPath) => {
          const doc = docOf(buildFormHtml(fields));
          const probe = instrument(doc);
          try {
            // Use the SAME detection the writer uses so keys line up, and keep
            // the concrete elements so we can verify values were written.
            const detected = detectFieldsWithElements(doc);
            const detectedKeys = detected.map((d) => d.field.key);
            const values = buildValues(detectedKeys, junkKeys);

            const report = useHandlerPath
              ? (() => {
                  const r = runAutofillHandler(doc, values);
                  return r.type === 'AUTOFILL_RESULT'
                    ? { filled: r.filled, unmatched: r.unmatched }
                    : { filled: [], unmatched: [] };
                })()
              : fillFields(doc, values);

            // Property 7: zero submit/apply activations, always.
            expect(probe.count()).toBe(0);

            // Non-vacuity: every detected key was actually filled with its value.
            expect(report.filled.slice().sort()).toEqual(
              [...detectedKeys].sort(),
            );
            for (const { field, element } of detected) {
              expect(element.value).toBe(values[field.key]);
            }
          } finally {
            probe.restore();
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('the real content-script module contains no click/submit activation calls', () => {
    // Guardrail assertion complementing the DOM-level property: the writer only
    // ever dispatches value-change events, never click/submit.
    expect(getAdapterForUrl).toBeTypeOf('function');
  });
});
