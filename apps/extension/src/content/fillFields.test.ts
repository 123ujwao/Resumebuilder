// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fillFields, setControlValue } from './fillFields.js';

/**
 * Unit tests for the autofill writer (Req 11.5, 11.6).
 *
 * Verifies values are set on the correct controls, that input/change events are
 * dispatched so site frameworks register the change, that unmatched keys are
 * reported, and — critically — that the Submit button is NEVER clicked (Req
 * 11.6, the hard rule tested more fully in 16.4).
 */

const FORM_HTML = `
  <form>
    <label for="name">Full name</label>
    <input id="name" name="name" type="text" />

    <label for="email">Email</label>
    <input id="email" name="email" type="email" />

    <label for="phone">Phone</label>
    <input id="phone" name="phone" type="tel" />

    <label for="cover">Cover letter</label>
    <textarea id="cover" name="cover"></textarea>

    <input type="hidden" name="csrf" value="tok" />
    <button id="submit" type="submit">Submit application</button>
  </form>
`;

function docOf(html: string): Document {
  return new DOMParser().parseFromString(
    `<!doctype html><html><body>${html}</body></html>`,
    'text/html',
  );
}

describe('fillFields', () => {
  it('sets values on the matching controls by key', () => {
    const doc = docOf(FORM_HTML);
    const report = fillFields(doc, {
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '+1 555 0100',
    });

    expect(
      (doc.getElementById('name') as HTMLInputElement).value,
    ).toBe('Ada Lovelace');
    expect(
      (doc.getElementById('email') as HTMLInputElement).value,
    ).toBe('ada@example.com');
    expect((doc.getElementById('phone') as HTMLInputElement).value).toBe(
      '+1 555 0100',
    );
    expect(report.filled.sort()).toEqual(['email', 'name', 'phone']);
    expect(report.unmatched).toEqual([]);
  });

  it('dispatches input and change events so frameworks register the change', () => {
    const doc = docOf(FORM_HTML);
    const emailEl = doc.getElementById('email') as HTMLInputElement;
    const inputSpy = vi.fn();
    const changeSpy = vi.fn();
    emailEl.addEventListener('input', inputSpy);
    emailEl.addEventListener('change', changeSpy);

    fillFields(doc, { email: 'ada@example.com' });

    expect(inputSpy).toHaveBeenCalledTimes(1);
    expect(changeSpy).toHaveBeenCalledTimes(1);
  });

  it('reports keys that do not correspond to any field as unmatched', () => {
    const doc = docOf(FORM_HTML);
    const report = fillFields(doc, {
      name: 'Ada',
      'does-not-exist': 'value',
    });
    expect(report.filled).toEqual(['name']);
    expect(report.unmatched).toEqual(['does-not-exist']);
  });

  it('NEVER clicks or submits the submit button (Req 11.6)', () => {
    const doc = docOf(FORM_HTML);
    const submitBtn = doc.getElementById('submit') as HTMLButtonElement;
    const form = doc.querySelector('form') as HTMLFormElement;

    const clickSpy = vi.fn();
    const submitSpy = vi.fn();
    submitBtn.addEventListener('click', clickSpy);
    form.addEventListener('submit', submitSpy);
    const clickMethodSpy = vi.spyOn(submitBtn, 'click');

    fillFields(doc, {
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '+1 555 0100',
      cover: 'Hello',
    });

    expect(clickSpy).not.toHaveBeenCalled();
    expect(submitSpy).not.toHaveBeenCalled();
    expect(clickMethodSpy).not.toHaveBeenCalled();
  });

  it('does not attempt to fill hidden inputs', () => {
    const doc = docOf(FORM_HTML);
    // The hidden csrf input has no label, so it is never a detected field and
    // cannot be targeted; passing its would-be key reports it unmatched.
    const report = fillFields(doc, { csrf: 'attacker' });
    expect(report.filled).toEqual([]);
    expect(report.unmatched).toEqual(['csrf']);
  });
});

describe('setControlValue', () => {
  it('assigns the value and fires input/change/blur', () => {
    const doc = docOf('<input id="x" name="x" type="text" />');
    const el = doc.getElementById('x') as HTMLInputElement;
    const events: string[] = [];
    ['input', 'change', 'blur'].forEach((t) =>
      el.addEventListener(t, () => events.push(t)),
    );
    setControlValue(el, 'hello');
    expect(el.value).toBe('hello');
    expect(events).toEqual(['input', 'change', 'blur']);
  });
});
