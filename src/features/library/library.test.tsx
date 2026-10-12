import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClient from '@/lib/api-client';
import { renderWithProviders } from '@/test/utils';
import { BookCountEditor } from './components/BookCountEditor';
import { BookLoanList } from './components/BookLoanList';
import { BookTitleList } from './components/BookTitleList';
import { WorkbookSalesEditor } from './components/WorkbookSalesEditor';

/**
 * ຄັງປື້ມ from the screens' side. The arithmetic is unit-tested on the API; what
 * matters here is that the grid totals follow the cells as they are typed, that
 * what is saved is the cells (never a total), and that a loan and a return go to
 * the right place.
 */

let permits: (resource: string, action?: string) => boolean = () => true;

vi.mock('@/features/auth/hooks', () => ({
  useCan: () => (resource: string, action?: string) => permits(resource, action),
  useCurrentUser: () => ({ username: 'admin', permissions: [] }),
  useSeesEveryStudent: () => true,
}));

const grades = [
  { id: 'g1', code: 'm1', nameLo: 'ມ.1' },
  { id: 'g7', code: 'm7', nameLo: 'ມ.7' },
];

const countSheet = {
  category: 'teacher_guide',
  schoolYear: { id: 'sy-1', nameLo: '2026-2027' },
  sheetId: 'sheet-1',
  grades,
  rows: [
    { rowId: 'row-lao', name: 'ວິຊາ ພາສາລາວ', counts: { g1: 4, g7: 4 }, onLoan: { g7: 1 } },
    { rowId: 'row-bio', name: 'ວິຊາ ຊີວະສາດ', counts: { g7: 3 }, onLoan: {} },
  ],
  totals: { rowTotals: [8, 3], columnTotals: { g1: 4, g7: 7 }, grandTotal: 11 },
  note: null,
  updatedAt: null,
};

const page = <T,>(data: T[]) => ({
  data,
  meta: {
    total: data.length,
    page: 1,
    limit: 50,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  },
});

const title = {
  id: '66f000000000000000000b01',
  category: 'donated',
  title: 'ຈຸດຈົບຢູ່ຜາຖີ່',
  quantity: 4,
  unitPrice: 85000,
  value: 340000,
  source: 'Book Festival 2026',
  acquiredOn: null,
  academicYear: null,
  note: null,
  onLoan: 1,
  available: 3,
};

const workbookSheet = {
  schoolYear: { id: 'sy-1', nameLo: '2025-2026' },
  grades: [
    { id: 'g5', code: 'm5', nameLo: 'ມ.5' },
    { id: 'g6', code: 'm6', nameLo: 'ມ.6' },
    { id: 'g7', code: 'm7', nameLo: 'ມ.7' },
  ],
  lines: [
    { gradeLevelId: 'g5', subjects: null, booksPerSet: 5, setsProduced: 24, pricePerSet: 170000 },
    { gradeLevelId: 'g6', subjects: null, booksPerSet: 5, setsProduced: 29, pricePerSet: 200000 },
    { gradeLevelId: 'g7', subjects: null, booksPerSet: 4, setsProduced: 17, pricePerSet: 165000 },
  ],
  extraSales: [],
  totals: {
    lineBooks: [120, 145, 68],
    lineAmounts: [4080000, 5800000, 2805000],
    sets: 70,
    books: 333,
    amount: 12685000,
    extraSets: 0,
    extraBooks: 0,
    extraAmount: 0,
    grandAmount: 12685000,
  },
  note: null,
  updatedAt: null,
};

const loan = {
  id: '66f000000000000000000c01',
  bookTitleId: '66f000000000000000000b01',
  bookTitle: 'ຈຸດຈົບຢູ່ຜາຖີ່',
  bookCategory: 'donated',
  borrowerType: 'other',
  teacherId: null,
  studentId: null,
  borrowerName: 'ສົມເພັດ',
  quantity: 1,
  loanedOn: '2026-10-01',
  dueOn: null,
  returnedOn: null,
  note: null,
};

