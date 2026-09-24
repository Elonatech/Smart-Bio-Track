/**
 * @jest-environment jsdom
 */
import { RoleGuard } from './RoleGuard';
import { useAuthStore } from '@/lib/store/auth-store';
import { ROLE_DASHBOARD_PATH } from '@/lib/roleRoutes';
import { render, screen } from '@testing-library/react';
import type { UserRole } from '@smartbiotrack/types';

/**
 * #28 — each role stays in its own area.
 *
 * The test that matters most is the cross-role one: before this component
 * existed, an EMPLOYEE at /dashboard/super-admin/audit-logs got the page. It
 * was not a data leak — the API refused every request behind it — but nothing
 * turned them away, and nothing would have turned away a future page that
 * rendered something before its fetch resolved.
 */

const replace = jest.fn();
let pathname = '/dashboard/super-admin';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => pathname,
}));

function signedInAs(role: UserRole) {
  useAuthStore.setState({
    user: {
      id: 'u1',
      name: 'Ada',
      email: 'ada@example.com',
      role,
      organizationId: 'org-1',
      departmentId: null,
      departmentName: null,
    },
    isAuthenticated: true,
    hasRestored: true,
  });
}

function renderAt(path: string) {
  pathname = path;
  return render(
    <RoleGuard>
      <p>Page content</p>
    </RoleGuard>
  );
}

const ROLES: UserRole[] = ['SUPER_ADMIN', 'HR_ADMIN', 'TEAM_LEAD', 'EMPLOYEE'];

beforeEach(() => {
  useAuthStore.getState().clearSession();
  pathname = '/dashboard';
});

describe('RoleGuard', () => {
  describe('a role inside its own area', () => {
    it.each(ROLES)('%s is let through to its own dashboard', (role) => {
      signedInAs(role);
      renderAt(ROLE_DASHBOARD_PATH[role]);

      expect(screen.getByText('Page content')).toBeInTheDocument();
      expect(replace).not.toHaveBeenCalled();
    });

    it.each(ROLES)('%s is let through to a nested page in its own area', (role) => {
      signedInAs(role);
      renderAt(`${ROLE_DASHBOARD_PATH[role]}/profile`);

      expect(screen.getByText('Page content')).toBeInTheDocument();
      expect(replace).not.toHaveBeenCalled();
    });
  });

  describe('a role inside somebody else’s area', () => {
    it('sends an EMPLOYEE at the audit trail back to their own dashboard', () => {
      // The finding, stated as a test. This exact URL rendered the full audit
      // page — banner, filters and all — before #28.
      signedInAs('EMPLOYEE');
      renderAt('/dashboard/super-admin/audit-logs');

      expect(screen.queryByText('Page content')).not.toBeInTheDocument();
      expect(replace).toHaveBeenCalledWith('/dashboard/employee');
    });

    it('sends a TEAM_LEAD at the staff directory back to their own dashboard', () => {
      signedInAs('TEAM_LEAD');
      renderAt('/dashboard/hr-admin/employees');

      expect(screen.queryByText('Page content')).not.toBeInTheDocument();
      expect(replace).toHaveBeenCalledWith('/dashboard/team-lead');
    });

    it('applies to an admin wandering into a lesser role’s area too', () => {
      // Not a privilege question — a correctness one. A SUPER_ADMIN on the
      // employee dashboard sees a screen built around assumptions about the
      // viewer that do not hold.
      signedInAs('SUPER_ADMIN');
      renderAt('/dashboard/employee/attendance');

      expect(replace).toHaveBeenCalledWith('/dashboard/super-admin');
    });

    it('renders nothing at all while redirecting, not the page', () => {
      // A single frame of the wrong page is the flash this exists to stop.
      signedInAs('EMPLOYEE');
      const { container } = renderAt('/dashboard/super-admin/employees');

      expect(container).toBeEmptyDOMElement();
    });

    it('replaces rather than pushes, so Back does not return to it', () => {
      signedInAs('EMPLOYEE');
      renderAt('/dashboard/super-admin');

      expect(replace).toHaveBeenCalledTimes(1);
    });
  });

  describe('paths that are not a role area', () => {
    it('lets /dashboard itself through, because its own page routes by role', () => {
      // Guarding this would fight DashboardIndexPage's redirect, and two
      // components racing to redirect is how a loop gets written.
      signedInAs('EMPLOYEE');
      renderAt('/dashboard');

      expect(screen.getByText('Page content')).toBeInTheDocument();
      expect(replace).not.toHaveBeenCalled();
    });

    it('leaves an unknown dashboard path alone for Next to 404', () => {
      // Redirecting here would hide a broken link from whoever wrote it.
      signedInAs('EMPLOYEE');
      renderAt('/dashboard/reports');

      expect(screen.getByText('Page content')).toBeInTheDocument();
      expect(replace).not.toHaveBeenCalled();
    });
  });

  describe('when the role is not known yet', () => {
    it('decides nothing without a session', () => {
      // AuthGuard wraps this and will not render children before the restore
      // finishes, so this is defence in depth — but a guard that redirects on
      // an unknown role sends signed-in people to a stranger's dashboard on
      // every page load.
      renderAt('/dashboard/super-admin/audit-logs');

      expect(replace).not.toHaveBeenCalled();
    });
  });
});
