/**
 * @jest-environment jsdom
 */
import { EditEmployeeModal, type EditableEmployee } from './EditEmployeeModal';
import { appClient } from '@/lib/api-client';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserRole } from '@smartbiotrack/types';

/**
 * Editing someone, which includes changing their role.
 *
 * **This form cannot currently save.** `PATCH /users/:id` does not exist —
 * verified against the API's own controller, not taken from the comment — so
 * the Save button is disabled behind a flag and the request body below has
 * never been sent. The dropdown logic is live and worth testing regardless,
 * because it is what will be wrong first when the endpoint lands.
 *
 * The role dropdown here is subtler than the one on the invite form. It is
 * the caller's creatable roles **plus whatever this person already is** —
 * because an HR Admin editing another HR Admin would otherwise be shown a
 * list that does not contain HR_ADMIN, and a select whose value is absent
 * from its options silently displays the first one instead. The admin opens
 * the form to change a department and the role field is quietly sitting on
 * "Team Lead", one careless save away from a real demotion.
 */

jest.mock('@/lib/api-client', () => ({
  appClient: { get: jest.fn(), patch: jest.fn() },
  extractErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : 'Something went wrong',
}));

const success = jest.fn();
const error = jest.fn();
jest.mock('@/app/components/Toast', () => ({
  useToast: () => ({ success, error, info: jest.fn() }),
}));

const mockGet = appClient.get as jest.Mock;
const mockPatch = appClient.patch as jest.Mock;

function employee(overrides: Partial<EditableEmployee> = {}): EditableEmployee {
  return {
    id: 'u42',
    employeeId: 'EMP-0042',
    name: 'Bola Eze',
    email: 'bola@example.com',
    role: 'EMPLOYEE',
    departmentId: 'dept-1',
    officeId: 'office-1',
    ...overrides,
  };
}

function renderModal({
  allowedRoles = ['SUPER_ADMIN', 'HR_ADMIN', 'TEAM_LEAD', 'EMPLOYEE'] as UserRole[],
  ...overrides
}: Partial<EditableEmployee> & { allowedRoles?: UserRole[] } = {}) {
  const onClose = jest.fn();
  const onSaved = jest.fn();
  render(
    <EditEmployeeModal
      employee={employee(overrides)}
      allowedRoles={allowedRoles}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
  return { onClose, onSaved };
}

beforeEach(() => {
  mockGet.mockImplementation((url: string) => {
    if (url === '/departments') return Promise.resolve({ data: [{ id: 'dept-1', name: 'Engineering' }] });
    if (url === '/offices') return Promise.resolve({ data: [{ id: 'office-1', name: 'Lagos HQ' }] });
    return Promise.resolve({ data: [] });
  });
  mockPatch.mockResolvedValue({ data: {} });
});

describe('the role dropdown', () => {
  it('always includes the role the person already holds', async () => {
    // HR_ADMIN is not in HR_ADMIN's own creatable list, so without the union
    // this select would have no option matching its value.
    renderModal({ role: 'HR_ADMIN', allowedRoles: ['TEAM_LEAD', 'EMPLOYEE'] });

    const select = (await screen.findByLabelText('Role')) as HTMLSelectElement;

    expect(within(select).getByRole('option', { name: 'HR Administrator' })).toBeInTheDocument();
    // The value matching is the actual protection. A select whose value is
    // absent from its options shows the first option instead, so opening the
    // form to change a department would silently stage a demotion.
    expect(select.value).toBe('HR_ADMIN');
  });

  it('does not duplicate the current role when it is already allowed', async () => {
    renderModal({ role: 'EMPLOYEE', allowedRoles: ['TEAM_LEAD', 'EMPLOYEE'] });

    const select = await screen.findByLabelText('Role');
    const employeeOptions = within(select)
      .getAllByRole('option')
      .filter((o) => o.textContent === 'Employee');

    expect(employeeOptions).toHaveLength(1);
  });

  it('still offers the roles the caller may assign', async () => {
    renderModal({ role: 'HR_ADMIN', allowedRoles: ['TEAM_LEAD', 'EMPLOYEE'] });

    const select = await screen.findByLabelText('Role');
    const options = within(select).getAllByRole('option').map((o) => o.textContent);

    expect(options).toEqual(['HR Administrator', 'Team Lead', 'Employee']);
  });

  it('does not offer a promotion the caller could not make', async () => {
    // The server applies the matrix regardless; this keeps the form from
    // offering something that returns 403 after a save.
    renderModal({ role: 'EMPLOYEE', allowedRoles: ['TEAM_LEAD', 'EMPLOYEE'] });

    const select = await screen.findByLabelText('Role');
    expect(within(select).queryByRole('option', { name: 'Org Super Admin' })).not.toBeInTheDocument();
  });
});

describe('saving is deliberately disabled', () => {
  /**
   * `EDIT_ENDPOINT_READY` is false, and it is **not stale**. Checked against
   * apps/api/src/users/users.controller.ts on 24 Sep 2026, which exposes
   * POST /users, GET /users, PATCH /users/:id/status,
   * POST /users/:id/resend-invitation and DELETE /users/:id.
   * There is no PATCH /users/:id.
   *
   * So this form is complete and cannot save. These tests pin that, rather
   * than asserting a request the component is incapable of making — an
   * earlier draft of this file did exactly that and failed.
   *
   * **When the endpoint lands**, flip the flag and this block fails. That is
   * the intent: the tests below are the reminder that the request body,
   * asserted in the final test here, was written in advance and has never
   * been sent by anything.
   */

  it('disables Save, so nothing is sent', async () => {
    renderModal();
    await screen.findByLabelText('Role');

    const save = screen.getByRole('button', { name: 'Save changes' });

    expect(save).toBeDisabled();
    await userEvent.click(save);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it('says why, instead of leaving a dead button', async () => {
    // A disabled control with no explanation reads as a bug. This one tells
    // the admin the form is finished and the server is not.
    renderModal();
    await screen.findByLabelText('Role');

    expect(
      screen.getByText(/Saving is disabled until the backend exposes an endpoint/i)
    ).toBeInTheDocument();
  });

  it('names the missing endpoint on hover, for whoever has to build it', async () => {
    renderModal();
    await screen.findByLabelText('Role');

    expect(screen.getByRole('button', { name: 'Save changes' })).toHaveAttribute(
      'title',
      expect.stringContaining('PATCH /users/:id')
    );
  });

  it('still lets the form be filled in and abandoned harmlessly', async () => {
    // The fields work; only the save does not. Worth holding, because the
    // moment the endpoint exists this form is expected to work as-is.
    const { onSaved } = renderModal();
    await screen.findByLabelText('Role');

    const name = screen.getByLabelText('Full name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Bolanle Eze');

    expect(name).toHaveValue('Bolanle Eze');
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe('what it shows', () => {
  it('identifies who is being edited', async () => {
    renderModal();

    expect(await screen.findByText(/bola@example\.com/)).toBeInTheDocument();
    expect(screen.getByText(/EMP-0042/)).toBeInTheDocument();
  });

  it('pre-fills the current name rather than starting blank', async () => {
    renderModal();

    expect(await screen.findByLabelText('Full name')).toHaveValue('Bola Eze');
  });

  it('closes without saving on Cancel', async () => {
    const { onClose, onSaved } = renderModal();
    await screen.findByLabelText('Role');

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockPatch).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
