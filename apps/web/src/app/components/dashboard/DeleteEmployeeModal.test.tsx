/**
 * @jest-environment jsdom
 */
import { DeleteEmployeeModal } from './DeleteEmployeeModal';
import { appClient } from '@/lib/api-client';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * The most destructive button in the product.
 *
 * Two classes of bug matter here and neither shows up in a typecheck:
 *
 *  - The request going to the wrong URL, or firing when the person pressed
 *    Cancel. A removal is a soft delete, so it is recoverable in the database
 *    and *not* recoverable from the UI (#23) — there is currently no undo.
 *  - The copy drifting from the behaviour. This modal previously said
 *    "permanently deletes" and "cannot be undone" while the endpoint had
 *    already become a soft delete. That is a lie told to the person pressing
 *    the button, and no test would have caught it, so there are assertions on
 *    the wording below.
 */

jest.mock('@/lib/api-client', () => ({
  appClient: { delete: jest.fn() },
  extractErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : 'Something went wrong',
}));

const success = jest.fn();
const error = jest.fn();
jest.mock('@/app/components/Toast', () => ({
  useToast: () => ({ success, error, info: jest.fn() }),
}));

const mockDelete = appClient.delete as jest.Mock;

const employee = {
  id: 'user-42',
  employeeId: 'EMP-0042',
  name: 'Ada Okafor',
  email: 'ada@example.com',
  role: 'EMPLOYEE' as const,
  status: 'ACTIVE' as const,
  departmentId: null,
  officeId: null,
};

function renderModal(overrides: Partial<Parameters<typeof DeleteEmployeeModal>[0]> = {}) {
  const onClose = jest.fn();
  const onDeleted = jest.fn();
  render(
    <DeleteEmployeeModal
      employee={employee}
      onClose={onClose}
      onDeleted={onDeleted}
      {...overrides}
    />
  );
  return { onClose, onDeleted };
}

beforeEach(() => {
  mockDelete.mockResolvedValue({ data: {} });
});

describe('DeleteEmployeeModal', () => {
  it('names the person being removed, so the wrong row is visibly the wrong row', () => {
    renderModal();

    expect(screen.getByRole('heading', { name: 'Remove Ada Okafor?' })).toBeInTheDocument();
    // Email and employee ID are both shown for the same reason: two people
    // called Ada Okafor is an ordinary situation in a staff directory.
    expect(screen.getByText(/ada@example\.com/)).toBeInTheDocument();
    expect(screen.getByText(/EMP-0042/)).toBeInTheDocument();
  });

  it('DELETEs the right user and reports success', async () => {
    const { onClose, onDeleted } = renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('/users/user-42'));
    expect(mockDelete).toHaveBeenCalledTimes(1);

    // The list has to refetch, and the modal has to close. Dropping either
    // leaves a removed person visible on screen, which reads as a failure.
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    expect(success).toHaveBeenCalled();
  });

  it('sends nothing at all when the person cancels', async () => {
    const { onClose, onDeleted } = renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockDelete).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('sends nothing when the modal is dismissed with the close control', async () => {
    const { onClose, onDeleted } = renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(mockDelete).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the modal open and shows why, when the server refuses', async () => {
    mockDelete.mockRejectedValueOnce(new Error('You cannot remove your own account'));

    const { onClose, onDeleted } = renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(await screen.findByText('You cannot remove your own account')).toBeInTheDocument();
    expect(error).toHaveBeenCalled();

    // Neither of these fires on a failure. Calling onDeleted would refetch a
    // list that did not change; calling onClose would dismiss the only place
    // the reason is written.
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('re-enables the button after a failure, so the action can be retried', async () => {
    mockDelete.mockRejectedValueOnce(new Error('Network error'));

    renderModal();

    const remove = screen.getByRole('button', { name: 'Remove' });
    await userEvent.click(remove);

    await screen.findByText('Network error');
    // The `finally` block is what does this. Without it a transient failure
    // leaves a permanently dead button and the only way forward is a refresh.
    expect(screen.getByRole('button', { name: 'Remove' })).toBeEnabled();
  });

  describe('the copy matches what the endpoint actually does', () => {
    // These read as testing prose, and they are. The prose is a compliance
    // statement shown at the moment of an irreversible-feeling action, and it
    // has already been wrong once.
    it('promises that history is kept, because the delete is soft', () => {
      renderModal();
      expect(screen.getByText(/attendance and payroll history is kept/i)).toBeInTheDocument();
    });

    it('does not claim the record is permanently deleted', () => {
      renderModal();
      expect(screen.queryByText(/permanently delete/i)).not.toBeInTheDocument();
    });

    it('warns that the email address cannot be reused, which is the real consequence', () => {
      // This is #23 surfacing in the UI: the row is kept, so it keeps the
      // address. When reinstatement is built, this sentence changes with it.
      renderModal();
      expect(screen.getByText(/email address cannot be\s+reused/i)).toBeInTheDocument();
    });

    it('points at suspension as the reversible alternative', () => {
      renderModal();
      expect(screen.getByText(/suspend them from the detail view/i)).toBeInTheDocument();
    });
  });
});
