/**
 * Autofill field writer (Req 11.5, 11.6).
 *
 * Given a `{ fieldKey: value }` map (produced by the pure label-matching mapper
 * in `shared/fieldMapping.ts`), this fills the matching controls on the page and
 * reports which keys were filled and which could not be located.
 *
 * HARD RULE (Req 11.6): this only ever sets input VALUES. It never clicks,
 * submits, or otherwise activates buttons. Submit/Apply is out of scope here and
 * enforced/tested in 16.4.
 *
 * Kept DOM-only (no chrome.*) and driven by an injected `Document` so it is unit
 * testable under jsdom. Field keys come from the SAME detection pass the popup's
 * `findFormFields` used (`detectFieldsWithElements`), so keys always line up
 * between "find fields" and "fill fields".
 */
import { detectFieldsWithElements } from './adapters/dom.js';
import type { FillReport } from '../shared/fields.js';

type FieldControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/**
 * The exhaustive set of DOM events this module is ever permitted to dispatch
 * (Req 11.6). Every one targets a FILLED field control to notify site
 * frameworks of a value change. Notably absent: `click` and `submit`. The
 * no-auto-submit invariant is enforced by construction here and verified by the
 * Property 7 test in `noSubmit.pbt.test.ts`.
 */
export const DISPATCHED_EVENTS = ['input', 'change', 'blur'] as const;

/**
 * Set a control's value and dispatch the events front-end frameworks (React,
 * Vue, Angular) listen for so they register the programmatic change. Never
 * activates buttons or submits (Req 11.6) — it only assigns `.value`.
 */
export function setControlValue(el: FieldControl, value: string): void {
  el.value = value;

  // Fire the events site frameworks bind to. `input` + `change` cover the vast
  // majority; `blur` helps validation-on-blur forms commit the value.
  const win = el.ownerDocument?.defaultView;
  const EventCtor = win?.Event ?? Event;
  for (const type of DISPATCHED_EVENTS) {
    el.dispatchEvent(new EventCtor(type, { bubbles: true }));
  }
}

/**
 * Fill the given `{ key: value }` map into the page's form controls.
 *
 * @param doc    The document to operate on.
 * @param values Field-key → value plan from the label-matching mapper.
 * @param root   Optional form root to scope detection to (the adapter's form
 *               area). Must match what `findFormFields` used so keys align.
 * @returns which keys were filled and which could not be located on the page.
 */
export function fillFields(
  doc: Document,
  values: Record<string, string>,
  root?: Element | null,
): FillReport {
  const detected = detectFieldsWithElements(doc, root);
  const keyToEl = new Map<string, FieldControl>();
  for (const { field, element } of detected) {
    keyToEl.set(field.key, element);
  }

  const filled: string[] = [];
  const unmatched: string[] = [];

  for (const [key, value] of Object.entries(values)) {
    const el = keyToEl.get(key);
    if (!el) {
      unmatched.push(key);
      continue;
    }
    setControlValue(el, value);
    filled.push(key);
  }

  return { filled, unmatched };
}
