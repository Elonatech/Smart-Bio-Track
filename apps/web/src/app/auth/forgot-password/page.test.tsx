/**
 * @jest-environment jsdom
 */
import ForgotPasswordPage from './page';
import { appClient } from '@/lib/api-client';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Requesting a reset link (#27).
 *
 * The behaviour worth protecting here is a **negative** one, which is why it
 * needs a test rather than a reviewer's memory.
 *
 * The endpoint answers identically whether or not the address has an account —
 * deliberately, so it cannot be used to discover who is registered. That
 * protection lives on the server, and this screen can undo it in a sentence:
 * "We've sent you an email" over a 200 that means nothing of the sort tells an
 * attacker exactly which addresses exist. The copy is therefore conditional,
 * and the tests below hold it that way.
 *
 * The same reasoning already appears on `EmployeeDetailModal`, which shares
 * this endpoint.
 */

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

// The page links to /auth/login with next/link, which needs no router here,
// but the branded panel and form both render — so nothing else is stubbed.
const mockPost = appClient.post as jest.Mock;

async function requestReset(email = 'ada@example.com') {
  await userEvent.type(screen.getByLabelText(/email/i), email);
  await userEvent.click(screen.getByRole('button', { name: /send|reset link|continue/i }));
}

beforeEach(() => {
  mockPost.mockResolvedValue({ data: {} });
});

describe('requesting a link', () => {
  it('posts the address to the public endpoint', async () => {
    render(<ForgotPasswordPage />);

    await requestReset();

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/auth/forgot-password', {
        email: 'ada@example.com',
      })
    );
  });

  it('replaces the form with a confirmation, so it is not submitted twice', async () => {
    render(<ForgotPasswordPage />);

    await requestReset();

    expect(await screen.findByText('Check your inbox')).toBeInTheDocument();
  });
});

describe('the confirmation must not reveal whether the account exists', () => {
  it('is worded conditionally, not as a promise of delivery', async () => {
    // The whole point. "We have sent you an email" over a response that is
    // identical for unknown addresses hands an attacker a way to enumerate
    // accounts, and undoes the server-side protection from the browser.
    render(<ForgotPasswordPage />);

    await requestReset();

    expect(await screen.findByText(/If an account exists for/i)).toBeInTheDocument();
  });

  it('never claims delivery outside a conditional', async () => {
    // A first draft of this test asserted the words "we've sent" were absent
    // anywhere on screen. That was wrong: the real sentence is "If an account
    // exists for <address>, we've sent a link", and the claim is fine because
    // it sits *inside* the conditional. The property that matters is not the
    // absence of the phrase but that it is always governed by the "if".
    //
    // So: find every element mentioning delivery, and require each one to
    // carry the condition too.
    render(<ForgotPasswordPage />);

    await requestReset();
    await screen.findByText('Check your inbox');

    const claims = screen.queryAllByText(/sent/i);
    expect(claims.length).toBeGreaterThan(0);

    for (const claim of claims) {
      expect(claim.textContent).toMatch(/If an account exists/i);
    }
  });

  it('says the same thing whatever address is used', async () => {
    // A different message for a different address is the leak, whether it
    // comes from the server or from a branch in here.
    const { unmount } = render(<ForgotPasswordPage />);
    await requestReset('known@example.com');
    const first = (await screen.findByText(/If an account exists for/i)).textContent;
    unmount();

    render(<ForgotPasswordPage />);
    await requestReset('nobody@example.com');
    const second = (await screen.findByText(/If an account exists for/i)).textContent;

    // The address itself is echoed back, so compare the wording around it.
    expect(first?.replace('known@example.com', 'X')).toBe(
      second?.replace('nobody@example.com', 'X')
    );
  });

  it('confirms in the same terms in the toast', async () => {
    // A toast is easy to overlook when the on-screen copy is reviewed, and it
    // reaches the same reader.
    render(<ForgotPasswordPage />);

    await requestReset();

    await waitFor(() => expect(success).toHaveBeenCalled());
    expect(success.mock.calls[0][1]).toMatch(/If an account exists/i);
  });
});

describe('failures', () => {
  it('shows the server’s reason and keeps the form', async () => {
    // A rate-limit refusal is the realistic one here — the endpoint is public
    // and throttled.
    mockPost.mockRejectedValueOnce(new Error('Too many requests. Try again shortly.'));
    render(<ForgotPasswordPage />);

    await requestReset();

    expect(
      await screen.findByText('Too many requests. Try again shortly.')
    ).toBeInTheDocument();
    expect(error).toHaveBeenCalled();
    expect(screen.queryByText('Check your inbox')).not.toBeInTheDocument();
  });
});

describe('validation', () => {
  it('sends nothing for an address that is not an email', async () => {
    render(<ForgotPasswordPage />);

    const email = screen.getByLabelText(/email/i) as HTMLInputElement;
    await userEvent.type(email, 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: /send|reset link|continue/i }));

    // Native constraint validation on a type="email" input blocks submission
    // before the schema runs — the same behaviour as the invite form, and the
    // reason this asserts the outcome rather than a message.
    expect(email.checkValidity()).toBe(false);
    expect(mockPost).not.toHaveBeenCalled();
  });
});
