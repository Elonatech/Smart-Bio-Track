/**
 * @jest-environment jsdom
 */
import VerifyOrganizationPage from './page';
import { appClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/store/auth-store';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Step two of organisation signup (#27), and the highest-consequence screen
 * in the product: it creates a tenant and its founding Org Super Admin.
 *
 * Two things are specific to this page rather than shared with the other
 * token screens:
 *
 *  - **It lands in onboarding, not a dashboard.** A brand-new organisation
 *    has no offices and no work rules, and every dashboard assumes both.
 *  - **The name and organisation are seeded from the form**, so the screen
 *    renders correctly even if `/auth/me` has not caught up. The server still
 *    wins when it does send them, and the test below checks that ordering
 *    rather than just the happy path.
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
  name: 'Ada Okafor',
  email: 'founder@acme.test',
  role: 'SUPER_ADMIN' as const,
  organizationId: 'org-1',
  organizationName: 'Acme Ltd',
  departmentId: null,
  departmentName: null,
};

function renderPage(token?: string) {
  search = new URLSearchParams(token ? { token } : {});
  return render(<VerifyOrganizationPage />);
}

async function createOrg({
  organizationName = 'Acme Ltd',
  adminName = 'Ada Okafor',
} = {}) {
  await userEvent.type(await screen.findByLabelText(/organization name/i), organizationName);
  await userEvent.type(screen.getByLabelText(/your full name|admin name/i), adminName);

  // Industry is a select in this form; pick whatever the first real option is
  // so the test does not encode a particular industry list.
  const industry = screen.getByLabelText(/industry/i) as HTMLSelectElement;
  const firstReal = Array.from(industry.options).find((o) => o.value !== '');
  if (firstReal) await userEvent.selectOptions(industry, firstReal.value);

  await userEvent.click(screen.getByRole('button', { name: 'Create organization' }));
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

describe('with no token', () => {
  it('says the link is incomplete instead of rendering a form that must fail', async () => {
    renderPage();

    expect(await screen.findByText('This link is incomplete')).toBeInTheDocument();
    expect(screen.queryByLabelText(/organization name/i)).not.toBeInTheDocument();
  });

  it('offers a way to start over', async () => {
    renderPage();

    const link = await screen.findByRole('link', { name: 'Start over' });
    expect(link).toHaveAttribute('href', '/auth/register');
  });
});

describe('creating the organisation', () => {
  it('sends the token with the organisation details', async () => {
    renderPage('tok-abc');

    await createOrg();

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    const [url, body] = mockPost.mock.calls[0];
    expect(url).toBe('/auth/verify-organization');
    expect(body).toMatchObject({
      token: 'tok-abc',
      organizationName: 'Acme Ltd',
      adminName: 'Ada Okafor',
    });
  });

  it('fetches the user with the token it was just handed', async () => {
    renderPage('tok-abc');

    await createOrg();

    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith('/auth/me', {
        headers: { Authorization: 'Bearer access-1' },
      })
    );
  });

  it('signs the founder in and sends them to onboarding, not a dashboard', async () => {
    // A brand-new organisation has no offices and no work rules. Every
    // dashboard assumes both, so landing there shows a shell full of empty
    // states on the very first screen a customer ever sees.
    renderPage('tok-abc');

    await createOrg();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/onboarding'));
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user?.role).toBe('SUPER_ADMIN');
  });

  it('prefers the server’s values over the form’s when both exist', async () => {
    // The form values are a fallback for a response that has not caught up,
    // not an override. Getting this backwards would let a typo in the form
    // outrank what the database actually stored.
    mockGet.mockResolvedValue({ data: { ...ME, organizationName: 'Acme Limited' } });
    renderPage('tok-abc');

    await createOrg({ organizationName: 'Acme Ltd' });

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(useAuthStore.getState().user?.organizationName).toBe('Acme Limited');
  });

  it('falls back to the form when the server omits them', async () => {
    mockGet.mockResolvedValue({
      data: { ...ME, name: '', organizationName: null },
    });
    renderPage('tok-abc');

    await createOrg({ organizationName: 'Acme Ltd', adminName: 'Ada Okafor' });

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(useAuthStore.getState().user?.organizationName).toBe('Acme Ltd');
    expect(useAuthStore.getState().user?.name).toBe('Ada Okafor');
  });
});

describe('when it fails', () => {
  it('reports an expired link in the server’s words', async () => {
    mockPost.mockRejectedValueOnce(
      new Error('This verification link has expired.')
    );
    renderPage('tok-abc');

    await createOrg();

    expect(
      await screen.findByText('This verification link has expired.')
    ).toBeInTheDocument();
    expect(error).toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it('does not sign anybody in when /auth/me fails after the org is created', async () => {
    // The awkward case: the organisation now exists and the session does
    // not. Storing half a session would leave an authenticated store with no
    // user — worse than making them sign in, which will now work.
    mockGet.mockRejectedValueOnce(new Error('500'));
    renderPage('tok-abc');

    await createOrg();

    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });
});

describe('validation', () => {
  it('will not submit without an organisation name', async () => {
    renderPage('tok-abc');

    await screen.findByLabelText(/organization name/i);
    await userEvent.type(screen.getByLabelText(/your full name|admin name/i), 'Ada Okafor');
    await userEvent.click(screen.getByRole('button', { name: 'Create organization' }));

    await waitFor(() => expect(mockPost).not.toHaveBeenCalled());
  });
});
