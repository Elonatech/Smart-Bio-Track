/**
 * A full page navigation, as distinct from a client-side route change.
 *
 * One line wrapping `window.location.href`, and it exists for two reasons.
 *
 * **It is a seam.** `window.location` is `[Unforgeable]` in the DOM spec:
 * jsdom refuses to let a test redefine or delete it, so an assignment made
 * directly inside a module is invisible to Jest — `delete window.location`
 * returns false and `Object.defineProperty` throws "Cannot redefine property".
 * The forced sign-out in api-client.ts is behaviour worth asserting (a dead
 * refresh cookie must not leave someone on a dashboard whose every request
 * fails), and this is what makes asserting it possible.
 *
 * **It marks intent.** A hard navigation is deliberate here rather than
 * `router.push`: the session is over, and the point is to discard all React
 * state along with it. Someone tidying this into a client-side route change
 * would keep the dead session's components mounted.
 *
 * The `window` check keeps it safe if a module that imports it is ever
 * evaluated during server rendering.
 */
export function hardRedirect(path: string): void {
  if (typeof window !== "undefined") {
    window.location.href = path;
  }
}
