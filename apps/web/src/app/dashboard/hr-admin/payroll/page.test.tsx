/**
 * @jest-environment jsdom
 */
import HRAdminPayrollPage from './page';
import { downloadCsv } from '@/lib/csv';
import { renderWithProviders, signInAs, signOut, screen, within } from '@/test/render';
import userEvent from '@testing-library/user-event';

/**
 * The payroll hand-off is hours, not pay.
 *
 * This page used to show "deductions" and "gross pay", which made the
 * product look like it runs payroll. It deliberately does not: turning hours
 * into pay needs each person's rate plus tax and deductions, which belongs to
 * the client's own payroll tool — and salary is data we have no reason to
 * hold. These tests pin that boundary so it does not creep back in.
 */

jest.mock('@/lib/csv', () => ({ downloadCsv: jest.fn() }));
const mockDownload = downloadCsv as jest.Mock;

beforeEach(() => {
  signOut();
  signInAs('HR_ADMIN');
});

describe('HRAdminPayrollPage', () => {
  it('shows hours only — no pay or deductions anywhere on the page', () => {
    renderWithProviders(<HRAdminPayrollPage />);

    expect(screen.queryByText(/gross pay/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/deductions?/i, { selector: 'th, td, span, h6' })).not.toBeInTheDocument();
    expect(screen.queryByText(/₦/)).not.toBeInTheDocument();
  });

  it('does not mention tax or deductions, even in explanatory text', () => {
    renderWithProviders(<HRAdminPayrollPage />);

    expect(screen.queryByText(/\btax\b|deduction/i)).not.toBeInTheDocument();
  });

  it('shows each person’s overtime as one total, without a per-rate breakdown', () => {
    renderWithProviders(<HRAdminPayrollPage />);

    const table = within(screen.getAllByRole('table')[0]);
    // Chinedu: 4h at one rate + 2h at another = 6h. Only the 6h is shown; the
    // split lives in the CSV, where a payroll tool needs it.
    expect(table.getByText('6h')).toBeInTheDocument();
    expect(screen.queryByText(/time-and-a-half|double time|x1\.5/i)).not.toBeInTheDocument();
  });

  describe('the CSV', () => {
    async function exportCsv() {
      renderWithProviders(<HRAdminPayrollPage />);
      await userEvent.click(screen.getByRole('button', { name: /export hours csv/i }));
      const [filename, rows] = mockDownload.mock.calls[0] as [string, (string | number)[][]];
      return { filename, rows, header: rows[0], body: rows.slice(1, -1), total: rows[rows.length - 1] };
    }

    it('has no pay or deduction columns, and one column per overtime rate', async () => {
      const { header } = await exportCsv();

      expect(header).toEqual([
        'Employee ID',
        'Name',
        'Total hours',
        'Regular hours',
        'Overtime hours',
        'Overtime x1.0 (hours)',
        'Overtime x1.5 (hours)',
        'Overtime x2.0 (hours)',
        'Overtime x3.0 (hours)',
      ]);
      expect(header.join(' ')).not.toMatch(/pay|deduction|NGN/i);
    });

    it('keeps regular + overtime equal to total hours on every row', async () => {
      const { body } = await exportCsv();

      for (const row of body) {
        const [, , total, regular, overtime, ...byRate] = row as number[];
        expect(regular + overtime).toBe(total);
        expect(byRate.reduce((sum, hours) => sum + hours, 0)).toBe(overtime);
      }
    });

    it('totals each column so it ties out against a payroll system', async () => {
      const { body, total } = await exportCsv();

      const column = (index: number) => body.reduce((sum, row) => sum + (row[index] as number), 0);
      expect(total[0]).toBe('TOTAL');
      for (const index of [2, 3, 4, 5, 6, 7, 8]) {
        expect(total[index]).toBe(column(index));
      }
    });

    it('is named for the cycle and says it holds hours', async () => {
      const { filename } = await exportCsv();

      expect(filename).toBe('payroll-hours-2026-08.csv');
    });
  });
});
