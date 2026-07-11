/**
 * Scope-boundary guardrail tests (Task 17, Req 14.1, 14.3, 14.4).
 *
 * These are living-documentation regression guards, not behavioural tests. They
 * scan the extension SOURCE on disk and assert that the two scope boundaries the
 * extension is responsible for are never crossed by a future change:
 *
 *   - 14.1 No auto-submit: the extension autofills field VALUES only and never
 *     clicks / submits / activates a Submit or Apply control programmatically.
 *   - 14.3 No bulk scraping: adapters expose ONLY a single-page `extractJD` +
 *     `findFormFields` surface (the JD of the page the user is already on); there
 *     is no list-crawler API and no background crawler/poller.
 *
 * If a real violation is ever introduced, fix the code — do NOT weaken these
 * assertions.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
/** Extension `src` root (parent of this `scope/` folder). */
const SRC_ROOT = resolve(HERE, '..');

/** Recursively collect .ts/.tsx source files, excluding tests and fixtures. */
function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      if (entry === '__fixtures__' || entry === 'node_modules') continue;
      out.push(...collectSourceFiles(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    if (/\.test\.tsx?$/.test(entry)) continue; // skip test files
    if (/\.pbt\.test\.tsx?$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}

/**
 * Strip block comments, line comments, and string/template literals from source
 * so that the pattern scan only ever matches real code — never prose in a
 * comment (e.g. "never clicks Submit") or a string literal.
 */
function stripCommentsAndStrings(code: string): string {
  let out = '';
  let i = 0;
  type Mode =
    | 'code'
    | 'line'
    | 'block'
    | 'single'
    | 'double'
    | 'template';
  let mode: Mode = 'code';

  while (i < code.length) {
    const c = code[i];
    const next = code[i + 1];
    switch (mode) {
      case 'code':
        if (c === '/' && next === '/') {
          mode = 'line';
          i += 2;
        } else if (c === '/' && next === '*') {
          mode = 'block';
          i += 2;
        } else if (c === "'") {
          mode = 'single';
          i += 1;
        } else if (c === '"') {
          mode = 'double';
          i += 1;
        } else if (c === '`') {
          mode = 'template';
          i += 1;
        } else {
          out += c;
          i += 1;
        }
        break;
      case 'line':
        if (c === '\n') {
          mode = 'code';
          out += c;
        }
        i += 1;
        break;
      case 'block':
        if (c === '*' && next === '/') {
          mode = 'code';
          i += 2;
        } else {
          i += 1;
        }
        break;
      case 'single':
        if (c === '\\') i += 2;
        else {
          if (c === "'") mode = 'code';
          i += 1;
        }
        break;
      case 'double':
        if (c === '\\') i += 2;
        else {
          if (c === '"') mode = 'code';
          i += 1;
        }
        break;
      case 'template':
        if (c === '\\') i += 2;
        else {
          if (c === '`') mode = 'code';
          i += 1;
        }
        break;
    }
  }
  return out;
}

/** The dangerous activation patterns that would represent an auto-submit. */
const AUTO_SUBMIT_PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'element.click()', re: /\.click\s*\(/ },
  { name: 'form.submit()', re: /\.submit\s*\(/ },
  { name: 'form.requestSubmit()', re: /\.requestSubmit\s*\(/ },
  { name: "dispatchEvent(new ...('click'...))", re: /dispatchEvent\s*\(\s*new\s+[A-Za-z]*Event\s*\(\s*['"]click['"]/ },
  { name: "dispatchEvent(new ...('submit'...))", re: /dispatchEvent\s*\(\s*new\s+[A-Za-z]*Event\s*\(\s*['"]submit['"]/ },
  { name: 'HTMLFormElement.submit reference', re: /HTMLFormElement[^\n]*\.submit\b/ },
];

/** Patterns that would represent bulk scraping / crawling of job boards. */
const BULK_SCRAPE_PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'crawl identifier', re: /\bcrawl(er)?\b/i },
  { name: 'scrape identifier', re: /\bscrap(e|er|ing)\b/i },
  { name: 'setInterval polling', re: /\bsetInterval\s*\(/ },
  { name: 'querySelectorAll of job/listing/result cards', re: /querySelectorAll\s*\(\s*['"][^'"]*(job|listing|result|posting|card)/i },
];

describe('Scope boundary 14.1: extension never auto-submits', () => {
  const files = collectSourceFiles(SRC_ROOT);

  it('finds extension source files to scan (sanity)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(AUTO_SUBMIT_PATTERNS)(
    'no extension source contains a "$name" activation call',
    ({ re }) => {
      const offenders: string[] = [];
      for (const file of files) {
        const cleaned = stripCommentsAndStrings(readFileSync(file, 'utf8'));
        if (re.test(cleaned)) offenders.push(file);
      }
      expect(offenders).toEqual([]);
    },
  );
});

describe('Scope boundary 14.1: dispatched events are a value-change allow-list', () => {
  it('DISPATCHED_EVENTS contains only input/change/blur (no click/submit)', async () => {
    const { DISPATCHED_EVENTS } = await import('../content/fillFields.js');
    expect([...DISPATCHED_EVENTS].sort()).toEqual(['blur', 'change', 'input']);
    expect(DISPATCHED_EVENTS).not.toContain('click');
    expect(DISPATCHED_EVENTS).not.toContain('submit');
  });
});

describe('Scope boundary 14.3: adapters expose only single-page extraction', () => {
  it('every adapter exposes matches/extractJD/findFormFields and nothing that crawls listings', async () => {
    const { adapters } = await import('../content/adapters/index.js');
    expect(adapters.length).toBeGreaterThan(0);

    const allowedKeys = new Set(['id', 'matches', 'extractJD', 'findFormFields']);
    const forbiddenKeyPattern = /(all|list|many|bulk|crawl|scrape|search|results)/i;

    for (const adapter of adapters) {
      const keys = Object.keys(adapter);
      // No API beyond the single-page contract.
      for (const key of keys) {
        expect(allowedKeys.has(key)).toBe(true);
        expect(forbiddenKeyPattern.test(key)).toBe(false);
      }
      // extractJD is single-page: returns a string or null, never an array.
      expect(typeof adapter.extractJD).toBe('function');
      expect(typeof adapter.findFormFields).toBe('function');
    }
  });

  it.each(BULK_SCRAPE_PATTERNS)(
    'no extension source contains a "$name" bulk-scraping pattern',
    ({ re }) => {
      const offenders: string[] = [];
      for (const file of collectSourceFiles(SRC_ROOT)) {
        const cleaned = stripCommentsAndStrings(readFileSync(file, 'utf8'));
        if (re.test(cleaned)) offenders.push(file);
      }
      expect(offenders).toEqual([]);
    },
  );

  it('the service worker contains no background crawler/poller', () => {
    const worker = readFileSync(
      join(SRC_ROOT, 'background', 'service-worker.ts'),
      'utf8',
    );
    const cleaned = stripCommentsAndStrings(worker);
    expect(/setInterval\s*\(/.test(cleaned)).toBe(false);
    expect(/\bfetch\s*\(/.test(cleaned)).toBe(false);
  });
});
