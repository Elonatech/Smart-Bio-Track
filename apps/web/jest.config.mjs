import nextJest from 'next/jest.js';

/**
 * Tests for the browser half of the product.
 *
 * There were none until 22 Sep 2026 (#27). Every check in this project — all
 * 286 — tested the server, so everything that shipped to the screen rested on a
 * typecheck, a successful `next build`, and somebody clicking through it.
 *
 * ## Why Jest rather than Vitest
 *
 * Vitest is the livelier choice and would have been defensible. Jest wins here
 * for one reason: **`apps/api` already runs Jest 30**, and a three-person team
 * learning this workflow is better served by one runner, one set of matchers
 * and one mental model than by a marginally nicer tool on half the repo. A
 * second runner is a second thing to configure, explain and keep upgraded.
 *
 * `next/jest` is first-party and does the tedious parts: SWC transforms (so no
 * ts-jest here, unlike the API), the `@/` alias read straight from tsconfig,
 * and stubs for CSS and image imports that would otherwise crash a test the
 * moment it touched a component.
 *
 * ## Environments
 *
 * Node is the default because the first things worth testing — `proxy.ts`, the
 * role maps — are plain functions with no DOM. Anything needing `document`
 * opts in per file with a `@jest-environment jsdom` docblock, which keeps the
 * slower environment off the files that do not need it.
 *
 * ## Why .mjs and not .ts
 *
 * Jest loads a TypeScript config through ts-node, which this app does not have
 * and does not otherwise need. A `.ts` config would mean adding a dependency
 * purely so a config file can be written in a language Jest then has to compile
 * before it can read it. Next's own documentation uses .mjs here for the same
 * reason.
 */
const createJestConfig = nextJest({ dir: './' });

/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  // Source only. Without this, Jest walks .next/ and node_modules looking for
  // tests and runs whatever build output happens to match.
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  clearMocks: true,
};

export default createJestConfig(config);
