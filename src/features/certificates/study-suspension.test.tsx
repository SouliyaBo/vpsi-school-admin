import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import * as apiClient from '@/lib/api-client';
import { renderWithProviders } from '@/test/utils';
import type { Student } from '@/types/entities';
import { StudySuspensionDialog } from './components/StudySuspensionDialog';

/**
 * Covers the memo dialog the way the office meets it: opened on a pupil whose
 * guardian has no phone on file, corrected, previewed and issued.
 */

const student = {
  id: '507f1f77bcf86cd799439011',
  studentCode: '0707',
  firstNameLo: 'ສັນຍາຮັກ',
  lastNameLo: 'ວົງສາ',
  gender: 'male',
  status: 'active',
  guardians: [],
} as unknown as Student;

const prefill = {
  studentId: student.id,
  studentCode: '0707',
  titleLo: 'ທ້າວ',
  fullNameLo: 'ສັນຍາຮັກ ວົງສາ',
  guardianNameLo: 'ທ້າວ ສະຫງ່ວນ ປອງປັນຍາ',
  guardianPhone: null,
  villageLo: 'ດອນແດງ',
  districtLo: 'ຈັນທະບູລີ',
  provinceLo: 'ນະຄອນຫຼວງວຽງຈັນ',
  classLabelLo: 'ມ.1/ກ',
  schoolYearCode: '2026-2027',
  suspendedFrom: null,
  missing: ['guardianPhone'],
};

beforeEach(() => {
  vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    if (url.includes('/study-suspension/prefill/')) return prefill as never;
    throw new Error(`unexpected GET ${url}`);
  });
});

it('opens with the register filled in and the missing phone called out', async () => {
  renderWithProviders(<StudySuspensionDialog student={student} onClose={vi.fn()} />);

  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(dialog).toHaveTextContent('ທ້າວ ສັນຍາຮັກ ວົງສາ'));
  expect(dialog).toHaveTextContent('0707');

  expect(screen.getByLabelText(/^name$/i)).toHaveValue(prefill.guardianNameLo);
  expect(screen.getByLabelText(/^village$/i)).toHaveValue('ດອນແດງ');
  expect(screen.getByLabelText(/^class$/i)).toHaveValue('ມ.1/ກ');
  expect(screen.getByLabelText(/^phone$/i)).toHaveValue('');
  expect(dialog).toHaveTextContent(/not on file/i);

  // Reason and documents start empty: left so, the memo prints ruled lines.
  expect(dialog).toHaveTextContent(/prints ruled lines/i);
  expect(screen.getByRole('checkbox', { name: 'ປຶ້ມຕິດຕາມມັດທະຍົມ' })).not.toBeChecked();
});

it('turns the chosen reason and ticked documents into the printed lines', async () => {
  const post = vi
    .spyOn(apiClient, 'post')
    .mockResolvedValue(new Blob(['%PDF-'], { type: 'application/pdf' }) as never);
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:x'),
    revokeObjectURL: vi.fn(),
  });

  renderWithProviders(<StudySuspensionDialog student={student} onClose={vi.fn()} />);
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(screen.getByLabelText(/^village$/i)).toHaveValue('ດອນແດງ'));

  // A reason from the office's list.
  await userEvent.click(screen.getByRole('combobox', { name: /reason for suspending/i }));
  await userEvent.click(await screen.findByRole('option', { name: /home school/i }));

  // Two listed documents, the report card with its grade, and one typed in.
  await userEvent.click(screen.getByRole('checkbox', { name: 'ປຶ້ມຕິດຕາມມັດທະຍົມ' }));
  await userEvent.click(screen.getByRole('checkbox', { name: 'ໃບປະກາດ ມ.4' }));
  await userEvent.click(screen.getByRole('checkbox', { name: /report card/i }));
  await userEvent.click(await screen.findByRole('combobox', { name: /^grade$/i }));
  await userEvent.click(await screen.findByRole('option', { name: 'ມ.3' }));
  await userEvent.type(screen.getByLabelText(/^other$/i), 'ໃບຢັ້ງຢືນການສຶກສາ ສະບັບເດີມ');

  await userEvent.click(within(dialog).getByRole('button', { name: /preview draft/i }));

  await waitFor(() => expect(post).toHaveBeenCalled());
  expect(post.mock.calls[0][1]).toMatchObject({
    reasonLo: 'ເພື່ອຮຽນ home school ຢູ່ບ້ານ',
    documentsLo: [
      'ປຶ້ມຕິດຕາມມັດທະຍົມ',
      'ໃບປະກາດ ມ.4',
      'ໃບຄະແນນ report card ຊັ້ນ ມ.3',
      'ໃບຢັ້ງຢືນການສຶກສາ ສະບັບເດີມ',
    ],
  });
  // The form's own choice fields never leave the browser.
  expect(post.mock.calls[0][1]).not.toHaveProperty('reportCard');
});

