/**
 * @jest-environment jsdom
 */
import { DeleteDepartmentModal } from './DeleteDepartmentModal';
import { appClient } from '@/lib/api-client';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Deleting a department (#27).
 *
 * Unlike removing a person, this is a **hard** delete of the department row —
 * and its real consequence lands on somebody else: every employee assigned to
 * it becomes unassigned. That matters beyond tidiness, because a TEAM_LEAD's
 * entire data scope keys off `departmentId` (`visibleUsersWhere`), so
 * unassigning people silently changes who can see whom.
 *
 * The modal is handed `employeeCount` precisely so it can say this out loud
 * before the click rather than after. The tests below are mostly about that
 * sentence being right, including its singular and plural forms — an admin
 * deciding whether to proceed is reading exactly that number.
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

const DEPARTMENT = { id: 'dept-1', name: 'Engineering' };

function renderModal(employeeCount = 0) {
  const onClose = jest.fn();
  const onDeleted = jest.fn();
  render(
    <DeleteDepartmentModal
      department={DEPARTMENT}
      employeeCount={employeeCount}
      onClose={onClose}
      onDeleted={onDeleted}
    />
  );
  return { onClose, onDeleted };
}

const confirm = () =>
  userEvent.click(screen.getByRole('button', { name: 'Delete department' }));

beforeEach(() => {
  mockDelete.mockResolvedValue({ data: {} });
});

describe('deleting', () => {
  it('DELETEs the right department and refreshes the list', async () => {
    const { onClose, onDeleted } = renderModal();

    await confirm();

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('/departments/dept-1'));
    expect(onDeleted).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('names the department being deleted', () => {
    renderModal();

    expect(screen.getByText(/Engineering/)).toBeInTheDocument();
  });

  it('sends nothing on Cancel', async () => {
    const { onClose, onDeleted } = renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockDelete).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

describe('telling the admin what it costs', () => {
  it('reports how many people are left unassigned', async () => {
    // The number the decision turns on. Deleting a department with twelve
    // people in it is a different action from deleting an empty one, and the
    // only place that difference appears is this sentence.
    renderModal(12);

    await confirm();

    await waitFor(() => expect(success).toHaveBeenCalled());
    expect(success.mock.calls[0][1]).toContain('12');
    expect(success.mock.calls[0][1]).toMatch(/employees are now unassigned/i);
  });

  it('says "employee is" for exactly one', async () => {
    // Trivial to get wrong, and "1 employees are now unassigned" is the kind
    // of thing a customer screenshots.
    renderModal(1);

    await confirm();

    await waitFor(() => expect(success).toHaveBeenCalled());
    expect(success.mock.calls[0][1]).toMatch(/1 employee is now unassigned/i);
  });

  it('says nobody was affected when the department is empty', async () => {
    // Distinct from the plural branch, not a zero-shaped version of it. "0
    // employees are now unassigned" reads as a fault.
    renderModal(0);

    await confirm();

    await waitFor(() => expect(success).toHaveBeenCalled());
    expect(success.mock.calls[0][1]).toMatch(/no employees were assigned/i);
  });
});

describe('when the server refuses', () => {
  it('keeps the modal open and shows the reason', async () => {
    mockDelete.mockRejectedValueOnce(
      new Error('This department still has employees assigned.')
    );
    const { onClose, onDeleted } = renderModal(3);

    await confirm();

    expect(
      await screen.findByText('This department still has employees assigned.')
    ).toBeInTheDocument();
    expect(error).toHaveBeenCalled();
    // Neither fires on failure: refetching a list that did not change hides
    // the failure, and closing removes the only place the reason is written.
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('re-enables the button so the action can be retried', async () => {
    mockDelete.mockRejectedValueOnce(new Error('Network error'));
    renderModal();

    await confirm();

    await screen.findByText('Network error');
    expect(screen.getByRole('button', { name: 'Delete department' })).toBeEnabled();
  });
});
