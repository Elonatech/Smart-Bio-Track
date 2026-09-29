/**
 * @jest-environment jsdom
 */
import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { appClient, extractErrorMessage, refreshAccessToken } from './api-client';
import { useAuthStore } from './store/auth-store';
import { hardRedirect } from './navigate';

// window.location is [Unforgeable] — jsdom will not let a test redefine or
// delete it, so the forced sign-out's navigation is only observable through
// this seam. See lib/navigate.ts.
jest.mock('./navigate', () => ({ hardRedirect: jest.fn() }));

const mockRedirect = hardRedirect as jest.Mock;

/**
 * The refresh interceptor — the most consequential untested code in the
 * browser until now (#27).
 *
 * It decides, on every 401, whether the session is recoverable. Getting it
 * wrong in either direction is expensive and quiet:
 *
 *  - Too eager, and a genuinely bad password triggers a refresh loop, or a
 *    failed refresh triggers another refresh.
 *  - Too shy, and a routine 15-minute token expiry signs somebody out
 *    mid-sentence.
 *  - Not de-duplicated, and a page firing five requests at once rotates the
 *    refresh token five times. Rotation invalidates the previous token, so
 *    the losers of that race look like **token theft** to the server's reuse
 *    detection (#11) and can take the whole family down with them.
 *
 * Driven through a stub adapter rather than `axios-mock-adapter`. A custom
 * adapter is the documented seam, it needs no new dependency, and — unlike
 * mocking axios wholesale — the real interceptors still run, which is the
 * entire thing under test.
 */

/** Builds the rejection a real adapter produces for a non-2xx response. */
function httpError(status: number, config: AxiosRequestConfig, data: unknown = {}) {
  const response = {
    status,
    data,
    statusText: '',
    headers: {},
    config,
  } as AxiosResponse;

  return new axios.AxiosError(
    `Request failed with status code ${status}`,
    'ERR_BAD_REQUEST',
    config as never,
    null,
    response
  );
}

function ok(data: unknown, config: AxiosRequestConfig): AxiosResponse {
  return {
    status: 200,
    data,
    statusText: 'OK',
    headers: {},
    config,
  } as AxiosResponse;
}

const adapter = jest.fn();
const originalAdapter = appClient.defaults.adapter;

/** Authorization header the adapter saw, per call. */
function authHeaders() {
  return adapter.mock.calls.map(([config]) => config.headers?.Authorization);
}

beforeEach(() => {
  appClient.defaults.adapter = adapter;
  adapter.mockReset();
  mockRedirect.mockClear();
  useAuthStore.setState({
    user: null,
    accessToken: 'access-1',
    isAuthenticated: true,
    hasRestored: true,
  });
});

afterAll(() => {
  appClient.defaults.adapter = originalAdapter;
});

describe('the response envelope', () => {
  it('unwraps { success, data } so call sites read res.data directly', async () => {
    // The API wraps every success. Unwrapping once here is why no page needs
    // `.data.data` — and why a change to the envelope would break every page
    // at once rather than visibly in one place.
    adapter.mockImplementation((config) =>
      Promise.resolve(ok({ success: true, message: 'ok', data: { id: 'u1' } }, config))
    );

    const res = await appClient.get('/users/u1');

    expect(res.data).toEqual({ id: 'u1' });
  });

  it('leaves a response that is not enveloped alone', async () => {
    // Not every endpoint goes through the interceptor — and a bare array must
    // not be mistaken for an envelope and unwrapped into undefined.
    adapter.mockImplementation((config) => Promise.resolve(ok([{ id: 'd1' }], config)));

    const res = await appClient.get('/departments');

    expect(res.data).toEqual([{ id: 'd1' }]);
  });
});

describe('the access token on outgoing requests', () => {
  it('attaches the token from the store', async () => {
    adapter.mockImplementation((config) => Promise.resolve(ok({}, config)));

    await appClient.get('/users');

    expect(authHeaders()[0]).toBe('Bearer access-1');
  });

  it('does not overwrite a token the caller set explicitly', async () => {
    // restoreSession passes the token it has just received to /auth/me before
    // the store is updated. Overwriting it with the stale store value makes a
    // successful sign-in look like a failed one.
    adapter.mockImplementation((config) => Promise.resolve(ok({}, config)));

    await appClient.get('/auth/me', { headers: { Authorization: 'Bearer fresh' } });

    expect(authHeaders()[0]).toBe('Bearer fresh');
  });

  it('sends no Authorization header when there is no session', async () => {
    useAuthStore.setState({ accessToken: null });
    adapter.mockImplementation((config) => Promise.resolve(ok({}, config)));

    await appClient.get('/health');

    expect(authHeaders()[0]).toBeUndefined();
  });
});