it('asks which country when the pupil is going abroad, and prints it in brackets', async () => {
  const post = vi
    .spyOn(apiClient, 'post')
    .mockResolvedValue(new Blob(['%PDF-'], { type: 'application/pdf' }) as never);
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:x'),
    revokeObjectURL: vi.fn(),
  });

  renderWithProviders(<StudySuspensionDialog student={student} onClose={vi.fn()} />);
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(screen.getByLabelText(/^village$/i)).toHaveValue('ດອນແດງ'));

  await userEvent.click(screen.getByRole('combobox', { name: /reason for suspending/i }));
  await userEvent.click(await screen.findByRole('option', { name: 'ໄປຮຽນຕໍ່ຕ່າງປະເທດ' }));

  // Without a country the memo is not sent — the old wording listed all five,
  // which is exactly what the office did not want printed.
  await userEvent.click(within(dialog).getByRole('button', { name: /preview draft/i }));
  expect(await screen.findByText(/required/i)).toBeInTheDocument();
  expect(post).not.toHaveBeenCalled();

  await userEvent.click(screen.getByRole('combobox', { name: /^country$/i }));
  await userEvent.click(await screen.findByRole('option', { name: 'ຍີ່ປຸ່ນ' }));
  await userEvent.click(within(dialog).getByRole('button', { name: /preview draft/i }));

  await waitFor(() => expect(post).toHaveBeenCalled());
  expect(post.mock.calls[0][1]).toMatchObject({ reasonLo: 'ໄປຮຽນຕໍ່ຕ່າງປະເທດ (ຍີ່ປຸ່ນ)' });
});

it('insists on the text behind "Other" before it will send anything', async () => {
  const post = vi.spyOn(apiClient, 'post');

  renderWithProviders(<StudySuspensionDialog student={student} onClose={vi.fn()} />);
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(screen.getByLabelText(/^village$/i)).toHaveValue('ດອນແດງ'));

  await userEvent.click(screen.getByRole('combobox', { name: /reason for suspending/i }));
  await userEvent.click(await screen.findByRole('option', { name: /^other$/i }));
  await userEvent.click(within(dialog).getByRole('button', { name: /preview draft/i }));

  expect(await screen.findByText(/required/i)).toBeInTheDocument();
  expect(post).not.toHaveBeenCalled();
});

it('previews without issuing', async () => {
  const post = vi
    .spyOn(apiClient, 'post')
    .mockResolvedValue(new Blob(['%PDF-'], { type: 'application/pdf' }) as never);
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:x'),
    revokeObjectURL: vi.fn(),
  });

  renderWithProviders(<StudySuspensionDialog student={student} onClose={vi.fn()} />);
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(screen.getByLabelText(/^village$/i)).toHaveValue('ດອນແດງ'));

  await userEvent.click(within(dialog).getByRole('button', { name: /preview draft/i }));

  await waitFor(() => expect(post).toHaveBeenCalled());
  const [url, body] = post.mock.calls[0];
  expect(url).toBe('/certificates/study-suspension/preview');
  expect(body).toMatchObject({ studentId: student.id, villageLo: 'ດອນແດງ' });
  // A date left blank is omitted, not sent as '' — the API rejects '' as a date,
  // and the blob response meant the rejection surfaced as a button that did nothing.
  expect(body).not.toHaveProperty('suspendedFrom');
});

it('carries the typed phone and the chosen date through to the issue call', async () => {
  const onClose = vi.fn();
  const axiosPost = vi.spyOn(apiClient.apiClient, 'post').mockResolvedValue({
    data: new Blob(['%PDF-'], { type: 'application/pdf' }),
    headers: { 'x-certificate-number': encodeURIComponent('100/ວຈພທນ(ຄນຮ)') },
  } as never);
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:x'),
    revokeObjectURL: vi.fn(),
  });

  renderWithProviders(<StudySuspensionDialog student={student} onClose={onClose} />);
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(screen.getByLabelText(/^village$/i)).toHaveValue('ດອນແດງ'));

  await userEvent.type(screen.getByLabelText(/^phone$/i), '020 55512345');
  await userEvent.type(screen.getByLabelText(/off the roll from/i), '2026-10-01');

  await userEvent.click(within(dialog).getByRole('button', { name: /issue memo/i }));

  await waitFor(() => expect(axiosPost).toHaveBeenCalled());
  expect(axiosPost.mock.calls[0][0]).toBe('/certificates/study-suspension');
  expect(axiosPost.mock.calls[0][1]).toMatchObject({
    studentId: student.id,
    guardianPhone: '020 55512345',
    suspendedFrom: '2026-10-01',
  });

  expect(await screen.findByText(/100\/ວຈພທນ\(ຄນຮ\)/)).toBeInTheDocument();
  await waitFor(() => expect(onClose).toHaveBeenCalled());
});
