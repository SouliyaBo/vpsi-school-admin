import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { del, get, patch, post, put } from '@/lib/api-client';
import { cleanParams } from '@/lib/utils';
import type { PaginatedResponse } from '@/types/common';

/**
 * ຄັງປື້ມ — the school's books in the five shapes the office keeps them:
 * ຄູ່ມືຄູ and ແບບຮຽນ as subject × grade count sheets, ປື້ມອຸປະຖຳ and
 * ເອກະສານອ້າງອີງ as titles that can be lent, and the workbooks the school
 * prints and sells. Every total comes from the API, worked out from the cells.
 */

export type BookCountCategory = 'teacher_guide' | 'textbook';
export type BookTitleCategory = 'donated' | 'reference';
export type BorrowerType = 'teacher' | 'student' | 'other';

export interface LibraryGrade {
  id: string;
  code: string;
  nameLo: string;
}

export interface BookCountSheet {
  category: BookCountCategory;
  schoolYear: { id: string; nameLo: string | null };
  /** `null` until the sheet is first saved. */
  sheetId: string | null;
  grades: LibraryGrade[];
  rows: {
    rowId: string;
    name: string;
    counts: Record<string, number>;
    /** gradeLevelId → copies out on loan. */
    onLoan: Record<string, number>;
  }[];
  totals: { rowTotals: number[]; columnTotals: Record<string, number>; grandTotal: number };
  note: string | null;
  updatedAt: string | null;
}

export interface BookTitle {
  id: string;
  category: BookTitleCategory;
  title: string;
  quantity: number;
  unitPrice: number | null;
  value: number | null;
  source: string | null;
  acquiredOn: string | null;
  academicYear: string | null;
  note: string | null;
  onLoan: number;
  available: number;
}

export interface BookTitleSummary {
  titles: number;
  copies: number;
  value: number;
  onLoan: number;
  sources: { source: string | null; titles: number; copies: number; value: number }[];
}

export interface BookTitleInput {
  category: BookTitleCategory;
  title: string;
  quantity: number;
  unitPrice?: number | null;
  source?: string | null;
  acquiredOn?: string | null;
  academicYear?: string | null;
  note?: string | null;
}

export interface BookLoan {
  id: string;
  /** Set for a title loan; `countSheetId` for a ຄູ່ມືຄູ / ແບບຮຽນ one. */
  bookTitleId: string | null;
  countSheetId: string | null;
  bookTitle: string | null;
  bookCategory: BookTitleCategory | BookCountCategory | null;
  borrowerType: BorrowerType;
  teacherId: string | null;
  studentId: string | null;
  borrowerName: string;
  quantity: number;
  loanedOn: string;
  dueOn: string | null;
  returnedOn: string | null;
  note: string | null;
}

/** Names its book either by `bookTitleId` or by sheet + row + grade — exactly one. */
export interface BookLoanInput {
  bookTitleId?: string;
  countSheetId?: string;
  rowId?: string;
  gradeLevelId?: string;
  borrowerType: BorrowerType;
  teacherId?: string;
  studentId?: string;
  borrowerName?: string;
  quantity: number;
  loanedOn: string;
  dueOn?: string;
  note?: string;
}

export interface WorkbookSaleLine {
  gradeLevelId: string;
  subjects: string | null;
  booksPerSet: number;
  setsProduced: number;
  pricePerSet: number;
}

export interface WorkbookExtraSale {
  date: string | null;
  gradeLevelId: string | null;
  description: string;
  /** Whole sets; 0 for single books. */
  sets: number;
  books: number;
  amount: number;
}

export interface WorkbookSaleSheet {
  schoolYear: { id: string; nameLo: string | null };
  grades: LibraryGrade[];
  lines: WorkbookSaleLine[];
  extraSales: WorkbookExtraSale[];
  totals: {
    lineBooks: number[];
    lineAmounts: number[];
    sets: number;
    books: number;
    amount: number;
    extraSets: number;
    extraBooks: number;
    extraAmount: number;
    grandAmount: number;
  };
  note: string | null;
  updatedAt: string | null;
}

export const libraryApi = {
  counts: (category: BookCountCategory, schoolYearId?: string) =>
    get<BookCountSheet>('/library/counts', { params: cleanParams({ category, schoolYearId }) }),
  saveCounts: (payload: {
    category: BookCountCategory;
    schoolYearId?: string;
    rows: {
      rowId?: string;
      name: string;
      counts: { gradeLevelId: string; quantity: number }[];
    }[];
    note?: string;
  }) => put<BookCountSheet>('/library/counts', payload),

  titles: (params: Record<string, unknown>) =>
    get<PaginatedResponse<BookTitle>>('/library/titles', { params: cleanParams(params) }),
  titleSummary: (category: BookTitleCategory) =>
    get<BookTitleSummary>('/library/titles/summary', { params: { category } }),
  createTitle: (payload: BookTitleInput) => post<BookTitle>('/library/titles', payload),
  updateTitle: (id: string, payload: Partial<BookTitleInput>) =>
    patch<BookTitle>(`/library/titles/${id}`, payload),
  removeTitle: (id: string) => del(`/library/titles/${id}`),

  loans: (params: Record<string, unknown>) =>
    get<PaginatedResponse<BookLoan>>('/library/loans', { params: cleanParams(params) }),
  createLoan: (payload: BookLoanInput) => post<BookLoan>('/library/loans', payload),
  returnLoan: (id: string, returnedOn?: string) =>
    post<BookLoan>(`/library/loans/${id}/return`, returnedOn ? { returnedOn } : {}),

  workbookSales: (schoolYearId?: string) =>
    get<WorkbookSaleSheet>('/library/workbook-sales', { params: cleanParams({ schoolYearId }) }),
  saveWorkbookSales: (payload: {
    schoolYearId?: string;
    lines: {
      gradeLevelId: string;
      subjects?: string;
      booksPerSet: number;
      setsProduced: number;
      pricePerSet: number;
    }[];
    extraSales: {
      date?: string;
      gradeLevelId?: string;
      description: string;
      sets?: number;
      books: number;
      amount: number;
    }[];
    note?: string;
  }) => put<WorkbookSaleSheet>('/library/workbook-sales', payload),
};

