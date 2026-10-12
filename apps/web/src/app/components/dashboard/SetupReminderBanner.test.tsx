/**
 * @jest-environment jsdom
 */
import { SetupReminderBanner } from './SetupReminderBanner';
import { appClient } from '@/lib/api-client';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * The way back into the setup wizard (#27).
 *
 * Every interesting thing about this component is a case where it must stay
 * **silent**, which is exactly the sort of behaviour that rots unnoticed — a
 * banner appearing when it shouldn't is annoying but visible; the protections
 * against it are invisible until they fail.
 *
 *  - It starts hidden, so a configured organisation never flashes "finish
 *    setting up" on a page load.
 *  - A failed request is not evidence of an empty organisation, so a network
 *    blip must not nag somebody.
 *  - Dismissal uses **sessionStorage, not localStorage** — deliberately. It
 *    means "not now", not "never". A permanent dismissal would recreate the
 *    dead end this banner exists to fix: /onboarding was once reachable from
 *    a single post-verification redirect, so closing the tab mid-setup left
 *    no route back.
 */

jest.mock('@/lib/api-client', () => ({
  appClient: { get: jest.fn() },
  extractErrorMessage: () => 'error',
}));

const mockGet = appClient.get as jest.Mock;

const DISMISS_KEY = 'setup-reminder-dismissed';

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe('when the organisation has no offices', () => {
  beforeEach(() => mockGet.mockResolvedValue({ data: [] }));

  it('offers the way back into the wizard', async () => {
    // "Unfinished" is derived, not stored: attendance is geo-fenced, so an
    // organisation with zero offices cannot have been set up. No new column,
    // no backend change — GET /offices already answers it.
    render(<SetupReminderBanner />);

    expect(await screen.findByRole('link', { name: /setup|finish|continue/i })).toHaveAttribute(
      'href',
      '/onboarding'
    );
  });
});

describe('when the organisation is already set up', () => {
  it('stays silent', async () => {
    mockGet.mockResolvedValue({ data: [{ id: 'office-1', name: 'Lagos HQ' }] });

    render(<SetupReminderBanner />);

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: /setup|finish|continue/i })).not.toBeInTheDocument();
  });

  it('shows nothing before the answer arrives', () => {
    // Starts hidden rather than starting shown and hiding itself. The
    // difference is a flash of "finish setting up" on every page load for an
    // organisation that finished months ago.
    mockGet.mockReturnValue(new Promise(() => {})); // never resolves

    const { container } = render(<SetupReminderBanner />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe('when the request fails', () => {
  it('stays silent rather than assuming the organisation is empty', async () => {
    // A failed request is not evidence of anything. Treating it as "no
    // offices" nags somebody whose network blipped, on a screen they have
    // used for months.
    mockGet.mockRejectedValue(new Error('offline'));

    render(<SetupReminderBanner />);

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: /setup|finish|continue/i })).not.toBeInTheDocument();
  });
});

describe('dismissal', () => {
  beforeEach(() => mockGet.mockResolvedValue({ data: [] }));

  it('hides the banner for the rest of the session', async () => {
    render(<SetupReminderBanner />);
    await screen.findByRole('link', { name: /setup|finish|continue/i });

    await userEvent.click(screen.getByRole('button', { name: 'Hide until your next visit' }));

    expect(
      screen.queryByRole('link', { name: /setup|finish|continue/i })
    ).not.toBeInTheDocument();
  });

  it('records the dismissal in sessionStorage, not localStorage', async () => {
    // The load-bearing choice. localStorage would make "not now" permanent
    // and hand back the dead end: the wizard would again have no way in.
    render(<SetupReminderBanner />);
    await screen.findByRole('link', { name: /setup|finish|continue/i });

    await userEvent.click(screen.getByRole('button', { name: 'Hide until your next visit' }));

    expect(sessionStorage.getItem(DISMISS_KEY)).toBe('true');
    expect(localStorage.getItem(DISMISS_KEY)).toBeNull();
  });

  it('stays hidden on a reload within the same session', async () => {
    sessionStorage.setItem(DISMISS_KEY, 'true');

    render(<SetupReminderBanner />);

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(
      screen.queryByRole('link', { name: /setup|finish|continue/i })
    ).not.toBeInTheDocument();
  });

  it('returns in a new session, because the setup is still unfinished', async () => {
    // sessionStorage is empty here, standing in for a closed tab. The nudge
    // comes back until there is actually an office.
    render(<SetupReminderBanner />);

    expect(
      await screen.findByRole('link', { name: /setup|finish|continue/i })
    ).toBeInTheDocument();
  });
});
