// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  adapters,
  getAdapterForUrl,
  indeedAdapter,
  linkedInAdapter,
  naukriAdapter,
} from './index.js';
import {
  LINKEDIN_JD_TEXT,
  linkedInFixture,
} from './__fixtures__/linkedin.js';
import { INDEED_JD_TEXT, indeedFixture } from './__fixtures__/indeed.js';
import { NAUKRI_JD_TEXT, naukriFixture } from './__fixtures__/naukri.js';

/**
 * Unit tests for the site adapters (Req 11.3).
 *
 * Each adapter is exercised against a saved DOM fixture (parsed via jsdom) to
 * verify matches()/extractJD()/findFormFields(). Because portal selectors
 * drift, the fixtures document the DOM structure the adapters expect.
 */

function docOf(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('LinkedIn adapter', () => {
  const doc = docOf(linkedInFixture);

  it('matches LinkedIn job URLs', () => {
    expect(linkedInAdapter.matches('https://www.linkedin.com/jobs/view/123')).toBe(
      true,
    );
    expect(
      linkedInAdapter.matches('https://linkedin.com/jobs/collections/'),
    ).toBe(true);
  });

  it('rejects non-LinkedIn or non-jobs URLs', () => {
    expect(linkedInAdapter.matches('https://www.linkedin.com/feed/')).toBe(
      false,
    );
    expect(linkedInAdapter.matches('https://indeed.com/jobs')).toBe(false);
    expect(linkedInAdapter.matches('not a url')).toBe(false);
  });

  it('extracts the job description text', () => {
    expect(linkedInAdapter.extractJD(doc)).toBe(LINKEDIN_JD_TEXT);
  });

  it('detects labelled form fields with correct kinds', () => {
    const fields = linkedInAdapter.findFormFields(doc);
    const byKey = new Map(fields.map((f) => [f.key, f]));
    expect(byKey.get('firstname')?.label).toBe('First name');
    expect(byKey.get('email')?.kind).toBe('email');
    expect(byKey.get('phone')?.kind).toBe('tel');
    // The submit button must not be reported as a fillable field.
    expect(fields.some((f) => f.kind === 'other')).toBe(false);
  });
});

describe('Indeed adapter', () => {
  const doc = docOf(indeedFixture);

  it('matches Indeed job URLs across country domains', () => {
    expect(indeedAdapter.matches('https://www.indeed.com/viewjob?jk=abc')).toBe(
      true,
    );
    expect(indeedAdapter.matches('https://in.indeed.com/jobs?q=dev')).toBe(true);
    expect(indeedAdapter.matches('https://indeed.co.uk/viewjob?jk=1')).toBe(
      true,
    );
  });

  it('rejects non-Indeed or non-job URLs', () => {
    expect(indeedAdapter.matches('https://www.indeed.com/about')).toBe(false);
    expect(indeedAdapter.matches('https://linkedin.com/jobs')).toBe(false);
  });

  it('extracts the job description text', () => {
    expect(indeedAdapter.extractJD(doc)).toBe(INDEED_JD_TEXT);
  });

  it('detects fields via aria-label and placeholder, ignoring hidden inputs', () => {
    const fields = indeedAdapter.findFormFields(doc);
    const labels = fields.map((f) => f.label);
    expect(labels).toContain('Full name');
    expect(labels).toContain('Cover letter');
    // placeholder is used as a label fallback for the email input
    expect(labels).toContain('you@example.com');
    // hidden csrf input is skipped
    expect(fields.some((f) => f.label === 'csrf')).toBe(false);
  });
});

describe('Naukri adapter', () => {
  const doc = docOf(naukriFixture);

  it('matches Naukri job-listing URLs', () => {
    expect(
      naukriAdapter.matches(
        'https://www.naukri.com/job-listings-data-analyst-acme-123456',
      ),
    ).toBe(true);
  });

  it('rejects non-Naukri or non-job URLs', () => {
    expect(naukriAdapter.matches('https://www.naukri.com/')).toBe(false);
    expect(naukriAdapter.matches('https://indeed.com/job-listings-x')).toBe(
      false,
    );
  });

  it('extracts JD text from the hashed container via fallback selector', () => {
    expect(naukriAdapter.extractJD(doc)).toBe(NAUKRI_JD_TEXT);
  });

  it('detects fields including ancestor-label and file inputs', () => {
    const fields = naukriAdapter.findFormFields(doc);
    const byKey = new Map(fields.map((f) => [f.key, f]));
    expect(byKey.get('name')?.label).toBe('Your name');
    expect(byKey.get('mobile')?.kind).toBe('tel');
    expect(byKey.get('resume')?.kind).toBe('file');
  });
});

describe('adapter registry', () => {
  it('returns the matching adapter for a URL', () => {
    expect(getAdapterForUrl('https://www.linkedin.com/jobs/view/1')?.id).toBe(
      'linkedin',
    );
    expect(getAdapterForUrl('https://www.indeed.com/viewjob?jk=1')?.id).toBe(
      'indeed',
    );
    expect(
      getAdapterForUrl('https://www.naukri.com/job-listings-x-123456')?.id,
    ).toBe('naukri');
  });

  it('returns null for unsupported pages', () => {
    expect(getAdapterForUrl('https://example.com/careers')).toBeNull();
    expect(getAdapterForUrl('https://www.google.com')).toBeNull();
  });

  it('exposes exactly the three supported adapters', () => {
    expect(adapters.map((a) => a.id)).toEqual(['linkedin', 'indeed', 'naukri']);
  });

  it('returns null when JD container is absent', () => {
    const empty = docOf('<!doctype html><html><body></body></html>');
    expect(linkedInAdapter.extractJD(empty)).toBeNull();
    expect(indeedAdapter.extractJD(empty)).toBeNull();
    expect(naukriAdapter.extractJD(empty)).toBeNull();
  });
});
