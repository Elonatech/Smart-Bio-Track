/**
 * @jest-environment jsdom
 */
import { Sidebar } from './Sidebar';
import { SIDEBAR_ITEMS } from './sidebarConfig';
import { signOut } from '@/lib/session';
import { useAuthStore } from '@/lib/store/auth-store';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserRole } from '@smartbiotrack/types';

/**
 * The navigation half of role separation.
 *
 * #28 fixed the routing half — typing another role's URL now redirects. This
 * is the other side: what each role is *offered*. Until that fix, the sidebar
 * was the only thing keeping roles apart, which is why its contents are worth
 * asserting even though they are "just links".
 *
 * The active-link logic is the subtle part. Every item's href is nested under
 * the role's root, so a plain prefix match would keep "Overview" highlighted
 * on every page in the section.
 */

const push = jest.fn();
let pathname = '/dashboard/super-admin';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => pathname,
}));

jest.mock('@/lib/session', () => ({ signOut: jest.fn() }));

const success = jest.fn();
jest.mock('@/app/components/Toast', () => ({
  useToast: () => ({ success, error: jest.fn(), info: jest.fn() }),
}));

const mockSignOut = signOut as jest.Mock;

function renderSidebar({
  role = 'SUPER_ADMIN' as UserRole,
  path = '/dashboard/super-admin',
  isCollapsed = false,
  isMobileOpen = false,
} = {}) {
  pathname = path;
  const onCloseMobile = jest.fn();
  const onToggleCollapse = jest.fn();

  const view = render(
    <Sidebar
      items={SIDEBAR_ITEMS[role]}
      isMobileOpen={isMobileOpen}
      onCloseMobile={onCloseMobile}
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
    />
  );

  return { ...view, onCloseMobile, onToggleCollapse };
}

function signedInAs(role: UserRole) {
  useAuthStore.setState({
    user: {
      id: 'u1',
      name: 'Ada Okafor',
      email: 'ada@example.com',
      role,
      organizationId: 'org-1',
      organizationName: 'Acme Ltd',
      departmentId: null,
      departmentName: null,
    },
    isAuthenticated: true,
    hasRestored: true,
  });
}

beforeEach(() => {
  useAuthStore.getState().clearSession();
  mockSignOut.mockResolvedValue(undefined);
});

describe('what each role is offered', () => {
  it('gives a SUPER_ADMIN the audit trail and organization settings', () => {
    signedInAs('SUPER_ADMIN');
    renderSidebar({ role: 'SUPER_ADMIN' });

    expect(screen.getByRole('link', { name: /audit logs/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /organization settings/i })).toBeInTheDocument();
  });

  it('offers no audit trail to any other role', () => {
    // GET /audit-logs is SUPER_ADMIN only on the server. A link here for
    // anyone else is a link to a guaranteed 403.
    for (const role of ['HR_ADMIN', 'TEAM_LEAD', 'EMPLOYEE'] as UserRole[]) {
      const { unmount } = renderSidebar({ role, path: '/dashboard' });
      expect(screen.queryByRole('link', { name: /audit logs/i })).not.toBeInTheDocument();
      unmount();
    }
  });

  it.each(['SUPER_ADMIN', 'HR_ADMIN', 'TEAM_LEAD', 'EMPLOYEE'] as UserRole[])(
    'keeps every %s link inside that role’s own area',
    (role) => {
      // The invariant #28 enforces at the router. A link pointing outside the
      // role's own root is now a redirect on click — visible as a bug rather
      // than as a permissions hole, but still a bug.
      signedInAs(role);
      renderSidebar({ role, path: '/dashboard' });

      const root = SIDEBAR_ITEMS[role][0].href;
      for (const link of screen.getAllByRole('link')) {
        expect(link.getAttribute('href')).toMatch(new RegExp(`^${root}`));
      }
    }
  );

  it.each(['SUPER_ADMIN', 'HR_ADMIN', 'TEAM_LEAD', 'EMPLOYEE'] as UserRole[])(
    'points %s’s first item at the role root, and offers a profile',
    (role) => {
      // Deliberately about position and href, not about the label. Three roles
      // call the first item "Overview"; TEAM_LEAD calls it "Team Today",
      // because a team lead's overview *is* the roster and a separate Overview
      // above it would be a second page showing the same thing. The active-link
      // logic depends only on items[0] being the root path, so that is what is
      // worth holding. An earlier version of this test asserted the label and
      // failed on a documented decision.
      signedInAs(role);
      renderSidebar({ role, path: '/dashboard' });

      const links = screen.getAllByRole('link');
      expect(links[0]).toHaveAttribute('href', SIDEBAR_ITEMS[role][0].href);
      expect(screen.getByRole('link', { name: /profile/i })).toBeInTheDocument();
    }
  );

  it('renders nothing rather than crashing when given no items', () => {
    // dashboard/layout.tsx passes `?? []` when the role is not yet known.
    render(
      <Sidebar
        items={[]}
        isMobileOpen={false}
        onCloseMobile={jest.fn()}
        isCollapsed={false}
        onToggleCollapse={jest.fn()}
      />
    );

    expect(screen.getByRole('navigation').children).toHaveLength(0);
  });
});

