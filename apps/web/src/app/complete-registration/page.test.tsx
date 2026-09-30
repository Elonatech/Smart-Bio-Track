/**
 * @jest-environment jsdom
 */
import ActivateAccountPage from './page';
import { appClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/store/auth-store';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Redeeming an invitation (#27).
 *
 * The sibling of the reset-password screen and the more consequential of the
 * two: this one **does** sign the user in, so it runs the same two-step
 * handshake as the login page — redeem the token for an access token, then
 * fetch the user with it — and a half-finished version leaves the store
 * authenticated with nothing to render.
 *
 * It is also the screen a reinstated employee lands on (#23), so the "already
 * used" failure is not hypothetical: an admin who resends an invitation
 * retires the previous link, and whoever clicks the old one arrives here.
 */

const push = jest.fn();
let search = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
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
  name: 'Chinedu Okafor',
  email: 'chinedu@example.com',
  role: 'EMPLOYEE' as const,
  organizationId: 'org-1',
  organizationName: 'Acme Ltd',
  departmentId: null,
  departmentName: null,
};

const STRONG = 'NewPassw0rd!';

function renderPage(token?: string) {
  search = new URLSearchParams(token ? { token } : {});
  return render(<ActivateAccountPage />);
}

async function activate(password = STRONG, confirm = password) {
  await userEvent.type(await screen.findByLabelText(/^password$/i), password);
  await userEvent.type(screen.getByLabelText(/confirm/i), confirm);
  await userEvent.click(screen.getByRole('button', { name: 'Activate account' }));
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

describe('with no token in the link', () => {
  it('says so and renders no form', async () => {
    renderPage();

    expect(
      await screen.findByText(/This activation link is missing its token/i)
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/^password$/i)).not.toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });
});

describe('activating', () => {
  it('redeems the token, then fetches the user with what it got back', async () => {
    renderPage('tok-123');

    await activate();

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0][0]).toBe('/auth/complete-registration');
    expect(mockPost.mock.calls[0][1]).toMatchObject({
      token: 'tok-123',
      password: STRONG,
    });

    // Explicit header, because the store has not been updated yet — the
    // request interceptor would send nothing. Same handshake as the login
    // page, and it breaks the same way if the token is not passed through.
    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith('/auth/me', {
        headers: { Authorization: 'Bearer access-1' },
      })
    );
  });

  it('signs the user in and lands them on their own dashboard', async () => {
    renderPage('tok-123');

    await activate();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard/employee'));
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().accessToken).toBe('access-1');
  });

  it('routes by the role the server reports, not a default', async () => {
    // An invited HR admin lands on the HR dashboard. Hardcoding a single
    // destination here would put every new starter on the wrong screen and
    // then bounce them, now that RoleGuard exists (#28).
    mockGet.mockResolvedValue({ ...{ data: { ...ME, role: 'HR_ADMIN' } } });
    renderPage('tok-123');

    await activate();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard/hr-admin'));
  });
});

describe('when activation fails', () => {
  it('reports an already-used link in the server’s words', async () => {
    // Not hypothetical. Resending an invitation retires the previous one
    // (#23), so whoever clicks the old link arrives here.
    mockPost.mockRejectedValueOnce(
      new Error('This activation link has already been used.')
    );
    renderPage('tok-123');

    await activate();

    expect(
      await screen.findByText('This activation link has already been used.')
    ).toBeInTheDocument();
    expect(error).toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it('does not sign the user in when /auth/me fails after a good token', async () => {
    // A token without a user is not a session. Storing half of one leaves the
    // store authenticated with nothing to render, and the token is now spent.
    mockGet.mockRejectedValueOnce(new Error('500'));
    renderPage('tok-123');

    await activate();

    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it('leaves the form usable so a transient failure can be retried', async () => {
    mockPost.mockRejectedValueOnce(new Error('Network error'));
    renderPage('tok-123');

    await activate();

    await screen.findByText('Network error');
    expect(screen.getByRole('button', { name: 'Activate account' })).toBeEnabled();
  });
});

describe('validation before the token is spent', () => {
  it('refuses mismatched passwords without sending anything', async () => {
    // An activation token is single-use. Burning it on a typo means the
    // person needs an admin to resend the invitation.
    renderPage('tok-123');

    await activate(STRONG, 'Different1!');

    expect(await screen.findByText("Passwords don't match")).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('refuses a password that fails the strength rule', async () => {
    renderPage('tok-123');

    await activate('weakpass', 'weakpass');

    await waitFor(() => expect(mockPost).not.toHaveBeenCalled());
  });
});
