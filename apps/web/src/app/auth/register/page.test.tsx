/**
 * @jest-environment jsdom
 */
import RegisterPage from './page';
import { appClient } from '@/lib/api-client';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Step one of organisation signup (#27).
 *
 * Nothing is created here. The endpoint stores a pending signup and emails a
 * link; the organisation itself is made at step two
 * (`/verify-organization`). So the two things worth holding are that **no
 * session is established** — an earlier version of this flow logged people
 * straight in — and that `confirmPassword` never leaves the browser, because
 * the DTO rejects unknown properties and the whole request would 400.
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

const mockPost = appClient.post as jest.Mock;

const STRONG = 'Passw0rd!x';

async function signUp({
  email = 'founder@acme.test',
  password = STRONG,
  confirm = STRONG,
} = {}) {
  await userEvent.type(screen.getByLabelText(/email/i), email);
  await userEvent.type(screen.getByLabelText(/^password$/i), password);
  await userEvent.type(screen.getByLabelText(/confirm/i), confirm);
  await userEvent.click(screen.getByRole('button', { name: 'Send verification link' }));
}

beforeEach(() => {
  mockPost.mockResolvedValue({ data: { message: 'ok' } });
});

describe('submitting the form', () => {
  it('sends only the two fields the endpoint declares', async () => {
    // confirmPassword is a browser-side check. The DTO rejects unknown
    // properties, so including it turns a valid signup into a 400 that reads
    // as the form being broken.
    render(<RegisterPage />);

    await signUp();

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    const [url, body] = mockPost.mock.calls[0];

    expect(url).toBe('/auth/register-organization');
    expect(Object.keys(body).sort()).toEqual(['email', 'password']);
    expect(body).not.toHaveProperty('confirmPassword');
  });

  it('confirms without creating a session', async () => {
    // Nothing exists yet — no organisation, no user, no tokens. The response
    // carries a message and nothing else.
    render(<RegisterPage />);

    await signUp();

    expect(await screen.findByText('Check your inbox')).toBeInTheDocument();
    expect(success).toHaveBeenCalled();
  });

  it('names the address the link went to', async () => {
    // A mistyped address is the most likely reason nothing arrives, and the
    // user cannot check it once the form is gone.
    render(<RegisterPage />);

    await signUp({ email: 'typo@acme.test' });

    await screen.findByText('Check your inbox');
    expect(screen.getByText(/typo@acme\.test/)).toBeInTheDocument();
  });
});

describe('when the address is already taken', () => {
  it('shows the server’s wording rather than a generic failure', async () => {
    // This endpoint *does* distinguish a taken address, unlike the reset
    // flow — an organisation signup has nobody to protect from enumeration
    // at this point, and telling somebody their company is already
    // registered is more useful than silence.
    mockPost.mockRejectedValueOnce(
      new Error('An organization with this email already exists.')
    );
    render(<RegisterPage />);

    await signUp();

    expect(
      await screen.findByText('An organization with this email already exists.')
    ).toBeInTheDocument();
    expect(error).toHaveBeenCalled();
    expect(screen.queryByText('Check your inbox')).not.toBeInTheDocument();
  });
});

describe('validation before anything is sent', () => {
  it('refuses mismatched passwords', async () => {
    render(<RegisterPage />);

    await signUp({ confirm: 'Different1!' });

    expect(await screen.findByText("Passwords don't match")).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('refuses a password that fails the strength rule', async () => {
    // The rule is imported from @smartbiotrack/constants rather than
    // re-typed, so this also fails if the shared pattern is loosened without
    // anyone meaning to.
    render(<RegisterPage />);

    await signUp({ password: 'alllowercase', confirm: 'alllowercase' });

    await waitFor(() => expect(mockPost).not.toHaveBeenCalled());
  });
});