describe('which link is highlighted', () => {
  // "Overview" points at the role's root, and every other item is nested
  // under it. A plain startsWith would light Overview up on every page.
  const ACTIVE = 'bg-white/10';

  it('highlights Overview only on the root page itself', () => {
    signedInAs('SUPER_ADMIN');
    renderSidebar({ path: '/dashboard/super-admin' });

    expect(screen.getByRole('link', { name: /overview/i }).className).toContain(ACTIVE);
  });

  it('does not keep Overview highlighted on a nested page', () => {
    signedInAs('SUPER_ADMIN');
    renderSidebar({ path: '/dashboard/super-admin/employees' });

    expect(screen.getByRole('link', { name: /overview/i }).className).not.toContain(ACTIVE);
    expect(screen.getByRole('link', { name: /employees/i }).className).toContain(ACTIVE);
  });

  it('keeps a section highlighted on its own sub-routes', () => {
    // Deeper than the item's own href — the item still owns the page.
    signedInAs('SUPER_ADMIN');
    renderSidebar({ path: '/dashboard/super-admin/offices/new' });

    expect(screen.getByRole('link', { name: /offices/i }).className).toContain(ACTIVE);
  });

  it('highlights exactly one item at a time', () => {
    signedInAs('SUPER_ADMIN');
    renderSidebar({ path: '/dashboard/super-admin/audit-logs' });

    const active = screen
      .getAllByRole('link')
      .filter((link) => link.className.includes(ACTIVE));

    expect(active).toHaveLength(1);
    expect(active[0]).toHaveAccessibleName(/audit logs/i);
  });
});

describe('the signed-in user panel', () => {
  it('shows the role label and organization', () => {
    signedInAs('HR_ADMIN');
    renderSidebar({ role: 'HR_ADMIN', path: '/dashboard/hr-admin' });

    expect(screen.getByText('HR Administrator')).toBeInTheDocument();
    expect(screen.getByText('Acme Ltd')).toBeInTheDocument();
  });

  it('falls back rather than showing an empty organization name', () => {
    signedInAs('HR_ADMIN');
    useAuthStore.setState((s) => ({
      user: s.user ? { ...s.user, organizationName: undefined } : null,
    }));
    renderSidebar({ role: 'HR_ADMIN', path: '/dashboard/hr-admin' });

    expect(screen.getByText('Your organization')).toBeInTheDocument();
  });

  it('is hidden when the rail is collapsed, where it would not fit', () => {
    signedInAs('HR_ADMIN');
    renderSidebar({ role: 'HR_ADMIN', isCollapsed: true });

    expect(screen.queryByText('HR Administrator')).not.toBeInTheDocument();
  });
});

describe('signing out', () => {
  it('calls the server, confirms, then goes to the login page', async () => {
    signedInAs('SUPER_ADMIN');
    renderSidebar();

    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
    expect(success).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/auth/login');
  });

  it('navigates away even if the revoke request failed', async () => {
    // signOut() swallows a failed request and clears local state regardless,
    // so there is no error path here — but if that ever changes, somebody
    // should be left stranded loudly rather than quietly.
    mockSignOut.mockResolvedValue(undefined);
    signedInAs('SUPER_ADMIN');
    renderSidebar();

    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/auth/login'));
  });
});

describe('the mobile drawer', () => {
  it('closes when a link is followed, so the page is not hidden behind it', async () => {
    signedInAs('SUPER_ADMIN');
    const { onCloseMobile } = renderSidebar({ isMobileOpen: true });

    await userEvent.click(screen.getByRole('link', { name: /employees/i }));

    expect(onCloseMobile).toHaveBeenCalled();
  });

  it('closes on the explicit close control', async () => {
    signedInAs('SUPER_ADMIN');
    const { onCloseMobile } = renderSidebar({ isMobileOpen: true });

    await userEvent.click(screen.getByRole('button', { name: 'Close menu' }));

    expect(onCloseMobile).toHaveBeenCalled();
  });

  it('offers collapse when expanded and expand when collapsed, never both', () => {
    signedInAs('SUPER_ADMIN');
    const { unmount } = renderSidebar({ isCollapsed: false });
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Expand sidebar' })).not.toBeInTheDocument();
    unmount();

    renderSidebar({ isCollapsed: true });
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Collapse sidebar' })).not.toBeInTheDocument();
  });
});

describe('the audit notice', () => {
  it('claims immutability only, with no retention promise', () => {
    // Same discipline as the audit page banner. The wording here is a
    // compliance statement shown on every dashboard screen.
    signedInAs('SUPER_ADMIN');
    const { container } = renderSidebar();

    expect(
      within(container).getByText(/Audit records are immutable/i)
    ).toBeInTheDocument();
    expect(within(container).queryByText(/7 years|seven years|hash.chain/i)).not.toBeInTheDocument();
  });
});
