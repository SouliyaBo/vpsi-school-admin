import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import * as apiClient from '@/lib/api-client';
import { renderWithProviders } from '@/test/utils';
import type { Student } from '@/types/entities';
import { StudyCertificateDialog } from './components/StudyCertificateDialog';

/**
 * Covers the dialog as the office actually meets it: opened on a pupil whose
 * register entry is incomplete, which is the normal case rather than the edge
 * one — the school holds a birthplace for one pupil on its whole roll.
 *
 * It exists because the first version of this dialog threw on open (a date
 * formatter called with a locale where it wanted a pattern) and no test rendered
 * it. Anything here that merely renders is guarding that.
 */

const student = {
  id: '507f1f77bcf86cd799439011',
  studentCode: '0707',
  firstNameLo: 'ສັນຍາຮັກ',
  lastNameLo: 'ວົງສາ',
  gender: 'male',
  dateOfBirth: '2010-04-08T00:00:00.000Z',
  status: 'active',
  guardians: [],
} as unknown as Student;

/** What the register could answer, and — in `missing` — what it could not. */
const prefill = {
  studentId: student.id,
  studentCode: '0707',
  titleLo: 'ທ້າວ',
  fullNameLo: 'ສັນຍາຮັກ ວົງສາ',
  dateOfBirth: '2010-04-08T00:00:00.000Z',
  birthPlaceLo: null,
  fatherNameLo: 'ທ້າວ ສະຫງ່ວນ ປອງປັນຍາ',
  motherNameLo: 'ນາງ ສົມໄທຍ ວົງສາ',
  currentAddressLo: 'ບ້ານ ດອນແດງ ເມືອງ ຈັນທະບູລີ ແຂວງ ນະຄອນຫຼວງວຽງຈັນ',
  studyFromYearCode: '2026-2027',
  studyToYearCode: '2026-2027',
  classLabelLo: 'ມ.5',
  missing: ['birthPlaceLo'],
};

beforeEach(() => {
  vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    if (url.includes('/study-verification/prefill/')) return prefill as never;
    throw new Error(`unexpected GET ${url}`);
  });
});

it('opens on a pupil whose birthplace is not on file and says so', async () => {
  renderWithProviders(<StudyCertificateDialog student={student} onClose={vi.fn()} />);

  const dialog = await screen.findByRole('dialog');

  // Which pupil, and the date of birth the letter will state. The draft arrives
  // after the dialog opens — until it does the subtitle is just the pupil's code
  // — so this waits rather than asserting on the first paint. The bug this test
  // was written for crashed while rendering exactly this line.
  await waitFor(() => expect(dialog).toHaveTextContent('ທ້າວ ສັນຍາຮັກ ວົງສາ'));
  expect(dialog).toHaveTextContent('0707');
  expect(dialog).toHaveTextContent('08/04/2010');

  // The register's answers are filled in, ready to be corrected.
  expect(screen.getByLabelText(/current address/i)).toHaveValue(prefill.currentAddressLo);
  expect(screen.getByLabelText(/^father$/i)).toHaveValue(prefill.fatherNameLo);

  // And the gap is called out rather than left looking optional.
  expect(dialog).toHaveTextContent(/not on file/i);
  expect(screen.getByLabelText(/place of birth/i)).toHaveValue('');
});

it('previews without issuing, so the wording can be checked for free', async () => {
  const post = vi
    .spyOn(apiClient, 'post')
    .mockResolvedValue(new Blob(['%PDF-'], { type: 'application/pdf' }) as never);
  // jsdom implements neither, and the download helper uses both.
  vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });

  renderWithProviders(<StudyCertificateDialog student={student} onClose={vi.fn()} />);
  const dialog = await screen.findByRole('dialog');

  await userEvent.click(within(dialog).getByRole('button', { name: /preview draft/i }));

  await waitFor(() => expect(post).toHaveBeenCalled());
  const [url, body] = post.mock.calls[0];
  expect(url).toBe('/certificates/study-verification/preview');
  // The pupil, plus whatever the office left in the form — a blank birthplace
  // included, since blank is a valid answer that prints as a dotted run.
  expect(body).toMatchObject({ studentId: student.id, currentAddressLo: prefill.currentAddressLo });
});

it('carries a corrected study period through to the issue call', async () => {
  // The realistic correction: enrollments only go back to the year the system
  // started, so the office widens the span by hand.
  const onClose = vi.fn();
  const axiosPost = vi.spyOn(apiClient.apiClient, 'post').mockResolvedValue({
    data: new Blob(['%PDF-'], { type: 'application/pdf' }),
    headers: { 'x-certificate-number': encodeURIComponent('99/ວຈພທນ(ຄນຮ)') },
  } as never);
  vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });

  renderWithProviders(<StudyCertificateDialog student={student} onClose={onClose} />);
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(screen.getByLabelText(/from school year/i)).toHaveValue('2026-2027'));

  const fromYear = screen.getByLabelText(/from school year/i);
  await userEvent.clear(fromYear);
  await userEvent.type(fromYear, '2022-2023');
  await userEvent.type(screen.getByLabelText(/place of birth/i), 'ບ້ານ ດອນແດງ');

  await userEvent.click(within(dialog).getByRole('button', { name: /issue certificate/i }));

  await waitFor(() => expect(axiosPost).toHaveBeenCalled());
  expect(axiosPost.mock.calls[0][1]).toMatchObject({
    studentId: student.id,
    studyFromYearCode: '2022-2023',
    birthPlaceLo: 'ບ້ານ ດອນແດງ',
  });

  // The allocated number is unrepeatable and goes into the office's own book,
  // so it is shown rather than buried in a filename.
  expect(await screen.findByText(/99\/ວຈພທນ\(ຄນຮ\)/)).toBeInTheDocument();
  await waitFor(() => expect(onClose).toHaveBeenCalled());
});
