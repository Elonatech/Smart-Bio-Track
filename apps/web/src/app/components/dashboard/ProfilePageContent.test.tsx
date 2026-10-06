/**
 * @jest-environment jsdom
 */
import { ProfilePageContent } from './ProfilePageContent';
import { appClient } from '@/lib/api-client';
import { renderWithProviders, signInAs, signOut, screen, waitFor } from '@/test/render';
import userEvent from '@testing-library/user-event';

/**
 * The profile page, shared by all four roles (#27).
 *
 * Most of this screen is **deliberately disabled**. Its own header records
 * what is real and what is not, checked against the backend: name, email,
 * role, organisation and department come from `/auth/me`; phone and job title
 * have no column; there is no `PATCH /users` (#30 added one for admins
 * editing others, not for self-service), no change-password route, no Device
 * model.
 *
 * That makes the interesting assertions negative ones — the fields render,
 * and nothing about them persists. A future contributor wiring one of these
 * up should have to change a test that says so out loud, rather than
 * discovering the constraint from a 404.
 *
 * The one live action is the password reset, which shares `/auth/forgot-password`
 * with the sign-in flow — including its deliberately identical response for
 * unknown addresses, and therefore its careful wording.
 */

jest.mock('@/lib/api-client', () => ({
  appClient: { get: jest.fn(), post: jest.fn() },
  extractErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : 'Something went wrong',
}));

const success = jest.fn();
const error = jest.fn();
jest.mock('@/app/components/Toast', () => ({
  useToast: () => ({ success, error, info: jest.fn() }),
}));

const mockGet = appClient.get as jest.Mock;
const mockPost = appClient.post as jest.Mock;

const ME = {
  id: 'u1',
  name: 'Ada Okafor',
  email: 'ada@example.com',
  role: 'HR_ADMIN' as const,
  organizationId: 'org-1',
  organizationName: 'Acme Ltd',
  departmentId: 'dept-1',
  departmentName: 'Engineering',
};

beforeEach(() => {
  signOut();
  signInAs('HR_ADMIN');
  mockGet.mockResolvedValue({ data: ME });
  mockPost.mockResolvedValue({ data: {} });
});

describe('what it shows', () => {
  it('renders the real fields from /auth/me', async () => {
    renderWithProviders(<ProfilePageContent />);

    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/auth/me'));
    expect(await screen.findByText('Ada Okafor')).toBeInTheDocument();
    // Email is an editable input; the name is read-only text. The split is the
    // page's own: only some fields have anywhere to be saved to, and even
    // those do not save yet.
    expect(screen.getByDisplayValue('ada@example.com')).toBeInTheDocument();
  });

  it('keeps the stored copy on screen when the fetch fails', async () => {
    // Non-fatal by design: the auth store already holds a user, so a failed
    // refresh should not blank a page the person is reading.
    mockGet.mockRejectedValueOnce(new Error('offline'));

    renderWithProviders(<ProfilePageContent />);

    expect(await screen.findByText('Ada Okafor')).toBeInTheDocument();
  });
});

describe('nothing on this page saves', () => {
  // The constraint the header documents. These are the tests that should
  // fail when somebody wires a field up — at which point they are removed
  // deliberately rather than discovered by a 404 in production.
  it('sends nothing but the reset request', async () => {
    renderWithProviders(<ProfilePageContent />);
    await screen.findByText('Ada Okafor');

    const calls = mockPost.mock.calls.filter(([url]) => url !== '/auth/forgot-password');
    expect(calls).toHaveLength(0);
  });

  it('disables Save and says why', async () => {
    // Note where the disabling lives: the *button*, not the fields. The
    // fields are editable — somebody can type into them — and the save has
    // nowhere to go. A first draft of this test assumed disabled inputs and
    // passed vacuously, because `getAllByRole('textbox').filter(disabled)`
    // was an empty list and an empty loop asserts nothing.
    renderWithProviders(<ProfilePageContent />);
    await screen.findByText('Ada Okafor');

    const save = screen.getByRole('button', { name: 'Save changes' });

    expect(save).toBeDisabled();
    expect(save).toHaveAttribute('title', expect.stringContaining('No endpoint'));
  });

  it('explains which fields the server does not even return', async () => {
    // "Not available yet" in a field is ambiguous — missing data or a broken
    // fetch? The note underneath names them, so it reads as unfinished
    // rather than faulty.
    renderWithProviders(<ProfilePageContent />);
    await screen.findByText('Ada Okafor');

    expect(screen.getAllByText('Not available yet').length).toBeGreaterThan(0);
    expect(screen.getByText(/aren't returned to/i)).toBeInTheDocument();
  });
});

describe('requesting a password reset', () => {
  it('posts the signed-in address to the public endpoint', async () => {
    renderWithProviders(<ProfilePageContent />);
    await screen.findByText('Ada Okafor');

    await userEvent.click(screen.getByRole('button', { name: 'Reset my password' }));
    await userEvent.click(await screen.findByRole('button', { name: /send|confirm|reset/i }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/auth/forgot-password', {
        email: 'ada@example.com',
      })
    );
  });

  it('warns that setting a new password signs them out everywhere', async () => {
    // A real consequence, and one somebody resetting their own password from
    // a settings page would not expect. The endpoint revokes every session.
    renderWithProviders(<ProfilePageContent />);
    await screen.findByText('Ada Okafor');

    expect(screen.getByText(/signs you out/i)).toBeInTheDocument();
  });

  it('repeats the warning in the confirmation', async () => {
    renderWithProviders(<ProfilePageContent />);
    await screen.findByText('Ada Okafor');

    await userEvent.click(screen.getByRole('button', { name: 'Reset my password' }));
    await userEvent.click(await screen.findByRole('button', { name: /send|confirm|reset/i }));

    await waitFor(() => expect(success).toHaveBeenCalled());
    expect(success.mock.calls[0][1]).toMatch(/signs you out everywhere/i);
  });

  it('shows the server’s reason when the request is refused', async () => {
    // The endpoint is public and throttled, so a rate-limit refusal is the
    // realistic failure.
    mockPost.mockRejectedValueOnce(new Error('Too many requests. Try again shortly.'));
    renderWithProviders(<ProfilePageContent />);
    await screen.findByText('Ada Okafor');

    await userEvent.click(screen.getByRole('button', { name: 'Reset my password' }));
    await userEvent.click(await screen.findByRole('button', { name: /send|confirm|reset/i }));

    expect(
      await screen.findByText('Too many requests. Try again shortly.')
    ).toBeInTheDocument();
    expect(error).toHaveBeenCalled();
  });
});
