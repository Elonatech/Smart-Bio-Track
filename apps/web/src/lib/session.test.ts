/**
 * @jest-environment jsdom
 */
import { restoreSession, signOut } from './session';
import { appClient, refreshAccessToken } from './api-client';
import { useAuthStore } from './store/auth-store';
import { SESSION_HINT_COOKIE } from './session-hint';

/**
 * Session restore and sign-out.
 *
 * Both are short, and both have a failure mode that is silent rather than
 * loud:
 *
 *  - Restore must finish **either way**. `hasRestored` is what releases every
 *    guard in the app; a path that skips it hangs the whole UI on a spinner
 *    with nothing in the console.
 *  - Sign-out must clear local state **even when the server call fails**, or
 *    someone who asked to leave stays on the dashboard.
 */

jest.mock('./api-client', () => ({
  appClient: { get: jest.fn(), post: jest.fn() },
  refreshAccessToken: jest.fn(),
}));

const mockGet = appClient.get as jest.Mock;
const mockPost = appClient.post as jest.Mock;
const mockRefresh = refreshAccessToken as jest.Mock;

const ME = {
  id: 'u1',
  name: 'Ada Okafor',
  email: 'ada@example.com',
  role: 'HR_ADMIN' as const,
  organizationId: 'org-1',
  organizationName: 'Acme Ltd',
  departmentId: null,
  departmentName: null,
};

beforeEach(() => {
  useAuthStore.setState({
    user: null,
    accessToken: null,
    isAuthenticated: false,
    hasRestored: false,
  });
  document.cookie = `${SESSION_HINT_COOKIE}=; Max-Age=0; Path=/`;
});

describe('restoreSession', () => {
  it('trades the cookie for a token, fetches the user, and signs them in', async () => {
    mockRefresh.mockResolvedValue('access-1');
    mockGet.mockResolvedValue({ data: ME });

    await restoreSession();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.accessToken).toBe('access-1');
    expect(state.user).toMatchObject({ id: 'u1', role: 'HR_ADMIN' });
    expect(state.hasRestored).toBe(true);
  });

  it('asks the server who the user is rather than trusting anything local', async () => {
    // The point of the round trip. The user object used to be read back from
    // localStorage, so a hand-edited role rendered admin navigation until the
    // API refused something. A role changed by an admin since last sign-in
    // also has to land.
    mockRefresh.mockResolvedValue('access-1');
    mockGet.mockResolvedValue({ data: ME });

    await restoreSession();

    expect(mockGet).toHaveBeenCalledWith('/auth/me', {
      headers: { Authorization: 'Bearer access-1' },
    });
  });

  it('passes the fresh token explicitly, not via the store', async () => {
    // The store has not been updated at this point in the flow, so relying on
    // the request interceptor would send the previous token — or none.
    mockRefresh.mockResolvedValue('access-1');
    mockGet.mockResolvedValue({ data: ME });

    await restoreSession();

    expect(mockGet.mock.calls[0][1].headers.Authorization).toBe('Bearer access-1');
  });

  it('marks the restore finished when there is no session to restore', async () => {
    // The ordinary case for a signed-out visitor, not an error. If
    // `hasRestored` were left false here, every guard would spin forever and
    // nobody would ever see the sign-in prompt.
    mockRefresh.mockRejectedValue(new Error('no cookie'));

    await restoreSession();

    const state = useAuthStore.getState();
    expect(state.hasRestored).toBe(true);
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
  });

  it('marks the restore finished when the refresh works but /auth/me does not', async () => {
    // The partial failure. A token without a user is not a session, and
    // leaving the flag false is the same hang as above by a different route.
    mockRefresh.mockResolvedValue('access-1');
    mockGet.mockRejectedValue(new Error('500'));

    await restoreSession();

    expect(useAuthStore.getState().hasRestored).toBe(true);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('never rejects, whatever happens', async () => {
    // Callers treat this as fire-and-forget on mount. A rejection would
    // surface as an unhandled promise rejection and nothing else.
    mockRefresh.mockRejectedValue(new Error('boom'));

    await expect(restoreSession()).resolves.toBeUndefined();
  });

  it('leaves the session hint set for a signed-in user', async () => {
    mockRefresh.mockResolvedValue('access-1');
    mockGet.mockResolvedValue({ data: ME });

    await restoreSession();

    // proxy.ts reads this to keep protected HTML off the wire. A restore that
    // signs someone in without setting it means the next navigation bounces
    // them to the login page despite a live session.
    expect(document.cookie).toContain(SESSION_HINT_COOKIE);
  });

  it('clears the session hint when there is no session', async () => {
    useAuthStore.getState().login({ ...ME, name: 'Ada' }, 'stale');
    mockRefresh.mockRejectedValue(new Error('no cookie'));

    await restoreSession();

    expect(document.cookie).not.toContain(SESSION_HINT_COOKIE);
  });
});

describe('signOut', () => {
  it('tells the server, then drops local state', async () => {
    mockPost.mockResolvedValue({ data: {} });
    useAuthStore.getState().login({ ...ME, name: 'Ada' }, 'access-1');

    await signOut();

    // The call is the part that matters: only the server can revoke the
    // refresh token and clear its httpOnly cookie. Clearing local state alone
    // leaves a live cookie, and the next page load signs them back in.
    expect(mockPost).toHaveBeenCalledWith('/auth/logout', { all: false });
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('passes all: true through for a revoke-everywhere sign-out', async () => {
    mockPost.mockResolvedValue({ data: {} });

    await signOut({ all: true });

    expect(mockPost).toHaveBeenCalledWith('/auth/logout', { all: true });
  });

  it('still signs the user out locally when the server call fails', async () => {
    // A failed revoke must not strand somebody on a dashboard they asked to
    // leave. The refresh token expires on its own within the week regardless.
    mockPost.mockRejectedValue(new Error('network'));
    useAuthStore.getState().login({ ...ME, name: 'Ada' }, 'access-1');

    await expect(signOut()).resolves.toBeUndefined();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('clears the session hint, so the middleware stops waving them through', async () => {
    mockPost.mockResolvedValue({ data: {} });
    useAuthStore.getState().login({ ...ME, name: 'Ada' }, 'access-1');
    expect(document.cookie).toContain(SESSION_HINT_COOKIE);

    await signOut();

    // A hint left behind sends a signed-out visitor to a dashboard shell
    // whose every request 401s, which reads as the product being broken.
    expect(document.cookie).not.toContain(SESSION_HINT_COOKIE);
  });
});
