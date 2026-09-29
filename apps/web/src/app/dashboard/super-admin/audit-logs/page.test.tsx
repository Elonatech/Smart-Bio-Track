/**
 * @jest-environment jsdom
 */
import SuperAdminAuditLogsPage from './page';
import { appClient } from '@/lib/api-client';
import { renderWithProviders, signInAs, signOut, screen, waitFor, within } from '@/test/render';
import userEvent from '@testing-library/user-event';

/**
 * The audit trail (#22).
 *
 * This screen is read by someone reconstructing what happened, often in a
 * dispute, so its failure modes are unusually unforgiving:
 *
 *  - A filter that silently drops entries reads as "it never happened".
 *  - "No entries match your filter" and "no entries recorded yet" are
 *    different facts, and confusing them here is a claim about history.
 *  - The banner states a compliance property. It previously claimed
 *    hash-chaining and seven-year retention, neither of which existed. There
 *    is an assertion below that the claim has not crept back.
 */

jest.mock('@/lib/api-client', () => ({
  appClient: { get: jest.fn() },
  extractErrorMessage: () => 'error',
}));

const mockGet = appClient.get as jest.Mock;

const entry = (overrides: Record<string, unknown> = {}) => ({
  id: 'log-1',
  createdAt: '2026-09-21T09:41:00.000Z',
  actorId: 'user-1',
  actorName: 'Ada Okafor',
  actorRole: 'SUPER_ADMIN' as const,
  action: 'USER_DELETED',
  targetType: 'User',
  targetId: 'user-42',
  targetLabel: 'Bola Eze (EMP-0042)',
  ipAddress: '102.89.33.14',
  ...overrides,
});

function respondWith({
  items = [entry()],
  total = items.length,
  totalPages = 1,
}: { items?: ReturnType<typeof entry>[]; total?: number; totalPages?: number } = {}) {
  mockGet.mockResolvedValue({ data: { items, page: 1, limit: 25, total, totalPages } });
}

function lastQuery() {
  const calls = mockGet.mock.calls.filter(([url]) => url === '/audit-logs');
  return calls[calls.length - 1]?.[1]?.params;
}

/** See EmployeesPageContent.test.tsx — DataTable renders desktop and mobile. */
const desktop = () => within(screen.getAllByRole('table')[0]);

/**
 * Resolves once the first fetch has painted.
 *
 * A regex, not a string. The actor cell renders name and role as one text node
 * — "Ada Okafor (Org Super Admin)" — so an exact-match query finds nothing and
 * the test times out looking like a data problem rather than a query problem.
 */
async function loaded(match: RegExp = /Ada Okafor/) {
  await screen.findAllByText(match);
}

beforeEach(() => {
  signOut();
  signInAs('SUPER_ADMIN');
});

afterEach(() => mockGet.mockReset());

