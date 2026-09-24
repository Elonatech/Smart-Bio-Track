/**
 * @jest-environment jsdom
 */
import LoginPage from './page';
import { appClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/store/auth-store';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * The sign-in page.
 *
 * The `?next=` parameter is the part that earns the most scrutiny. It arrives
 * in the query string, where **anybody can write it** — a link in an email, a
 * message, a QR code — and it decides where the browser goes immediately after
 * a successful sign-in. Redirecting to an arbitrary value would make this page
 * an open redirect: a link on our own domain that lands the user on somebody
 * else's sign-in form, at the exact moment they are expecting to be asked for
 * credentials.
 *
 * The rest is ordinary but load-bearing: the two-step sign-in (POST /auth/login
 * then GET /auth/me with the token just issued), and the safety-net redirect
 * for someone who is already signed in.
 */

const push = jest.fn();
const replace = jest.fn();
let search = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => search,
}));

jest.mock('@/lib/api-client', () => ({
  appClient: { post: jest.fn(), get: jest.fn() },
  extractErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : 'Something went wrong',
}));

const success = jest.fn();
const error = jest.fn();
jest.mock('@/app/components/Toast', () => ({
  useToast: () => ({ success, error, info: jest.fn() }),
}));

const mockPost = appClient.post as jest.Mock;
const mockGet = appClient.get as jest.Mock;

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

function renderLogin(next?: string) {
  search = new URLSearchParams(next ? { next } : {});
  return render(<LoginPage />);
}

async function signIn({ identifier = 'ada@example.com', password = 'Passw0rd!' } = {}) {
  await userEvent.type(screen.getByLabelText(/employee id or email/i), identifier);
  await userEvent.type(screen.getByLabelText(/^password$/i), password);
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

beforeEach(() => {
  useAuthStore.setState({
    user: null,
    accessToken: null,
    isAuthenticated: false,
    hasRestored: true,
  });
  mockPost.mockResolvedValue({ data: { accessToken: 'access-1' } });
  mockGet.mockResolvedValue({ data: ME });
});

describe('signing in', () => {
  it('posts the identifier and password, then fetches the user', async () => {
    renderLogin();

    await signIn();

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost).toHaveBeenCalledWith('/auth/login', {
      identifier: 'ada@example.com',
      password: 'Passw0rd!',
    });

    // The token just issued is passed explicitly, because the store has not
    // been updated yet — the request interceptor would send nothing.
    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith('/auth/me', {
        headers: { Authorization: 'Bearer access-1' },
      })
    );
  });

  it('accepts an employee ID, not only an email', async () => {
    // The backend takes one `identifier` field and decides by whether it
    // contains an "@". A client-side email-shape check would reject every
    // employee ID — which is how most staff sign in.
    renderLogin();

    await signIn({ identifier: 'EMP-0042' });

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0][1].identifier).toBe('EMP-0042');
  });

  it('lands the user on their own dashboard', async () => {
    renderLogin();

    await signIn();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard/hr-admin'));
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });
});

describe('the ?next= parameter', () => {
  it('returns the visitor to the page they were originally trying to reach', async () => {
    // proxy.ts puts this there when it intercepts a deep link. Losing it
    // means a shared link always dumps people on their dashboard.
    renderLogin('/dashboard/hr-admin/employees');

    await signIn();

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith('/dashboard/hr-admin/employees')
    );
  });

  it.each([
    ['https://evil.example.com/login', 'an absolute URL'],
    ['//evil.example.com/login', 'a protocol-relative URL'],
    ['javascript:alert(1)', 'a javascript: URL'],
    ['evil.example.com', 'a bare host'],
  ])('ignores %s (%s) and uses the role dashboard instead', async (value) => {
    // The open-redirect case. A link like
    // smartbiotrack.app/auth/login?next=https://evil.example.com would
    // otherwise deliver somebody to an attacker's page immediately after
    // they signed in — the moment they are most primed to type credentials
    // again "because it didn't work the first time".
    renderLogin(value);

    await signIn();

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(push).toHaveBeenCalledWith('/dashboard/hr-admin');
    expect(push).not.toHaveBeenCalledWith(value);
  });

  it('allows a path that merely contains a slash-slash later on', async () => {
    // Guarding with `includes("//")` instead of `startsWith` would reject
    // legitimate paths. Only the leading form is dangerous.
    renderLogin('/dashboard/hr-admin/reports?range=1//2');

    await signIn();

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith('/dashboard/hr-admin/reports?range=1//2')
    );
  });
});

describe('someone who is already signed in', () => {
  it('is forwarded rather than shown a sign-in form', async () => {
    // The safety net under proxy.ts, which runs on a forgeable hint cookie
    // that can be missing while the real session is alive.
    useAuthStore.setState({ user: ME, isAuthenticated: true, hasRestored: true });

    renderLogin();

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard/hr-admin'));
  });

  it('is forwarded to ?next= when one was given', async () => {
    useAuthStore.setState({ user: ME, isAuthenticated: true, hasRestored: true });

    renderLogin('/dashboard/hr-admin/leave');

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard/hr-admin/leave'));
  });

  it('is not forwarded before the session restore has finished', async () => {
    // isAuthenticated is false for everyone during restore. Redirecting on it
    // would flash the dashboard at every visitor, signed in or not.
    useAuthStore.setState({ user: null, isAuthenticated: false, hasRestored: false });

    renderLogin();

    await new Promise((r) => setTimeout(r, 50));
    expect(replace).not.toHaveBeenCalled();
  });
});

describe('when sign-in fails', () => {
  it('shows the server’s reason and stays put', async () => {
    mockPost.mockRejectedValueOnce(new Error('Invalid credentials'));
    renderLogin();

    await signIn();

    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
    expect(error).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('surfaces a lockout message as given, without softening it', async () => {
    // #9's lockout returns a readable message naming the wait. Replacing it
    // with a generic "could not sign in" would leave someone retrying a
    // locked account every few seconds.
    mockPost.mockRejectedValueOnce(
      new Error('Too many failed attempts. Try again in 15 minutes.')
    );
    renderLogin();

    await signIn();

    expect(
      await screen.findByText('Too many failed attempts. Try again in 15 minutes.')
    ).toBeInTheDocument();
  });

  it('re-enables the button so a typo can be corrected', async () => {
    mockPost.mockRejectedValueOnce(new Error('Invalid credentials'));
    renderLogin();

    await signIn();

    await screen.findByText('Invalid credentials');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('does not sign the user in when /auth/me fails after a good password', async () => {
    // A token without a user is not a session. Storing half of one leaves the
    // UI authenticated with nothing to render.
    mockGet.mockRejectedValueOnce(new Error('500'));
    renderLogin();

    await signIn();

    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });
});

describe('validation before anything is sent', () => {
  it('will not submit an empty identifier', async () => {
    renderLogin();

    await userEvent.type(screen.getByLabelText(/^password$/i), 'Passw0rd!');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Employee ID or email is required')).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('will not submit a password below the minimum length', async () => {
    renderLogin();

    await userEvent.type(screen.getByLabelText(/employee id or email/i), 'ada@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(mockPost).not.toHaveBeenCalled());
  });
});