describe('recovering from an expired access token', () => {
  it('refreshes once and retries the original request with the new token', async () => {
    const post = jest
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { data: { accessToken: 'access-2' } } });

    let call = 0;
    adapter.mockImplementation((config) => {
      call += 1;
      if (call === 1) return Promise.reject(httpError(401, config));
      return Promise.resolve(ok({ id: 'u1' }, config));
    });

    const res = await appClient.get('/users/u1');

    expect(res.data).toEqual({ id: 'u1' });
    expect(post).toHaveBeenCalledTimes(1);
    // The retry must carry the NEW token. Retrying with the old one produces
    // a second 401, which _retried then converts into a hard failure — the
    // session ends despite the refresh having worked.
    expect(authHeaders()[1]).toBe('Bearer access-2');
    expect(useAuthStore.getState().accessToken).toBe('access-2');

    post.mockRestore();
  });

  it('fires ONE refresh for several requests that 401 together', async () => {
    // The de-duplication that matters most. Refresh tokens rotate, so three
    // parallel refreshes mean two of them present a token the server has just
    // invalidated — indistinguishable from replay, and reuse detection kills
    // the whole family.
    const post = jest
      .spyOn(axios, 'post')
      .mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ data: { data: { accessToken: 'access-2' } } }), 10)
          )
      );

    const seen = new Set<string>();
    adapter.mockImplementation((config) => {
      const key = String(config.url);
      if (!seen.has(key)) {
        seen.add(key);
        return Promise.reject(httpError(401, config));
      }
      return Promise.resolve(ok({ url: config.url }, config));
    });

    await Promise.all([
      appClient.get('/users'),
      appClient.get('/departments'),
      appClient.get('/offices'),
    ]);

    expect(post).toHaveBeenCalledTimes(1);

    post.mockRestore();
  });

  it('gives up rather than looping when the retry also 401s', async () => {
    const post = jest
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { data: { accessToken: 'access-2' } } });

    adapter.mockImplementation((config) => Promise.reject(httpError(401, config)));

    await expect(appClient.get('/users')).rejects.toMatchObject({
      response: { status: 401 },
    });

    // Exactly one refresh, and exactly two attempts at the request. Without
    // the _retried flag this is an infinite loop that pins a CPU core.
    expect(post).toHaveBeenCalledTimes(1);
    expect(adapter).toHaveBeenCalledTimes(2);

    post.mockRestore();
  });
});

describe('401s that mean what they say', () => {
  it.each([
    '/auth/login',
    '/auth/refresh',
    '/auth/register-organization',
    '/auth/verify-organization',
    '/auth/register',
  ])('does not try to refresh after %s', async (path) => {
    const post = jest.spyOn(axios, 'post');
    adapter.mockImplementation((config) => Promise.reject(httpError(401, config)));

    await expect(appClient.post(path, {})).rejects.toBeDefined();

    // A wrong password 401ing IS the answer. Refreshing after it would be
    // nonsense; refreshing after /auth/refresh 401s would recurse.
    expect(post).not.toHaveBeenCalled();
    expect(adapter).toHaveBeenCalledTimes(1);

    post.mockRestore();
  });

  it('passes a non-401 error straight through', async () => {
    const post = jest.spyOn(axios, 'post');
    adapter.mockImplementation((config) => Promise.reject(httpError(403, config)));

    await expect(appClient.get('/audit-logs')).rejects.toMatchObject({
      response: { status: 403 },
    });

    // A 403 is a role refusal, not an expiry. Refreshing would get the same
    // 403 back and teach the user nothing.
    expect(post).not.toHaveBeenCalled();

    post.mockRestore();
  });
});

