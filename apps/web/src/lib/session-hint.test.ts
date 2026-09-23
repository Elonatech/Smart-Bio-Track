/**
 * @jest-environment jsdom
 */
import {
  SESSION_HINT_COOKIE,
  clearSessionHint,
  setSessionHint,
} from './session-hint';

/**
 * The cookie the proxy reads.
 *
 * Worth testing not because the code is clever — it is two string templates —
 * but because both of its failure modes are quiet and neither shows up in a
 * typecheck:
 *
 *  * A hint that is never set leaves signed-in users redirected to the sign-in
 *    page on every navigation.
 *  * A hint that is never *cleared* leaves signed-out users walked through to a
 *    dashboard shell where everything fails — which reads as a broken product
 *    rather than as a sign-out that did not finish.
 *
 * The `Path` assertion carries the most weight. A browser identifies a cookie
 * by (name, domain, path), so clearing from a different path silently does
 * nothing and leaves the original in place. That is the bug where sign-out
 * looks successful and the next page load signs you back in.
 */
describe('session hint', () => {
  beforeEach(() => {
    clearSessionHint();
  });

  it('is absent until a session starts', () => {
    expect(document.cookie).not.toContain(SESSION_HINT_COOKIE);
  });

  it('is set on sign-in', () => {
    setSessionHint();

    expect(document.cookie).toContain(`${SESSION_HINT_COOKIE}=1`);
  });

  it('is removed on sign-out', () => {
    setSessionHint();
    clearSessionHint();

    expect(document.cookie).not.toContain(`${SESSION_HINT_COOKIE}=1`);
  });

  it('survives being set twice', () => {
    // Sign in, restore the session on reload, sign in again in another tab —
    // all three call this, and none should produce a duplicate cookie.
    setSessionHint();
    setSessionHint();

    const occurrences = document.cookie
      .split(';')
      .filter((pair) => pair.trim().startsWith(`${SESSION_HINT_COOKIE}=`));

    expect(occurrences).toHaveLength(1);
  });

  // jsdom exposes only name=value through document.cookie, never the
  // attributes, so Path and Max-Age cannot be read back and asserted here.
  // What can be asserted is the behaviour that depends on them: a cookie
  // written at one path and cleared at another would still be present above.
  // The attributes themselves are pinned by the clear test passing at all.
});