beforeEach(() => {
  permits = () => true;
  vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    if (url === '/library/counts') return countSheet as never;
    if (url === '/library/titles') return page([title]) as never;
    if (url === '/library/titles/summary') {
      return {
        titles: 1,
        copies: 4,
        value: 340000,
        onLoan: 1,
        sources: [{ source: 'Book Festival 2026', titles: 1, copies: 4, value: 340000 }],
      } as never;
    }
    if (url === '/library/workbook-sales') return workbookSheet as never;
    if (url === '/library/loans') return page([loan]) as never;
    if (url === '/library/lendables') {
      return [
        {
          key: 't:66f000000000000000000b01',
          label: 'ຈຸດຈົບຢູ່ຜາຖີ່',
          category: 'donated',
          available: 3,
        },
        {
          key: 'c:sheet-1:row-bio:g7',
          label: 'ຄູ່ມືຄູ · ວິຊາ ຊີວະສາດ · ມ.7',
          category: 'teacher_guide',
          available: 3,
        },
      ] as never;
    }
    return page([]) as never;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the count sheet', () => {
  it('re-adds the totals as a cell is typed, and saves the cells', async () => {
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue(countSheet as never);
    renderWithProviders(<BookCountEditor category="teacher_guide" />);

    const cell = await screen.findByLabelText('ວິຊາ ຊີວະສາດ ມ.1');
    await userEvent.type(cell, '2');

    // ຊີວະສາດ is now 2 + 3; the grand total follows.
    const footer = screen.getAllByRole('rowgroup').at(-1)!;
    expect(within(footer).getByText('13')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith('/library/counts', {
        category: 'teacher_guide',
        schoolYearId: 'sy-1',
        rows: [
          {
            rowId: 'row-lao',
            name: 'ວິຊາ ພາສາລາວ',
            counts: [
              { gradeLevelId: 'g1', quantity: 4 },
              { gradeLevelId: 'g7', quantity: 4 },
            ],
          },
          {
            rowId: 'row-bio',
            name: 'ວິຊາ ຊີວະສາດ',
            counts: [
              { gradeLevelId: 'g1', quantity: 2 },
              { gradeLevelId: 'g7', quantity: 3 },
            ],
          },
        ],
      }),
    );
  });

  it('shows the copies out under each cell', async () => {
    renderWithProviders(<BookCountEditor category="teacher_guide" />);
    expect(await screen.findByText('1 out')).toBeInTheDocument();
  });

  it('lends a guide by grade from its row, offering only what is left', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue(loan as never);
    renderWithProviders(<BookCountEditor category="teacher_guide" />);

    const lend = await screen.findAllByRole('button', { name: /^lend$/i });
    await userEvent.click(lend[0]);
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('combobox', { name: /grade/i }));
    // ມ.7 holds 4 with 1 out.
    await userEvent.click(await screen.findByRole('option', { name: 'ມ.7 — 3 available' }));
    await userEvent.click(within(dialog).getByRole('combobox', { name: /borrower type/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Other' }));
    await userEvent.type(within(dialog).getByLabelText(/borrower name/i), 'ອຈ ບຸນມີ');
    await userEvent.click(within(dialog).getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/library/loans',
        expect.objectContaining({
          countSheetId: 'sheet-1',
          rowId: 'row-lao',
          gradeLevelId: 'g7',
          borrowerName: 'ອຈ ບຸນມີ',
        }),
      ),
    );
  });

  it('is read-only without `library:update`', async () => {
    permits = (resource, action) => !(resource === 'library' && action === 'update');
    renderWithProviders(<BookCountEditor category="teacher_guide" />);

    expect(await screen.findByText('ວິຊາ ພາສາລາວ')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('ວິຊາ ພາສາລາວ ມ.1')).not.toBeInTheDocument();
  });
});

describe('the title list', () => {
  it('shows the source’s total and how many copies are on the shelf', async () => {
    renderWithProviders(<BookTitleList category="donated" />);

    expect(await screen.findByText('ຈຸດຈົບຢູ່ຜາຖີ່')).toBeInTheDocument();
    expect(screen.getByText('3 available')).toBeInTheDocument();
    expect(screen.getByText('1 on loan')).toBeInTheDocument();
    expect(screen.getAllByText('340,000').length).toBeGreaterThan(0);
  });

  it('lends a copy to someone named by hand', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue(loan as never);
    renderWithProviders(<BookTitleList category="donated" />);

    await userEvent.click(await screen.findByRole('button', { name: 'Lend' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('combobox', { name: /borrower type/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Other' }));
    await userEvent.type(within(dialog).getByLabelText(/borrower name/i), 'ສົມເພັດ');
    await userEvent.click(within(dialog).getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/library/loans',
        expect.objectContaining({
          bookTitleId: '66f000000000000000000b01',
          borrowerType: 'other',
          borrowerName: 'ສົມເພັດ',
          quantity: 1,
        }),
      ),
    );
  });
});

describe('the loans list', () => {
  it('lends from the loans tab, choosing the book in the dialog', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue(loan as never);
    renderWithProviders(<BookLoanList />);

    await userEvent.click(await screen.findByRole('button', { name: /lend a book/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('combobox', { name: /title/i }));
    await userEvent.click(await screen.findByRole('button', { name: /ຈຸດຈົບຢູ່ຜາຖີ່/ }));
    await userEvent.click(within(dialog).getByRole('combobox', { name: /borrower type/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Other' }));
    await userEvent.type(within(dialog).getByLabelText(/borrower name/i), 'ນາງ ແສງດາວ');
    await userEvent.click(within(dialog).getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/library/loans',
        expect.objectContaining({
          bookTitleId: '66f000000000000000000b01',
          borrowerType: 'other',
          borrowerName: 'ນາງ ແສງດາວ',
        }),
      ),
    );
  });

  it('records a return', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ ...loan } as never);
    renderWithProviders(<BookLoanList />);

    await userEvent.click(await screen.findByRole('button', { name: /return/i }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/library/loans/66f000000000000000000c01/return', {}),
    );
  });
});

describe('the workbook sheet', () => {
  it('reproduces the office’s totals from the lines', async () => {
    renderWithProviders(<WorkbookSalesEditor />);

    expect(await screen.findByText('70 sets')).toBeInTheDocument();
    expect(screen.getByText('333')).toBeInTheDocument();
    expect(screen.getAllByText('12,685,000').length).toBeGreaterThan(0);
  });

  it('fills in the books and the money for a sale by the set, and saves the sets', async () => {
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue(workbookSheet as never);
    renderWithProviders(<WorkbookSalesEditor />);

    await userEvent.click(await screen.findByRole('button', { name: /add sale/i }));
    const grade = screen.getAllByRole('combobox', { name: 'Grade' }).at(-1)!;
    await userEvent.click(grade);
    await userEvent.click(await screen.findByRole('option', { name: 'ມ.7' }));
    await userEvent.type(screen.getByLabelText('Sets'), '2');

    // ມ.7 is 4 books a set at 165,000.
    expect(screen.getByLabelText('Books')).toHaveValue(8);
    expect(screen.getByLabelText('Kip')).toHaveValue(330000);
    expect(screen.getByLabelText('Description')).toHaveValue('2 extra sets, ມ.7');

    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith(
        '/library/workbook-sales',
        expect.objectContaining({
          extraSales: [
            {
              gradeLevelId: 'g7',
              description: '2 extra sets, ມ.7',
              sets: 2,
              books: 8,
              amount: 330000,
            },
          ],
        }),
      ),
    );
  });
});