describe('when the refresh cookie is dead too', () => {
  it('drops the local session and sends the user to sign in', async () => {
    const post = jest.spyOn(axios, 'post').mockRejectedValue(new Error('no cookie'));
    adapter.mockImplementation((config) => Promise.reject(httpError(401, config)));

    await expect(appClient.get('/users')).rejects.toBeDefined();

    // The server has already cleared the dead cookie; only the local half is
    // ours to drop. Leaving it set would keep the UI in a signed-in state
    // whose every request fails.
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(mockRedirect).toHaveBeenCalledWith('/auth/login');

    post.mockRestore();
  });

  it('can refresh again on a later request rather than staying stuck', async () => {
    // The in-flight promise must be cleared on failure as well as on success.
    // If it is not, one dead refresh poisons every subsequent 401 for the life
    // of the page — each one awaits a promise that already rejected.
    const post = jest.spyOn(axios, 'post').mockRejectedValueOnce(new Error('no cookie'));
    adapter.mockImplementation((config) => Promise.reject(httpError(401, config)));

    await expect(appClient.get('/users')).rejects.toBeDefined();
    expect(post).toHaveBeenCalledTimes(1);

    post.mockResolvedValue({ data: { data: { accessToken: 'access-3' } } });
    let call = 0;
    adapter.mockImplementation((config) => {
      call += 1;
      if (call === 1) return Promise.reject(httpError(401, config));
      return Promise.resolve(ok({ ok: true }, config));
    });

    await expect(appClient.get('/users')).resolves.toBeDefined();
    expect(post).toHaveBeenCalledTimes(2);

    post.mockRestore();
  });
});

describe('refreshAccessToken', () => {
  it('reads the token from the enveloped body and stores it', async () => {
    const post = jest
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { success: true, data: { accessToken: 'access-9' } } });

    await expect(refreshAccessToken()).resolves.toBe('access-9');
    expect(useAuthStore.getState().accessToken).toBe('access-9');

    post.mockRestore();
  });

  it('also accepts a bare body, for an endpoint outside the envelope', async () => {
    const post = jest
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { accessToken: 'access-8' } });

    await expect(refreshAccessToken()).resolves.toBe('access-8');

    post.mockRestore();
  });

  it('does not go through appClient, which would re-enter the interceptor', async () => {
    const post = jest
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { data: { accessToken: 'access-7' } } });

    await refreshAccessToken();

    // Bare axios, with credentials set explicitly. Using appClient here is a
    // recursion waiting for a 401.
    expect(post).toHaveBeenCalledWith(
      expect.stringContaining('/auth/refresh'),
      {},
      { withCredentials: true }
    );
    expect(adapter).not.toHaveBeenCalled();

    post.mockRestore();
  });
});

describe('extractErrorMessage', () => {
  // Three response shapes reach this, and the page showing the message cannot
  // be expected to know which one it got.
  function errWith(data: unknown) {
    return new axios.AxiosError('x', 'ERR', undefined, null, {
      status: 400,
      data,
      statusText: '',
      headers: {},
      config: {},
    } as AxiosResponse);
  }

  it('returns a plain string message as-is', () => {
    expect(extractErrorMessage(errWith({ message: 'Email already in use' }))).toBe(
      'Email already in use'
    );
  });

  it('joins a class-validator array into one sentence', () => {
    expect(
      extractErrorMessage(errWith({ message: ['email must be an email', 'name is required'] }))
    ).toBe('email must be an email, name is required');
  });

  it('digs into the doubly-wrapped NestJS shape', () => {
    expect(
      extractErrorMessage(
        errWith({ message: { statusCode: 401, message: 'Invalid credentials', error: 'Unauthorized' } })
      )
    ).toBe('Invalid credentials');
  });

  it('handles a doubly-wrapped array too', () => {
    expect(
      extractErrorMessage(errWith({ message: { statusCode: 400, message: ['a', 'b'] } }))
    ).toBe('a, b');
  });

  it('falls back for a non-axios error', () => {
    // A TypeError from our own code must not render as a blank toast.
    expect(extractErrorMessage(new Error('boom'))).toBe(
      'Something went wrong. Please try again.'
    );
  });

  it('falls back when the server sends no message at all', () => {
    expect(extractErrorMessage(errWith({}))).toBe('Something went wrong. Please try again.');
  });
});
