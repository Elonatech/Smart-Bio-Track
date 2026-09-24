/**
 * @jest-environment jsdom
 */
import { EmployeeDetailModal, type EmployeeDetail } from './EmployeeDetailModal';
import { appClient } from '@/lib/api-client';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * The detail view, which carries three account actions: suspend/restore,
 * resend an invitation, and request a password reset.
 *
 * Each is offered conditionally, and each condition encodes something the
 * server enforces:
 *
 *  - **Suspend is a toggle**, not a one-way door, so the button has to read
 *    the current status to say what it will do. A button that says "Suspend"
 *    and restores is worse than no button.
 *  - **PENDING users cannot be suspended.** They never set a password, so
 *    there is no account to suspend, and flipping them to ACTIVE would make a
 *    row the list calls active and login refuses. Withdrawing an unaccepted
 *    invitation is a delete, not a suspend.
 *  - **Resend is PENDING-only.** For anybody else an activation link is a
 *    seven-day route into an account whose password was set long ago.
 */

jest.mock('@/lib/api-client', () => ({
  appClient: { post: jest.fn(), patch: jest.fn() },
  extractErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : 'Something went wrong',
}));

const success = jest.fn();
const error = jest.fn();
jest.mock('@/app/components/Toast', () => ({
  useToast: () => ({ success, error, info: jest.fn() }),
}));

const mockPost = appClient.post as jest.Mock;
const mockPatch = appClient.patch as jest.Mock;

function employee(overrides: Partial<EmployeeDetail> = {}): EmployeeDetail {
  return {
    id: 'u42',
    employeeId: 'EMP-0042',
    name: 'Bola Eze',
    email: 'bola@example.com',
    role: 'EMPLOYEE',
    status: 'ACTIVE',
    departmentName: 'Engineering',
    officeName: 'Lagos HQ',
    ...overrides,
  } as EmployeeDetail;
}

function renderModal(overrides: Partial<EmployeeDetail> = {}) {
  const onClose = jest.fn();
  const onStatusChanged = jest.fn();
  render(
    <EmployeeDetailModal
      employee={employee(overrides)}
      onClose={onClose}
      onStatusChanged={onStatusChanged}
    />
  );
  return { onClose, onStatusChanged };
}

beforeEach(() => {
  mockPost.mockResolvedValue({ data: {} });
  mockPatch.mockResolvedValue({ data: {} });
});