/** Every write here moves a total somewhere else on the page, so they all refresh `library`. */
function useLibraryMutation<TInput, TResult>(
  mutationFn: (input: TInput) => Promise<TResult>,
  successMessage = 'toast.updated',
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: { successMessage },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['library'] }),
  });
}

export function useBookCounts(category: BookCountCategory, schoolYearId?: string) {
  return useQuery({
    queryKey: ['library', 'counts', category, schoolYearId ?? null],
    queryFn: () => libraryApi.counts(category, schoolYearId),
  });
}

export const useSaveBookCounts = () => useLibraryMutation(libraryApi.saveCounts);

export function useBookTitles(params: Record<string, unknown>) {
  return useQuery({
    queryKey: ['library', 'titles', params],
    queryFn: () => libraryApi.titles(params),
    placeholderData: keepPreviousData,
  });
}

export function useBookTitleSummary(category: BookTitleCategory) {
  return useQuery({
    queryKey: ['library', 'titles', 'summary', category],
    queryFn: () => libraryApi.titleSummary(category),
  });
}

export const useCreateBookTitle = () => useLibraryMutation(libraryApi.createTitle, 'toast.created');
export const useUpdateBookTitle = () =>
  useLibraryMutation(({ id, ...payload }: Partial<BookTitleInput> & { id: string }) =>
    libraryApi.updateTitle(id, payload),
  );
export const useDeleteBookTitle = () => useLibraryMutation(libraryApi.removeTitle, 'toast.deleted');

export function useBookLoans(params: Record<string, unknown>) {
  return useQuery({
    queryKey: ['library', 'loans', params],
    queryFn: () => libraryApi.loans(params),
    placeholderData: keepPreviousData,
  });
}

export const useCreateBookLoan = () =>
  useLibraryMutation(libraryApi.createLoan, 'library.loan.created');
export const useReturnBookLoan = () =>
  useLibraryMutation(
    ({ id, returnedOn }: { id: string; returnedOn?: string }) =>
      libraryApi.returnLoan(id, returnedOn),
    'library.loan.returned',
  );

export function useWorkbookSales(schoolYearId?: string) {
  return useQuery({
    queryKey: ['library', 'workbook-sales', schoolYearId ?? null],
    queryFn: () => libraryApi.workbookSales(schoolYearId),
  });
}

export const useSaveWorkbookSales = () => useLibraryMutation(libraryApi.saveWorkbookSales);

/** A book the loan picker can offer — see `GET /library/lendables`. */
export interface Lendable {
  key: string;
  label: string;
  category: BookCountCategory | BookTitleCategory;
  available: number;
}

/**
 * Every book that can be lent, for the picker on the loans tab — titles and the
 * active year's ຄູ່ມືຄູ / ແບບຮຽນ by subject and grade, each labelled with its
 * kind and what is left on the shelf, so a book with none left is visible as
 * such rather than missing.
 */
export function useLendableOptions(search: string) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['library', 'lendables', search],
    queryFn: () =>
      get<Lendable[]>('/library/lendables', {
        params: cleanParams({ search: search || undefined }),
      }),
  });
  return {
    isLoading: query.isLoading,
    data: query.data?.map((book) => ({
      value: book.key,
      label:
        book.category === 'donated' || book.category === 'reference'
          ? `${book.label} — ${t(`library.tabs.${book.category}`)} · ${t('library.title.available', { n: book.available })}`
          : `${book.label} — ${t('library.title.available', { n: book.available })}`,
    })),
  };
}

/** The key a sheet cell is lent by — the same shape the API's picker hands out. */
export function cellBookKey(sheetId: string, rowId: string, gradeLevelId: string): string {
  return `c:${sheetId}:${rowId}:${gradeLevelId}`;
}

/** A picker key back into the fields a loan names its book with. */
export function bookKeyToTarget(
  key: string,
): Pick<BookLoanInput, 'bookTitleId' | 'countSheetId' | 'rowId' | 'gradeLevelId'> {
  const [kind, ...parts] = key.split(':');
  if (kind === 't') return { bookTitleId: parts[0] };
  const [countSheetId, rowId, gradeLevelId] = parts;
  return { countSheetId, rowId, gradeLevelId };
}

/**
 * A grade as the office's sheets head their columns — ມ.4, not
 * ມັດທະຍົມສຶກສາປີທີ 4, which is what the register calls it and is far too wide
 * for seven columns of figures. Read off the code (`m4`); a code that is not in
 * that shape falls back to the full name.
 */
export function gradeShort(grade: Pick<LibraryGrade, 'code' | 'nameLo'>): string {
  const match = /^m(\d+)$/i.exec(grade.code);
  return match ? `ມ.${match[1]}` : grade.nameLo;
}

/** ກີບ, grouped the way the office writes it: 12,685,000. */
export function formatKip(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : value.toLocaleString('en-US');
}
