/**
 * Scope-boundary guardrail test (Task 17, Req 14.2, 14.4).
 *
 * The system uses MANUAL payment only: a client-side UPI QR (via the `qrcode`
 * library) plus admin verification. It must NOT integrate any automatic payment
 * gateway. This test is a living regression guard that scans dependency
 * manifests and source for payment-gateway SDKs/keywords and fails if any
 * appear. If a violation is ever introduced, remove it — do NOT weaken this test.
 *
 * Note: `qrcode` is the ALLOWED UPI-QR library and is explicitly NOT a gateway.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
/** Repo root: apps/web/src/scope -> ../../../../ */
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..');

/** Known payment-gateway SDKs / brand identifiers that are out of scope. */
const GATEWAY_IDENTIFIERS = [
  'razorpay',
  'stripe',
  'paypal',
  'braintree',
  'payu',
  'cashfree',
  'paytm',
  'phonepe',
  'checkout.js',
  'square',
  'adyen',
  'ccavenue',
  'instamojo',
];

/** package.json files to check for gateway dependencies. */
const PACKAGE_JSONS = [
  'package.json',
  'apps/web/package.json',
  'apps/extension/package.json',
  'packages/core/package.json',
];

/** Source roots to scan (scoped to src to avoid node_modules). */
const SOURCE_ROOTS = ['apps/web/src', 'apps/extension/src', 'packages/core'];

function collectSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      out.push(...collectSourceFiles(full));
      continue;
    }
    if (!/\.(ts|tsx|js|jsx)$/.test(entry)) continue;
    // This guardrail test itself lists the identifiers, so skip scope tests.
    if (full.includes(join('src', 'scope'))) continue;
    out.push(full);
  }
  return out;
}

describe('Scope boundary 14.2: no automatic payment gateway', () => {
  it.each(PACKAGE_JSONS)(
    '%s declares no payment-gateway dependency',
    (relPath) => {
      const full = join(REPO_ROOT, relPath);
      if (!existsSync(full)) return; // packages/core may have no package.json
      const pkg = JSON.parse(readFileSync(full, 'utf8'));
      const deps = {
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
        ...(pkg.peerDependencies ?? {}),
        ...(pkg.optionalDependencies ?? {}),
      };
      const names = Object.keys(deps).map((n) => n.toLowerCase());
      const offenders = names.filter((name) =>
        GATEWAY_IDENTIFIERS.some((id) => name.includes(id)),
      );
      expect(offenders).toEqual([]);
      // Sanity: the allowed UPI-QR lib is still what powers payments.
    },
  );

  it('the allowed manual-UPI stack is present (qrcode), proving non-vacuity', () => {
    const webPkg = JSON.parse(
      readFileSync(join(REPO_ROOT, 'apps/web/package.json'), 'utf8'),
    );
    expect(webPkg.dependencies?.qrcode).toBeDefined();
  });

  it.each(GATEWAY_IDENTIFIERS)(
    'no source file imports/references the "%s" gateway',
    (identifier) => {
      const offenders: string[] = [];
      for (const root of SOURCE_ROOTS) {
        for (const file of collectSourceFiles(join(REPO_ROOT, root))) {
          const content = readFileSync(file, 'utf8').toLowerCase();
          if (content.includes(identifier)) offenders.push(file);
        }
      }
      expect(offenders).toEqual([]);
    },
  );
});
