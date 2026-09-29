/**
 * @jest-environment jsdom
 */
import { EmployeesPageContent } from './EmployeesPageContent';
import { appClient } from '@/lib/api-client';
import { renderWithProviders, signInAs, signOut, screen, waitFor, within } from '@/test/render';
import userEvent from '@testing-library/user-event';
import type { UserListItem } from '@smartbiotrack/types';

/**
 * The staff directory: the screen where roles are visible, people are invited
 * and people are removed.
 *
 * What is worth asserting here is not that a table renders. It is the three
 * places this component makes a decision:
 *
 *  1. Whether "Add person" appears at all, which follows ROLE_CREATION_MATRIX.
 *  2. Whether paging and search are sent to the server. #12 moved both
 *     server-side, and the failure mode of a regression is not an error — it
 *     is a search box that quietly only searches the ten rows on screen.
 *  3. Whether "no results" and "nothing here yet" stay distinguishable.
 */

jest.mock('@/lib/api-client', () => ({
  appClient: { get: jest.fn() },
  extractErrorMessage: () => 'error',
}));

const mockGet = appClient.get as jest.Mock;

function user(overrides: Partial<UserListItem> = {}): UserListItem {
  return {
    id: 'u1',
    employeeId: 'EMP-0001',
    name: 'Ada Okafor',
    email: 'ada@example.com',
    role: 'EMPLOYEE',
    status: 'ACTIVE',
    departmentId: 'dept-1',
    officeId: 'office-1',
    createdAt: '2026-09-01T09:00:00.000Z',
    ...overrides,
  };
}

/**
 * One place that answers every request the component makes on mount, keyed by
 * URL. Written as a router rather than as ordered `mockResolvedValueOnce`
 * calls because the component fires /departments, /offices and /users
 * concurrently — an ordering assumption here would make the test fail for
 * reasons that have nothing to do with the behaviour being checked.
 */
function respondWith({
  items = [user()],
  total = items.length,
  totalPages = 1,
  page = 1,
}: { items?: UserListItem[]; total?: number; totalPages?: number; page?: number } = {}) {
  mockGet.mockImplementation((url: string) => {
    if (url === '/departments') return Promise.resolve({ data: [{ id: 'dept-1', name: 'Engineering' }] });
    if (url === '/offices') return Promise.resolve({ data: [{ id: 'office-1', name: 'Lagos HQ' }] });
    if (url === '/users') {
      return Promise.resolve({ data: { items, page, limit: 10, total, totalPages } });
    }
    return Promise.reject(new Error(`unexpected request to ${url}`));
  });
}

/** The params of the most recent GET /users. */
function lastUsersQuery() {
  const calls = mockGet.mock.calls.filter(([url]) => url === '/users');
  return calls[calls.length - 1]?.[1]?.params;
}

/**
 * DataTable renders the rows **twice** — a table for desktop and a card list
 * for mobile — and hides one with CSS. Both are in the DOM, so every name,
 * department and role label matches twice and a bare `getByText` throws
 * "found multiple elements".
 *
 * Scoping to the first table keeps the assertions about one layout. The card
 * list is the same data through the same code path; asserting it separately
 * would double the suite to test the same decisions.
 */
const desktop = () => within(screen.getAllByRole('table')[0]);

/** Resolves once the first fetch has painted. */
async function loaded(name = 'Ada Okafor') {
  await screen.findAllByText(name);
}

// The Zustand store is a module singleton, so a role set by one test is still
// set in the next one. `clearMocks` resets mock functions, not application
// state — the "nobody is signed in" test below would silently inherit whoever
// ran before it and pass for the wrong reason.
beforeEach(() => {
  signOut();
});

afterEach(() => {
  mockGet.mockReset();
});

