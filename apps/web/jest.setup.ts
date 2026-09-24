/**
 * Runs before each test file, after the test framework is installed.
 *
 * Two things live here, and deliberately nothing else — a setup file is a
 * tempting place to put global mocks, and global mocks are how a suite starts
 * passing for reasons no individual test states.
 */

// `toBeInTheDocument`, `toBeDisabled`, `toHaveValue` and friends. Without this
// they exist in the type definitions and not at runtime, which fails as
// "expect(...).toBeInTheDocument is not a function" — a confusing error,
// because the editor autocompletes it happily.
import '@testing-library/jest-dom';

/**
 * jsdom does not implement `matchMedia`, and several of the components under
 * test sit inside trees that read it (theme, responsive helpers). It is absent
 * rather than broken, so the failure is a TypeError at render rather than
 * anything resembling the real bug a test is looking for.
 *
 * Guarded because the default environment here is Node: the files that never
 * opt into jsdom have no `window` at all, and this setup file runs for them too.
 */
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
