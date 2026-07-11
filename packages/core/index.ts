/**
 * @resume-forge/core
 *
 * Single source of truth shared by the web app and the Chrome extension:
 * - model/   : ResumeData schema + zod validators (this task)
 * - ai/      : Anthropic prompt builders + client wrapper (Task 2, 12, 13)
 * - gating/  : pure download-gating decision function (Task 8)
 * - payments/: pure payment-request state machine (Task 11.5)
 */

export * from './model/index.js';
export * from './ai/index.js';
export * from './gating/index.js';
export * from './payments/index.js';