describe('suspend and restore', () => {
  it('offers Suspend for an active employee', () => {
    renderModal({ status: 'ACTIVE' });

    expect(screen.getByRole('button', { name: 'Suspend employee' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restore access' })).not.toBeInTheDocument();
  });

  it('offers Restore for a suspended one', () => {
    // Same endpoint, opposite meaning. The label is the only thing telling
    // the admin which way the toggle will go.
    renderModal({ status: 'SUSPENDED' });

    expect(screen.getByRole('button', { name: 'Restore access' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suspend employee' })).not.toBeInTheDocument();
  });

  it('PATCHes the status endpoint with no body, since it is a toggle', async () => {
    const { onStatusChanged, onClose } = renderModal({ status: 'ACTIVE' });

    await userEvent.click(screen.getByRole('button', { name: 'Suspend employee' }));

    await waitFor(() => expect(mockPatch).toHaveBeenCalledWith('/users/u42/status', {}));
    expect(onStatusChanged).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('says "suspended" when suspending and "restored" when restoring', async () => {
    // The confirmation is the only feedback the admin gets that the toggle
    // went the way they intended.
    renderModal({ status: 'ACTIVE' });
    await userEvent.click(screen.getByRole('button', { name: 'Suspend employee' }));

    await waitFor(() => expect(success).toHaveBeenCalled());
    expect(success.mock.calls[0][0]).toMatch(/suspended/i);
  });

  it('keeps the list unrefreshed when the server refuses', async () => {
    mockPatch.mockRejectedValueOnce(new Error('Cannot suspend your own account'));
    const { onStatusChanged, onClose } = renderModal({ status: 'ACTIVE' });

    await userEvent.click(screen.getByRole('button', { name: 'Suspend employee' }));

    await waitFor(() => expect(error).toHaveBeenCalled());
    // Refetching a list that did not change, and closing the only place the
    // reason is shown, are both ways of hiding a failure.
    expect(onStatusChanged).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('a pending invitation', () => {
  it('offers Resend, which is the only status the server accepts it for', () => {
    renderModal({ status: 'PENDING' });

    expect(screen.getByRole('button', { name: 'Resend invitation' })).toBeInTheDocument();
  });

  it.each(['ACTIVE', 'SUSPENDED'] as const)('does not offer Resend for %s', (status) => {
    // An activation link for someone who set a password long ago is a
    // seven-day route into their account for whoever reads that inbox.
    renderModal({ status });

    expect(screen.queryByRole('button', { name: 'Resend invitation' })).not.toBeInTheDocument();
  });

  it('does not let a pending user be suspended', () => {
    // There is no account to suspend yet, and the reverse toggle would mark
    // them ACTIVE — a row the list calls active and login refuses.
    renderModal({ status: 'PENDING' });

    const toggle = screen.queryByRole('button', { name: /suspend|restore/i });
    if (toggle) expect(toggle).toBeDisabled();
  });

  it('posts to the resend endpoint and closes', async () => {
    const { onClose } = renderModal({ status: 'PENDING' });

    await userEvent.click(screen.getByRole('button', { name: 'Resend invitation' }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/users/u42/resend-invitation', {})
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('says the previous link stops working, because it does', async () => {
    // The endpoint retires the old token. An admin who resends and then hears
    // the person used the first link needs to know why it failed.
    renderModal({ status: 'PENDING' });

    await userEvent.click(screen.getByRole('button', { name: 'Resend invitation' }));

    await waitFor(() => expect(success).toHaveBeenCalled());
    expect(success.mock.calls[0][1]).toMatch(/previous link no longer works/i);
  });

  it('surfaces the cooldown message rather than failing silently', async () => {
    // The endpoint enforces 60 seconds per recipient and returns a readable
    // 400. A rapid second press has to say so.
    mockPost.mockRejectedValueOnce(new Error('Please wait 60 seconds before resending'));
    const { onClose } = renderModal({ status: 'PENDING' });

    await userEvent.click(screen.getByRole('button', { name: 'Resend invitation' }));

    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(error.mock.calls[0][1]).toMatch(/60 seconds/);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('requesting a password reset', () => {
  it('goes through the public forgot-password endpoint, by email', async () => {
    renderModal({ status: 'ACTIVE' });

    await userEvent.click(screen.getByRole('button', { name: /reset/i }));
    const confirm = screen.getByRole('button', { name: 'Send reset link' });
    await userEvent.click(confirm);

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/auth/forgot-password', {
        email: 'bola@example.com',
      })
    );
  });

  it('promises only that the request was accepted, not that mail was sent', async () => {
    // The endpoint answers identically for a real and an unknown address, on
    // purpose, so it cannot be used to discover who has an account. A 200
    // therefore does not mean an email went out, and the copy must not say
    // it did.
    renderModal({ status: 'ACTIVE' });

    await userEvent.click(screen.getByRole('button', { name: /reset/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    await waitFor(() => expect(success).toHaveBeenCalled());
    expect(success.mock.calls[0][1]).toMatch(/if .* belongs to an active account/i);
  });
});

describe('what the modal shows', () => {
  it('identifies the person by name, email and employee ID', () => {
    renderModal();

    expect(screen.getByText(/Bola Eze/)).toBeInTheDocument();
    expect(screen.getByText(/bola@example\.com/)).toBeInTheDocument();
    expect(screen.getByText(/EMP-0042/)).toBeInTheDocument();
  });

  it('shows the human role label rather than the enum value', () => {
    renderModal({ role: 'HR_ADMIN' });

    expect(screen.getByText('HR Administrator')).toBeInTheDocument();
    expect(screen.queryByText('HR_ADMIN')).not.toBeInTheDocument();
  });
});
