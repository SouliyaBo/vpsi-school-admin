import type { ColumnDef } from '@tanstack/react-table';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-error';
import { paginated, renderWithProviders } from '@/test/utils';
import { DataTable, type DataTableColumnMeta } from './DataTable';

interface Row {
  id: string;
  code: string;
  name: string;
}

const columns: ColumnDef<Row, unknown>[] = [
  {
    accessorKey: 'code',
    header: 'Code',
    cell: ({ row }) => row.original.code,
    meta: { sortKey: 'code' } satisfies DataTableColumnMeta,
  },
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => row.original.name,
    // No sortKey — the API does not accept `name` as a sort field.
  },
];

const rows: Row[] = [
  { id: '1', code: 'm4', name: 'Grade 4' },
  { id: '2', code: 'm5', name: 'Grade 5' },
];

describe('DataTable', () => {
  it('renders one row per record', () => {
    renderWithProviders(
      <DataTable columns={columns} result={paginated(rows)} isLoading={false} getRowId={(row) => row.id} />,
    );

    expect(screen.getByText('Grade 4')).toBeInTheDocument();
    expect(screen.getByText('Grade 5')).toBeInTheDocument();
    // Header row plus two body rows.
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('shows skeleton placeholders instead of rows while loading', () => {
    renderWithProviders(
      <DataTable columns={columns} result={undefined} isLoading getRowId={(row) => row.id} />,
    );

    expect(screen.queryByText('Grade 4')).not.toBeInTheDocument();
    // The skeletons keep the table's shape so the layout does not jump.
    expect(screen.getAllByRole('row').length).toBeGreaterThan(1);
  });

  it('shows an empty state when the result set is empty', () => {
    renderWithProviders(
      <DataTable
        columns={columns}
        result={paginated<Row>([])}
        isLoading={false}
        emptyTitle="Nothing here"
        getRowId={(row) => row.id}
      />,
    );

    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders the API error message and retries on demand', async () => {
    const onRetry = vi.fn();
    renderWithProviders(
      <DataTable
        columns={columns}
        result={undefined}
        isLoading={false}
        error={new ApiError({ message: 'boom', status: 409, messageKey: 'common.duplicate' })}
        onRetry={onRetry}
        getRowId={(row) => row.id}
      />,
    );

    // The messageKey is translated by the frontend rather than shown raw.
    expect(screen.getByRole('alert')).toHaveTextContent(/already exists/i);

    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('only makes columns with a sortKey sortable, and reports the API field name', async () => {
    const onSortChange = vi.fn();
    renderWithProviders(
      <DataTable
        columns={columns}
        result={paginated(rows)}
        isLoading={false}
        onSortChange={onSortChange}
        getRowId={(row) => row.id}
      />,
    );

    const headers = screen.getAllByRole('columnheader');
    const [codeHeader, nameHeader] = headers;

    // "Name" has no sortKey, so it must not offer a sort control at all.
    expect(within(nameHeader!).queryByRole('button')).not.toBeInTheDocument();

    await userEvent.click(within(codeHeader!).getByRole('button'));
    expect(onSortChange).toHaveBeenCalledWith('code');
  });

  it('marks the active sort column for assistive technology', () => {
    renderWithProviders(
      <DataTable
        columns={columns}
        result={paginated(rows)}
        isLoading={false}
        sortBy="code"
        sortOrder="asc"
        onSortChange={vi.fn()}
        getRowId={(row) => row.id}
      />,
    );

    expect(screen.getAllByRole('columnheader')[0]).toHaveAttribute('aria-sort', 'ascending');
  });

  it('pages through results server-side', async () => {
    const onPageChange = vi.fn();
    renderWithProviders(
      <DataTable
        columns={columns}
        result={paginated(rows, { page: 1, limit: 2, total: 45 })}
        isLoading={false}
        onPageChange={onPageChange}
        getRowId={(row) => row.id}
      />,
    );

    expect(screen.getByText(/showing 1–2 of 45/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('disables paging controls at the edges of the result set', () => {
    renderWithProviders(
      <DataTable
        columns={columns}
        result={paginated(rows, { page: 1, limit: 2, total: 2 })}
        isLoading={false}
        onPageChange={vi.fn()}
        getRowId={(row) => row.id}
      />,
    );

    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });

  it('calls onRowClick with the record behind the row', async () => {
    const onRowClick = vi.fn();
    renderWithProviders(
      <DataTable
        columns={columns}
        result={paginated(rows)}
        isLoading={false}
        onRowClick={onRowClick}
        getRowId={(row) => row.id}
      />,
    );

    await userEvent.click(screen.getByText('Grade 5'));
    expect(onRowClick).toHaveBeenCalledWith(rows[1]);
  });
});
