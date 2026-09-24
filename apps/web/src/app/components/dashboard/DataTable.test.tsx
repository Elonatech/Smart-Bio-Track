/**
 * @jest-environment jsdom
 */
import { DataTable } from './DataTable';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * The table every list in the dashboard renders through.
 *
 * Two things make it worth testing despite looking like presentation.
 *
 * **It has two paging modes, and mixing them is a real bug.** With `pageSize`
 * it slices the rows itself; without it, it renders exactly what it is given
 * and the caller pages on the server. The employees and audit pages both use
 * the second mode — passing `pageSize` there would paginate a page, showing
 * "1 / 1" underneath a list that is one of twenty.
 *
 * **It renders every row twice**, a desktop table and a mobile card list,
 * hidden from each other with CSS. Both are in the DOM, which is a trap for
 * anyone writing queries against it — noted in the other suites too.
 */

interface Row {
  id: string;
  name: string;
  dept: string;
}

const COLUMNS = [
  { key: 'name', header: 'Name', render: (r: Row) => <span>{r.name}</span> },
  {
    key: 'dept',
    header: 'Department',
    render: (r: Row) => <span>{r.dept}</span>,
    hideOnMobile: true,
  },
];

function rows(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `r${i + 1}`,
    name: `Person ${i + 1}`,
    dept: 'Engineering',
  }));
}

function renderTable(props: Partial<React.ComponentProps<typeof DataTable<Row>>> = {}) {
  return render(
    <DataTable<Row>
      columns={COLUMNS}
      rows={rows(3)}
      getRowKey={(r) => r.id}
      emptyMessage="Nothing here"
      {...props}
    />
  );
}

/** The desktop table, since the mobile cards duplicate every value. */
const desktop = () => within(screen.getAllByRole('table')[0]);

describe('rendering rows', () => {
  it('renders every row it is given when no pageSize is set', () => {
    renderTable({ rows: rows(25) });

    expect(desktop().getAllByRole('row')).toHaveLength(26); // 25 + header
  });

  it('renders the column headers', () => {
    renderTable();

    expect(desktop().getByText('Name')).toBeInTheDocument();
    expect(desktop().getByText('Department')).toBeInTheDocument();
  });

  it('uses the caller’s render function for each cell', () => {
    renderTable();

    expect(desktop().getByText('Person 1')).toBeInTheDocument();
    expect(desktop().getAllByText('Engineering')).toHaveLength(3);
  });

  it('shows the empty message instead of an empty table', () => {
    // An empty <table> with headers reads as a broken screen. The caller's
    // wording ("No employees yet" vs "none match your search") carries a
    // distinction the table itself cannot know.
    renderTable({ rows: [], emptyMessage: 'No employees yet' });

    expect(screen.getByText('No employees yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('paging, when the table owns it', () => {
  it('shows only one page of rows', () => {
    renderTable({ rows: rows(25), pageSize: 10 });

    expect(desktop().getAllByRole('row')).toHaveLength(11); // 10 + header
  });

  it('moves to the next page', async () => {
    renderTable({ rows: rows(25), pageSize: 10 });

    await userEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(desktop().getByText('Person 11')).toBeInTheDocument();
    expect(desktop().queryByText('Person 1')).not.toBeInTheDocument();
  });

  it('disables Previous on the first page and Next on the last', async () => {
    renderTable({ rows: rows(15), pageSize: 10 });

    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });

  it('pulls the viewer back when the rows shrink beneath them', async () => {
    // Filtering a 25-row list down to 5 while on page 3 would otherwise leave
    // someone staring at an empty table, which reads as "no results" when
    // there are five.
    const { rerender } = render(
      <DataTable<Row>
        columns={COLUMNS}
        rows={rows(25)}
        getRowKey={(r) => r.id}
        emptyMessage="Nothing here"
        pageSize={10}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(desktop().getByText('Person 11')).toBeInTheDocument();

    rerender(
      <DataTable<Row>
        columns={COLUMNS}
        rows={rows(5)}
        getRowKey={(r) => r.id}
        emptyMessage="Nothing here"
        pageSize={10}
      />
    );

    expect(desktop().getByText('Person 1')).toBeInTheDocument();
  });
});

describe('paging, when the server owns it', () => {
  it('offers no paging controls at all without a pageSize', () => {
    // The employees and audit pages page on the server and render their own
    // footer. If this one appeared too, the screen would carry two sets of
    // controls disagreeing about how many pages exist.
    renderTable({ rows: rows(25) });

    expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /previous/i })).not.toBeInTheDocument();
  });
});

describe('the mobile card list', () => {
  it('omits the columns marked hideOnMobile', () => {
    // Those values are already in the card header; repeating them wastes the
    // narrowest screen's space.
    const { container } = renderTable();

    const cards = container.querySelector('.lg\\:hidden');
    expect(cards).not.toBeNull();
    expect(within(cards as HTMLElement).queryByText('Department')).not.toBeInTheDocument();
  });

  it('uses the caller’s card header when one is given', () => {
    const { container } = renderTable({
      renderCardHeader: (r) => <strong>{`Card: ${r.name}`}</strong>,
    });

    const cards = container.querySelector('.lg\\:hidden') as HTMLElement;
    expect(within(cards).getByText('Card: Person 1')).toBeInTheDocument();
  });

  it('renders the same rows as the table, not a subset', () => {
    // The two layouts drifting apart is the failure nobody sees, because
    // whoever is looking only ever sees one of them.
    const { container } = renderTable({ rows: rows(3) });

    const cards = container.querySelector('.lg\\:hidden') as HTMLElement;
    for (const name of ['Person 1', 'Person 2', 'Person 3']) {
      expect(desktop().getByText(name)).toBeInTheDocument();
      expect(within(cards).getByText(name)).toBeInTheDocument();
    }
  });
});