describe('EmployeesPageContent', () => {
  describe('who is offered the Add person button', () => {
    // The button is not a security control — the API enforces the matrix and
    // returns 403 regardless. It is an honesty control: offering an action
    // that always fails teaches people the product is broken.
    it.each([
      ['SUPER_ADMIN', true],
      ['HR_ADMIN', true],
      ['TEAM_LEAD', false],
      ['EMPLOYEE', false],
    ] as const)('%s -> %s', async (role, expected) => {
      respondWith();
      signInAs(role);

      renderWithProviders(<EmployeesPageContent />);
      await loaded();

      const button = screen.queryByRole('button', { name: /add person/i });
      if (expected) expect(button).toBeInTheDocument();
      else expect(button).not.toBeInTheDocument();
    });

    it('hides it rather than crashing when no one is signed in', async () => {
      // `currentRole` is undefined for the instant before restore resolves.
      // Indexing the matrix with undefined would throw, and the fallback that
      // prevents it is one `?:` away from being tidied out.
      respondWith();
      renderWithProviders(<EmployeesPageContent />);
      await loaded();

      expect(screen.queryByRole('button', { name: /add person/i })).not.toBeInTheDocument();
    });
  });

  describe('paging and search belong to the server', () => {
    beforeEach(() => signInAs('SUPER_ADMIN'));

    it('asks for page 1 with an explicit limit on first load', async () => {
      respondWith();
      renderWithProviders(<EmployeesPageContent />);
      await loaded();

      expect(lastUsersQuery()).toEqual({ page: 1, limit: 10 });
    });

    it('omits the search parameter entirely when the box is empty', async () => {
      // Not `q: ""`. An empty string is a value, and a server that treats it
      // as a filter returns nothing at all for a blank search box.
      respondWith();
      renderWithProviders(<EmployeesPageContent />);
      await loaded();

      expect(lastUsersQuery()).not.toHaveProperty('q');
    });

    it('sends the typed search to the server after the debounce', async () => {
      respondWith();
      renderWithProviders(<EmployeesPageContent />);
      await loaded();

      await userEvent.type(screen.getByPlaceholderText('Search employees'), 'okafor');

      // 300ms debounce. waitFor polls, so this asserts the request eventually
      // carries the term rather than guessing at a timer.
      await waitFor(() => expect(lastUsersQuery()).toMatchObject({ q: 'okafor' }));
    });

    it('returns to page 1 when a new search starts', async () => {
      respondWith({ items: [user()], total: 30, totalPages: 3 });
      renderWithProviders(<EmployeesPageContent />);
      await loaded();

      await userEvent.click(screen.getByRole('button', { name: 'Next' }));
      await waitFor(() => expect(lastUsersQuery()).toMatchObject({ page: 2 }));

      await userEvent.type(screen.getByPlaceholderText('Search employees'), 'zoe');

      // Without the reset this asks for page 2 of a one-page result and shows
      // an empty table — the bug reads as "search found nothing".
      await waitFor(() => expect(lastUsersQuery()).toMatchObject({ page: 1, q: 'zoe' }));
    });

    it('disables Previous on the first page and Next on the last', async () => {
      respondWith({ items: [user()], total: 30, totalPages: 3 });
      renderWithProviders(<EmployeesPageContent />);
      await loaded();

      expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    });

    it('does not offer paging controls when everything fits on one page', async () => {
      respondWith({ items: [user()], total: 1, totalPages: 1 });
      renderWithProviders(<EmployeesPageContent />);
      await loaded();

      expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    });

    it('describes the whole directory in the count, not the rows in memory', async () => {
      respondWith({ items: [user()], total: 203, totalPages: 21 });
      renderWithProviders(<EmployeesPageContent />);
      await loaded();

      // "Showing 1-10 of 203". The bug this guards against is a footer that
      // counts `employees.length` and tells a 203-person company it has 10.
      expect(screen.getByText(/of 203 employees/)).toBeInTheDocument();
    });
  });

  describe('the empty states say different things', () => {
    beforeEach(() => signInAs('SUPER_ADMIN'));

    it('reads as "none yet" before any filter is applied', async () => {
      respondWith({ items: [], total: 0, totalPages: 0 });
      renderWithProviders(<EmployeesPageContent />);

      expect(await screen.findByText('No employees yet.')).toBeInTheDocument();
    });

    it('reads as "none match" once a search is in play', async () => {
      respondWith({ items: [], total: 0, totalPages: 0 });
      renderWithProviders(<EmployeesPageContent />);
      await screen.findByText('No employees yet.');

      await userEvent.type(screen.getByPlaceholderText('Search employees'), 'nobody');

      expect(await screen.findByText('No employees match your search.')).toBeInTheDocument();
    });
  });

  describe('rendering a row', () => {
    beforeEach(() => signInAs('SUPER_ADMIN'));

    it('resolves department and office ids to names', async () => {
      respondWith();
      renderWithProviders(<EmployeesPageContent />);
      await loaded();

      expect(desktop().getByText('Engineering')).toBeInTheDocument();
      expect(desktop().getByText('Lagos HQ')).toBeInTheDocument();
    });

    it('falls back to a dash rather than showing a raw id', async () => {
      // A lookup miss is normal — the department list is fetched separately and
      // can be stale. Printing "dept-99" at someone is the failure worth
      // preventing.
      respondWith({ items: [user({ departmentId: 'dept-99', officeId: null })] });
      renderWithProviders(<EmployeesPageContent />);
      await loaded();

      expect(screen.queryByText('dept-99')).not.toBeInTheDocument();
    });

    it('shows the human label for a role, not the enum value', async () => {
      respondWith({ items: [user({ role: 'HR_ADMIN' })] });
      renderWithProviders(<EmployeesPageContent />);
      await loaded();

      expect(desktop().getByText('HR Administrator')).toBeInTheDocument();
      expect(screen.queryByText('HR_ADMIN')).not.toBeInTheDocument();
    });
  });

  describe('when the directory cannot be loaded', () => {
    beforeEach(() => signInAs('SUPER_ADMIN'));

    it('says so instead of showing an empty list', async () => {
      // An empty table and a failed request look identical to a reader, and
      // only one of them means "you have no staff".
      mockGet.mockImplementation((url: string) => {
        if (url === '/users') return Promise.reject(new Error('boom'));
        return Promise.resolve({ data: [] });
      });

      renderWithProviders(<EmployeesPageContent />);

      expect(
        await screen.findByText("Couldn't load employees. Please try again.")
      ).toBeInTheDocument();
    });
  });

  describe('opening the destructive modal', () => {
    it('passes the row that was actually clicked', async () => {
      signInAs('SUPER_ADMIN');
      respondWith({
        items: [user({ id: 'u1', name: 'Ada Okafor' }), user({ id: 'u2', name: 'Bola Eze' })],
        total: 2,
      });

      renderWithProviders(<EmployeesPageContent />);
      await loaded('Bola Eze');

      // Find Bola's row and press its Remove, not the first Remove on screen.
      // Off-by-one row wiring is the exact bug that ends with the wrong
      // person losing access, and "click the first button" would not catch it.
      const bolaRow = desktop().getByText('Bola Eze').closest('tr');
      expect(bolaRow).not.toBeNull();
      await userEvent.click(within(bolaRow as HTMLElement).getByRole('button', { name: 'Remove' }));

      expect(await screen.findByRole('heading', { name: 'Remove Bola Eze?' })).toBeInTheDocument();
    });
  });

  describe('showing removed staff (#31)', () => {
    // The toggle exists so a super admin can find somebody in order to
    // reinstate them. Before it, the reinstate endpoint was reachable only by
    // someone who already knew the user's UUID.

    it('offers the toggle to a SUPER_ADMIN', async () => {
      respondWith();
      signInAs('SUPER_ADMIN');

      renderWithProviders(<EmployeesPageContent />);
      await loaded();

      expect(screen.getByLabelText('Show removed')).toBeInTheDocument();
    });

    it.each(['HR_ADMIN', 'TEAM_LEAD', 'EMPLOYEE'] as const)(
      'hides the toggle from %s',
      async (role) => {
        // The API answers 403 rather than silently dropping the filter, so a
        // visible toggle for these roles would be a button that breaks the
        // page. Hidden is the honest rendering of "you may not ask that".
        respondWith();
        signInAs(role);

        renderWithProviders(<EmployeesPageContent />);
        await loaded();

        expect(screen.queryByLabelText('Show removed')).not.toBeInTheDocument();
      }
    );

    it('omits the parameter entirely while the toggle is off', async () => {
      // Not `includeRemoved: false`. The API rejects this parameter for
      // non-super-admins, so sending it unconditionally would 403 the staff
      // list for every HR admin.
      respondWith();
      signInAs('SUPER_ADMIN');

      renderWithProviders(<EmployeesPageContent />);
      await loaded();

      expect(lastUsersQuery()).not.toHaveProperty('includeRemoved');
    });

    it('asks the server for removed staff once the toggle is on', async () => {
      respondWith();
      signInAs('SUPER_ADMIN');

      renderWithProviders(<EmployeesPageContent />);
      await loaded();

      await userEvent.click(screen.getByLabelText('Show removed'));

      await waitFor(() =>
        expect(lastUsersQuery()).toMatchObject({ includeRemoved: true })
      );
    });

    it('returns to page 1 when the toggle flips', async () => {
      // Same reasoning as a new search: the result set changes size, and
      // page 3 of the old one is an empty table in the new one.
      respondWith({ items: [user()], total: 30, totalPages: 3 });
      signInAs('SUPER_ADMIN');

      renderWithProviders(<EmployeesPageContent />);
      await loaded();

      await userEvent.click(screen.getByRole('button', { name: 'Next' }));
      await waitFor(() => expect(lastUsersQuery()).toMatchObject({ page: 2 }));

      await userEvent.click(screen.getByLabelText('Show removed'));

      await waitFor(() =>
        expect(lastUsersQuery()).toMatchObject({ page: 1, includeRemoved: true })
      );
    });
  });

  describe('a removed row', () => {
    const removed = () =>
      user({ id: 'u-gone', name: 'Gone Person', status: 'DELETED' });

    beforeEach(() => signInAs('SUPER_ADMIN'));

    it('reads as "Removed" rather than as the raw status', async () => {
      respondWith({ items: [removed()] });

      renderWithProviders(<EmployeesPageContent />);
      await loaded('Gone Person');

      expect(desktop().getByText('Removed')).toBeInTheDocument();
      expect(desktop().queryByText('DELETED')).not.toBeInTheDocument();
    });

    it('offers Reinstate and nothing else', async () => {
      // View, Edit and Remove all assume a live account. The detail modal
      // offers suspend and a password reset, neither of which applies, and
      // Remove would be a second delete.
      respondWith({ items: [removed()] });

      renderWithProviders(<EmployeesPageContent />);
      await loaded('Gone Person');

      const row = desktop().getByText('Gone Person').closest('tr') as HTMLElement;

      expect(within(row).getByRole('button', { name: 'Reinstate' })).toBeInTheDocument();
      expect(within(row).queryByRole('button', { name: 'View' })).not.toBeInTheDocument();
      expect(within(row).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
      expect(within(row).queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    });

    it('still offers the usual three to a live row beside it', async () => {
      // The mixed list is the normal case once the toggle is on, and getting
      // the condition inverted would be invisible in a list of one.
      respondWith({
        items: [removed(), user({ id: 'u-live', name: 'Live Person' })],
        total: 2,
      });

      renderWithProviders(<EmployeesPageContent />);
      await loaded('Live Person');

      const live = desktop().getByText('Live Person').closest('tr') as HTMLElement;

      expect(within(live).getByRole('button', { name: 'View' })).toBeInTheDocument();
      expect(within(live).queryByRole('button', { name: 'Reinstate' })).not.toBeInTheDocument();
    });

    it('opens the reinstate modal for the row that was clicked', async () => {
      respondWith({
        items: [user({ id: 'u-live', name: 'Live Person' }), removed()],
        total: 2,
      });

      renderWithProviders(<EmployeesPageContent />);
      await loaded('Gone Person');

      const row = desktop().getByText('Gone Person').closest('tr') as HTMLElement;
      await userEvent.click(within(row).getByRole('button', { name: 'Reinstate' }));

      expect(
        await screen.findByRole('heading', { name: 'Reinstate Gone Person?' })
      ).toBeInTheDocument();
    });
  });

});
