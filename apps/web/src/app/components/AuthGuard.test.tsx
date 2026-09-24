/**
 * @jest-environment jsdom
 */
import { AuthGuard } from './AuthGuard';
import { useAuthStore } from '@/lib/store/auth-store';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * AuthGuard decides whether protected content is rendered at all, which makes
 * it the single most load-bearing component in the browser — and it had no
 * tests until now (#27).
 *
 * Its three states are easy to get subtly wrong in a way nothing shouts about:
 * render the prompt too early and every page load flashes "Sign in to
 * continue" at someone who is signed in; render children too early and a
 * signed-out visitor sees a dashboard shell for a moment before it is pulled
 * away. Both are behaviour, not appearance, so both belong here.
 */

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

/**
 * Sets store state directly rather than through `login()`, because the states
 * being tested include ones `login()` cannot produce — specifically "restore
 * has not finished yet", which is the initial condition on every page load and
 * the one most likely to be broken by a careless refactor.
 */
function setAuthState(state: { hasRestored: boolean; isAuthenticated: boolean }) {
  useAuthStore.setState(state);
}

beforeEach(() => {
  setAuthState({ hasRestored: false, isAuthenticated: false });
});

describe('AuthGuard', () => {
  it('renders nothing at all while the session restore is still in flight', () => {
    setAuthState({ hasRestored: false, isAuthenticated: false });

    const { container } = render(
      <AuthGuard>
        <p>Protected content</p>
      </AuthGuard>
    );

    // Neither the content nor the prompt. This is the assertion that stops
    // someone "simplifying" the guard down to a single isAuthenticated check:
    // that version renders the sign-in prompt here, on every single page load,
    // for as long as the /auth/me round trip takes.
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
    expect(screen.queryByText('Sign in to continue')).not.toBeInTheDocument();
  });

  it('keeps children hidden during restore even when the user is already authenticated', () => {
    // The ordering case: authenticated but not yet restored. `hasRestored` is
    // the gate, not `isAuthenticated`, and swapping the two conditions would
    // still pass every other test in this file.
    setAuthState({ hasRestored: false, isAuthenticated: true });

    const { container } = render(
      <AuthGuard>
        <p>Protected content</p>
      </AuthGuard>
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the sign-in prompt, and not the content, once restore finishes with no session', () => {
    setAuthState({ hasRestored: true, isAuthenticated: false });

    render(
      <AuthGuard>
        <p>Protected content</p>
      </AuthGuard>
    );

    expect(screen.getByText('Sign in to continue')).toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('sends the visitor to the login page when they take the prompt up on it', async () => {
    setAuthState({ hasRestored: true, isAuthenticated: false });

    render(
      <AuthGuard>
        <p>Protected content</p>
      </AuthGuard>
    );

    await userEvent.click(screen.getByRole('button', { name: 'Go to sign in' }));

    // The literal path matters: /auth/login is in proxy.ts's SIGNED_OUT_ONLY
    // list, and a typo here strands the visitor on a route the middleware then
    // has an opinion about.
    expect(push).toHaveBeenCalledWith('/auth/login');
  });

  it('renders the protected content for a restored, authenticated session', () => {
    setAuthState({ hasRestored: true, isAuthenticated: true });

    render(
      <AuthGuard>
        <p>Protected content</p>
      </AuthGuard>
    );

    expect(screen.getByText('Protected content')).toBeInTheDocument();
    expect(screen.queryByText('Sign in to continue')).not.toBeInTheDocument();
  });

  it('does not consult the user object, only the two flags', () => {
    // A guard that reads `user !== null` instead of `isAuthenticated` looks
    // equivalent and is not: clearSession() sets both, but a partially
    // populated store during restore can have one without the other.
    setAuthState({ hasRestored: true, isAuthenticated: true });
    useAuthStore.setState({ user: null });

    render(
      <AuthGuard>
        <p>Protected content</p>
      </AuthGuard>
    );

    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });
});
