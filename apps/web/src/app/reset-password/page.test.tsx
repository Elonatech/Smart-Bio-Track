/**
 * @jest-environment jsdom
 */
import ResetPasswordPage from './page';
import { appClient } from '@/lib/api-client';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Redeeming a password-reset link (#27).
 *
 * The token arrives in the query string of an emailed link, which makes this
 * one of two screens where an untrusted value from outside the app is handed
 * straight to an endpoint that changes a credential. Three things matter:
 *
 *  - **No token means no request.** A malformed link must not POST
 *    `{ token: null }` and let the server decide; the user gets a dead 400 and
 *    no idea why.
 *  - **A missing token must not be a dead end.** The screen says "request a
 *    new one", so it has to offer a way to do that.
 *  - **Success must not sign the user in.** The endpoint deliberately does not
 *    issue tokens — it revokes existing sessions and expects a fresh sign-in.
 *    A page that behaved as if it had a session would show a dashboard whose
 *    every request 401s.
 */

const push = jest.fn();
let search = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => search,
}));

jest.mock('@/lib/api-client', () => ({
  appClient: { post: jest.fn() },
  extractErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : 'Something went wrong',
}));

const success = jest.fn();
const error = jest.fn();
jest.mock('@/app/components/Toast', () => ({
  useToast: () => ({ success, error, info: jest.fn() }),
}));

const mockPost = appClient.post as jest.Mock;

function renderPage(token?: string) {
  search = new URLSearchParams(token ? { token } : {});
  return render(<ResetPasswordPage />);
}

const STRONG = 'NewPassw0rd!';

async function submit(password = STRONG, confirm = password) {
  await userEvent.type(await screen.findByLabelText(/^new password$/i), password);
  await userEvent.type(screen.getByLabelText(/confirm/i), confirm);
  await userEvent.click(screen.getByRole('button', { name: /reset password|set password|change password/i }));
}

beforeEach(() => {
  mockPost.mockResolvedValue({ data: {} });
});

describe('with no token in the link', () => {
  it('says the link is missing its token', async () => {
    renderPage();

    expect(
      await screen.findByText(/This reset link is missing its token/i)
    ).toBeInTheDocument();
  });

  it('offers a way out rather than leaving a dead end', async () => {
    // The copy tells the user to request a new link. Saying that without
    // offering it strands somebody on the one screen where they are already
    // stuck.
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Request a new link' })
    );

    expect(push).toHaveBeenCalledWith('/auth/forgot-password');
  });

  it('does not render the form at all', async () => {
    // Not merely disabled. A form that submits nothing looks broken; no form
    // with an explanation reads as a bad link, which is what it is.
    renderPage();

    await screen.findByText(/missing its token/i);
    expect(screen.queryByLabelText(/^new password$/i)).not.toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });
});

describe('with a token', () => {
  it('posts the token alongside the new password', async () => {
    renderPage('tok-123');

    await submit();

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    const [url, body] = mockPost.mock.calls[0];
    expect(url).toBe('/auth/reset-password');
    expect(body).toMatchObject({ token: 'tok-123', password: STRONG });
  });

  it('does not sign the user in on success', async () => {
    // The endpoint issues no tokens by design — it revokes existing sessions.
    // A page that assumed otherwise would land somebody on a dashboard whose
    // every request 401s.
    renderPage('tok-123');

    await submit();

    await waitFor(() => expect(success).toHaveBeenCalled());
    expect(push).not.toHaveBeenCalledWith(expect.stringContaining('/dashboard'));
  });

  it('sends the user to sign in again, and says why', async () => {
    renderPage('tok-123');

    await submit();

    expect(await screen.findByText(/Password reset/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Go to sign in' }));
    expect(push).toHaveBeenCalledWith('/auth/login');
  });

  it('shows an expired-token message from the server rather than a generic one', async () => {
    // The most common real failure: a link sat in an inbox past its lifetime.
    // "Something went wrong" leaves the user retrying the same dead link.
    mockPost.mockRejectedValueOnce(new Error('This reset link has expired.'));
    renderPage('tok-123');

    await submit();

    expect(await screen.findByText('This reset link has expired.')).toBeInTheDocument();
    expect(error).toHaveBeenCalled();
  });

  it('keeps the form usable after a failure', async () => {
    mockPost.mockRejectedValueOnce(new Error('Network error'));
    renderPage('tok-123');

    await submit();

    await screen.findByText('Network error');
    expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument();
  });
});

describe('validation before the token is spent', () => {
  it('will not submit mismatched passwords', async () => {
    // A reset token is single-use. Sending a request that the server will
    // reject on a mismatch risks burning the link on a typo.
    renderPage('tok-123');

    await submit(STRONG, 'Different1!');

    expect(await screen.findByText("Passwords don't match")).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('will not submit a password that fails the strength rule', async () => {
    renderPage('tok-123');

    await submit('weakpass', 'weakpass');

    await waitFor(() => expect(mockPost).not.toHaveBeenCalled());
  });
});