describe('SuperAdminAuditLogsPage', () => {
  it('asks for 25 entries a page, denser than the employee list', async () => {
    respondWith();
    renderWithProviders(<SuperAdminAuditLogsPage />);
    await loaded();

    expect(lastQuery()).toEqual({ page: 1, limit: 25 });
  });

  it('shows the actor, their role, the target and the IP address', async () => {
    respondWith();
    renderWithProviders(<SuperAdminAuditLogsPage />);
    await loaded();

    // Every one of these is the answer to a question someone asks of a trail:
    // who, in what capacity, to whom, from where.
    expect(desktop().getByText('Ada Okafor (Org Super Admin)')).toBeInTheDocument();
    expect(desktop().getByText('Bola Eze (EMP-0042)')).toBeInTheDocument();
    expect(desktop().getByText('102.89.33.14')).toBeInTheDocument();
  });

  it('renders a dash where a field is genuinely absent', async () => {
    // A blank cell and a missing value look the same and mean different
    // things. "System" actions have no IP and no target.
    respondWith({ items: [entry({ targetLabel: null, ipAddress: null })] });
    renderWithProviders(<SuperAdminAuditLogsPage />);
    await loaded();

    expect(desktop().getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('omits the role suffix rather than printing an empty bracket', async () => {
    respondWith({ items: [entry({ actorName: 'System', actorRole: null })] });
    renderWithProviders(<SuperAdminAuditLogsPage />);
    await loaded(/System/);

    expect(desktop().getByText('System')).toBeInTheDocument();
    expect(desktop().queryByText(/System \(\)/)).not.toBeInTheDocument();
  });

  describe('action labels', () => {
    it('shows the friendly wording for a known action', async () => {
      respondWith();
      renderWithProviders(<SuperAdminAuditLogsPage />);
      await loaded();

      expect(desktop().getByText('Person removed')).toBeInTheDocument();
    });

    it('falls back to the raw token for an action the server knows and this page does not', async () => {
      // Phase 3 adds CLOCK_IN and friends server-side. Until the label map
      // catches up, the entry must still read as something — a blank Action
      // column on an audit screen is worse than an unfamiliar word.
      respondWith({ items: [entry({ action: 'DEVICE_REVOKED' })] });
      renderWithProviders(<SuperAdminAuditLogsPage />);
      await loaded();

      expect(desktop().getByText('DEVICE_REVOKED')).toBeInTheDocument();
    });
  });

  describe('filtering', () => {
    it('sends the chosen action to the server', async () => {
      respondWith();
      renderWithProviders(<SuperAdminAuditLogsPage />);
      await loaded();

      await userEvent.selectOptions(
        screen.getByLabelText('Filter by action'),
        'USER_SUSPENDED'
      );

      await waitFor(() => expect(lastQuery()).toMatchObject({ action: 'USER_SUSPENDED' }));
    });

    it('drops the parameter again when the filter returns to All actions', async () => {
      // `action: ""` is not the same request as no action at all, and a server
      // that validates the value would 400 on the empty string.
      respondWith();
      renderWithProviders(<SuperAdminAuditLogsPage />);
      await loaded();

      const select = screen.getByLabelText('Filter by action');
      await userEvent.selectOptions(select, 'USER_SUSPENDED');
      await waitFor(() => expect(lastQuery()).toMatchObject({ action: 'USER_SUSPENDED' }));

      await userEvent.selectOptions(select, '');
      await waitFor(() => expect(lastQuery()).not.toHaveProperty('action'));
    });

    it('sends a search term after the debounce', async () => {
      respondWith();
      renderWithProviders(<SuperAdminAuditLogsPage />);
      await loaded();

      await userEvent.type(screen.getByPlaceholderText('Search actor or target'), 'bola');

      await waitFor(() => expect(lastQuery()).toMatchObject({ q: 'bola' }));
    });
  });

  describe('the two empty states are different statements', () => {
    it('says nothing has been recorded when there is no filter', async () => {
      respondWith({ items: [], total: 0, totalPages: 0 });
      renderWithProviders(<SuperAdminAuditLogsPage />);

      expect(await screen.findByText('No audit entries recorded yet.')).toBeInTheDocument();
    });

    it('says nothing matches once a filter is applied', async () => {
      respondWith({ items: [], total: 0, totalPages: 0 });
      renderWithProviders(<SuperAdminAuditLogsPage />);
      await screen.findByText('No audit entries recorded yet.');

      await userEvent.selectOptions(screen.getByLabelText('Filter by action'), 'USER_SUSPENDED');

      expect(await screen.findByText('No audit entries match your filter.')).toBeInTheDocument();
    });

    it('does not claim an empty trail when the request failed', async () => {
      // The worst outcome on this screen: a network error rendering as "no
      // audit entries recorded yet", which is an assertion about history that
      // the page is in no position to make.
      mockGet.mockRejectedValue(new Error('boom'));
      renderWithProviders(<SuperAdminAuditLogsPage />);

      expect(
        await screen.findByText("Couldn't load the audit trail. Please try again.")
      ).toBeInTheDocument();
      expect(screen.queryByText('No audit entries recorded yet.')).not.toBeInTheDocument();
    });
  });

  describe('the append-only banner', () => {
    it('states only what is true', async () => {
      respondWith();
      renderWithProviders(<SuperAdminAuditLogsPage />);
      await loaded();

      expect(
        screen.getByText(/Append-only record · entries cannot be edited or deleted/)
      ).toBeInTheDocument();
    });

    it('makes no retention or hash-chaining claim', async () => {
      // Both were on this screen and neither was implemented. If seven-year
      // retention is ever agreed (it is an open decision as of 23 Sep 2026),
      // this test changes at the same time as the code that honours it — and
      // not before.
      respondWith();
      renderWithProviders(<SuperAdminAuditLogsPage />);
      await loaded();

      expect(screen.queryByText(/hash.chain/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/7 years|seven years/i)).not.toBeInTheDocument();
    });
  });

  it('counts the whole trail, not the page in memory', async () => {
    respondWith({ items: [entry()], total: 412, totalPages: 17 });
    renderWithProviders(<SuperAdminAuditLogsPage />);
    await loaded();

    expect(screen.getByText(/of 412 entries/)).toBeInTheDocument();
  });
});
