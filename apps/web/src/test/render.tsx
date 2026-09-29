import type { ReactElement } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { PageHeaderProvider } from '@/app/components/dashboard/PageHeaderContext';
import { useAuthStore, type AuthUser } from '@/lib/store/auth-store';
import type { UserRole } from '@smartbiotrack/types';

/**
 * Shared test rendering for the dashboard components.
 *
 * Not a barrel of conveniences — two specific things every dashboard test needs
 * and would otherwise copy:
 *
 *  1. `PageHeaderProvider`. `usePageHeader` throws outside it by design, so a
 *     component calling it cannot be rendered bare. That throw is correct
 *     behaviour and would otherwise be the first thing every test tripped over.
 *  2. A signed-in user in the Zustand store, because these components read the
 *     role from it to decide what to show.
 *
 * Note this file is `src/test/render.tsx` and not `*.test.tsx`: `testMatch`
 * only picks up the latter, so Jest treats this as a module rather than as a
 * suite with no tests in it.
 */

const BASE_USER: AuthUser = {
  id: 'user-1',
  name: 'Ada Okafor',
  email: 'ada@example.com',
  role: 'SUPER_ADMIN',
  organizationId: 'org-1',
  organizationName: 'Acme Ltd',
  departmentId: null,
  departmentName: null,
};

/**
 * Puts a signed-in user into the auth store.
 *
 * Zustand stores are module singletons, so state set by one test is visible to
 * the next one in the same file. `clearMocks` does not touch this — it resets
 * mock functions, not application state. Every test that cares about the role
 * therefore sets it explicitly rather than inheriting whatever ran before.
 */
export function signInAs(role: UserRole, overrides: Partial<AuthUser> = {}) {
  useAuthStore.getState().login({ ...BASE_USER, role, ...overrides }, 'test-access-token');
}

/** Returns the store to its logged-out initial state. */
export function signOut() {
  useAuthStore.getState().clearSession();
}

function Providers({ children }: { children: React.ReactNode }) {
  return <PageHeaderProvider>{children}</PageHeaderProvider>;
}

export function renderWithProviders(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { wrapper: Providers, ...options });
}

export * from '@testing-library/react';
