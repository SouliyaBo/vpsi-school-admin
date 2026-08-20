import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClient from '@/lib/api-client';
import { paginated, renderWithProviders } from '@/test/utils';
import { StudentsPage } from './StudentsPage';

/**
 * The create-student flow, which is the most involved form in the app: it posts
 * the student and their guardian list in one request, and the guardian list
 * carries two rules the API enforces (at least one guardian, exactly one
 * primary).
 *
 * The first test is a regression guard: the guardian editor used to render a
 * group-level `<FormMessage>` outside any `FormField`, which threw on mount and
 * took the whole dialog down with it.
 */

const student = {
  id: '507f1f77bcf86cd799439011',
  studentCode: 'S-0001',
  firstNameLo: 'ສົມຈິດ',
  lastNameLo: 'ວົງສາ',
  gender: 'male',
  dateOfBirth: '2010-05-02T00:00:00.000Z',
  status: 'active',
  guardians: [
    {
      guardianId: '507f1f77bcf86cd799439012',
      fullNameLo: 'ບຸນມີ ວົງສາ',
      phone: '2055512345',
      relationship: 'father',
      isPrimary: true,
      isEmergencyContact: true,
      canViewRecords: true,
    },
  ],
};

/** Flipped by the homeroom-teacher test below; everything else runs as the office. */
let seesEveryStudent = true;

vi.mock('@/features/auth/hooks', () => ({
  useCan: () => () => true,
  useCurrentUser: () => ({ username: 'admin', permissions: [] }),
  useSeesEveryStudent: () => seesEveryStudent,
}));

/** Fills the student's own required fields, leaving the guardian row alone. */
async function fillStudentFields(dialog: HTMLElement) {
  await userEvent.type(within(dialog).getByLabelText(/student code/i), 'S-0002');
  // The student's name inputs come before the guardian row's identically
  // labelled ones, so index rather than label disambiguates them.
  await userEvent.type(within(dialog).getAllByLabelText(/first name \(lao\)/i)[0]!, 'ນາງ');
  await userEvent.type(within(dialog).getAllByLabelText(/last name \(lao\)/i)[0]!, 'ຄຳ');
  fireEvent.change(within(dialog).getByLabelText(/date of birth/i), {
    target: { value: '2011-03-04' },
  });
}

describe('StudentsPage — create', () => {
  beforeEach(() => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(paginated([student]));
    vi.spyOn(apiClient, 'post').mockResolvedValue(student);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the create dialog with one guardian row', async () => {
    renderWithProviders(<StudentsPage />);

    await userEvent.click(await screen.findByRole('button', { name: /add student/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/student code/i)).toBeInTheDocument();
    // The guardian editor is present and starts with a row marked primary.
    expect(within(dialog).getByRole('radio', { name: /primary/i })).toBeChecked();
  });

  it('will not submit while the guardian row has no guardian selected', async () => {
    renderWithProviders(<StudentsPage />);
    await userEvent.click(await screen.findByRole('button', { name: /add student/i }));
    const dialog = await screen.findByRole('dialog');

    await fillStudentFields(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    expect(await within(dialog).findByText(/this field is required/i)).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('reports the group-level rule when every guardian row is removed', async () => {
    renderWithProviders(<StudentsPage />);
    await userEvent.click(await screen.findByRole('button', { name: /add student/i }));
    const dialog = await screen.findByRole('dialog');

    await fillStudentFields(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: /remove/i }));
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      /at least one guardian is required/i,
    );
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('creates the student together with a brand-new guardian', async () => {
    renderWithProviders(<StudentsPage />);
    await userEvent.click(await screen.findByRole('button', { name: /add student/i }));
    const dialog = await screen.findByRole('dialog');

    await fillStudentFields(dialog);

    // Switch the guardian row from "pick existing" to "create new".
    await userEvent.click(within(dialog).getByRole('button', { name: /create new/i }));
    await userEvent.type(within(dialog).getAllByLabelText(/first name \(lao\)/i)[1]!, 'ບຸນມີ');
    await userEvent.type(within(dialog).getAllByLabelText(/last name \(lao\)/i)[1]!, 'ຄຳ');
    // Both the student and the guardian row have a "Phone" field; the guardian's
    // is the later one.
    await userEvent.type(within(dialog).getAllByLabelText(/phone/i).at(-1)!, '2055512345');

    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));
    const [path, body] = vi.mocked(apiClient.post).mock.calls[0]!;
    expect(path).toBe('/students');
    expect(body).toMatchObject({
      studentCode: 'S-0002',
      firstNameLo: 'ນາງ',
      lastNameLo: 'ຄຳ',
      dateOfBirth: '2011-03-04',
      guardians: [
        {
          guardian: { firstNameLo: 'ບຸນມີ', lastNameLo: 'ຄຳ', phone: '2055512345' },
          relationship: 'father',
          isPrimary: true,
        },
      ],
    });
    // A "new guardian" row must not also send an (empty) guardianId.
    expect((body as { guardians: unknown[] }).guardians[0]).not.toHaveProperty('guardianId');
  });

  it('carries both nicknames through to the payload, and no title — it is derived', async () => {
    renderWithProviders(<StudentsPage />);
    await userEvent.click(await screen.findByRole('button', { name: /add student/i }));
    const dialog = await screen.findByRole('dialog');

    await fillStudentFields(dialog);
    await userEvent.type(within(dialog).getByLabelText(/nickname \(lao\)/i), 'ລິຕ້າ');
    await userEvent.type(within(dialog).getByLabelText(/nickname \(english\)/i), 'RITA');

    await userEvent.click(within(dialog).getByRole('button', { name: /create new/i }));
    await userEvent.type(within(dialog).getAllByLabelText(/first name \(lao\)/i)[1]!, 'ບຸນມີ');
    await userEvent.type(within(dialog).getAllByLabelText(/last name \(lao\)/i)[1]!, 'ຄຳ');
    await userEvent.type(within(dialog).getAllByLabelText(/phone/i).at(-1)!, '2055512345');

    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));
    const body = vi.mocked(apiClient.post).mock.calls[0]![1];
    expect(body).toMatchObject({ nickname: 'ລິຕ້າ', nicknameEn: 'RITA' });
    // The honorific is a virtual read off `gender`; posting one would let the
    // two disagree, which is the whole reason it stopped being a field.
    expect(body).not.toHaveProperty('title');
  });

  it('sends only the organisations given a join date, and none derived from gender', async () => {
    renderWithProviders(<StudentsPage />);
    await userEvent.click(await screen.findByRole('button', { name: /add student/i }));
    const dialog = await screen.findByRole('dialog');

    await fillStudentFields(dialog);
    // Youth union joined, women's union left blank — a female student is not a
    // member of it until the school says she is.
    await userEvent.type(within(dialog).getByLabelText(/youth union/i), '2024-09-01');

    await userEvent.click(within(dialog).getByRole('button', { name: /create new/i }));
    await userEvent.type(within(dialog).getAllByLabelText(/first name \(lao\)/i)[1]!, 'ບຸນມີ');
    await userEvent.type(within(dialog).getAllByLabelText(/last name \(lao\)/i)[1]!, 'ຄຳ');
    await userEvent.type(within(dialog).getAllByLabelText(/phone/i).at(-1)!, '2055512345');

    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));
    expect(vi.mocked(apiClient.post).mock.calls[0]![1]).toMatchObject({
      organizations: [{ organization: 'youth', joinedDate: '2024-09-01' }],
    });
  });
});

describe('StudentsPage — list', () => {
  beforeEach(() => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(
      paginated([
        { ...student, nickname: 'ລິຕ້າ', nicknameEn: 'RITA' },
        // Most records will only ever have the Lao one.
        {
          ...student,
          id: '507f1f77bcf86cd799439013',
          studentCode: 'S-0002',
          nickname: 'ເອມີ້',
        },
      ]),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the nickname beside the register name, which is how staff scan a roster', async () => {
    renderWithProviders(<StudentsPage />);

    // Rendered in English, so the English nickname wins where there is one…
    expect(await screen.findByText('(RITA)')).toBeInTheDocument();
    // …and the Lao one shows rather than nothing where there is not.
    expect(screen.getByText('(ເອມີ້)')).toBeInTheDocument();
    // The register name is still the primary text, not replaced by the nickname.
    expect(screen.getAllByText('ສົມຈິດ ວົງສາ')).toHaveLength(2);
  });
});

/**
 * `GET /students` narrows to the children currently attending when no status is
 * given, so the dropdown has to show that default rather than "all", and asking
 * for the whole register has to send `all` by name — a cleared filter would
 * silently mean `active` again.
 */
describe('StudentsPage — the status filter', () => {
  beforeEach(() => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(paginated([student]));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Params of the most recent `/students` list request. */
  function lastListParams() {
    const calls = vi.mocked(apiClient.get).mock.calls.filter(([path]) => path === '/students');
    return (calls.at(-1)?.[1] as { params: Record<string, unknown> }).params;
  }

  /**
   * The toolbar's dropdowns carry no label of their own, so the status one is
   * addressed by what it currently reads — which is the point being tested.
   */
  function statusFilter(reads: string) {
    const box = screen.getAllByRole('combobox').find((el) => el.textContent === reads);
    expect(box, `no filter dropdown reads "${reads}"`).toBeDefined();
    return box!;
  }

  it('reads as the current roll, and sends no status of its own', async () => {
    renderWithProviders(<StudentsPage />);
    await screen.findByText('ສົມຈິດ ວົງສາ');

    // The trigger names what the server actually returns…
    statusFilter('Active');
    // …and the default costs no query param, so it stays out of the URL and off
    // the "clear filters" count.
    expect(lastListParams()).not.toHaveProperty('status');
    expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument();
  });

  it('asks for the whole register by name when every status is picked', async () => {
    renderWithProviders(<StudentsPage />);
    await screen.findByText('ສົມຈິດ ວົງສາ');

    await userEvent.click(statusFilter('Active'));
    await userEvent.click(await screen.findByRole('option', { name: /every status/i }));

    await waitFor(() => expect(lastListParams()).toMatchObject({ status: 'all' }));
  });

  it('still narrows to a single status', async () => {
    renderWithProviders(<StudentsPage />);
    await screen.findByText('ສົມຈິດ ວົງສາ');

    await userEvent.click(statusFilter('Active'));
    await userEvent.click(await screen.findByRole('option', { name: /graduated/i }));

    await waitFor(() => expect(lastListParams()).toMatchObject({ status: 'graduated' }));
  });
});

describe('StudentsPage — editing', () => {
  beforeEach(() => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(paginated([student]));
    vi.spyOn(apiClient, 'patch').mockResolvedValue(student);
  });

  afterEach(() => {
    seesEveryStudent = true;
    vi.restoreAllMocks();
  });

  async function openEditDialog() {
    renderWithProviders(<StudentsPage />);
    await userEvent.click(await screen.findByRole('button', { name: /actions/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /edit/i }));
    return screen.findByRole('dialog');
  }

  it('hides the status field, which is the office\u2019s call', async () => {
    seesEveryStudent = false;

    const dialog = await openEditDialog();
    // Everything else on the record is still editable…
    expect(within(dialog).getByLabelText(/student code/i)).toBeInTheDocument();
    // …but not the status, which drives enrolment and certificates.
    expect(within(dialog).queryByLabelText(/status/i)).not.toBeInTheDocument();
  });

  it('shows it to the office', async () => {
    const dialog = await openEditDialog();
    expect(within(dialog).getByLabelText(/status/i)).toBeInTheDocument();
  });

  /**
   * Regression guard: the edit form used to PATCH every field it held, including
   * `studentCode`. `UpdateStudentDto` has no such property and the API runs with
   * `forbidNonWhitelisted`, so every edit came back 400 — "ຫນ້າທີ່..." — no
   * matter which field the office had actually touched.
   */
  it('patches only the field that changed, never the immutable student code', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({
      ...student,
      status: 'graduated',
    });

    const dialog = await openEditDialog();

    // The code is shown for orientation but cannot be retyped after intake.
    expect(within(dialog).getByLabelText(/student code/i)).toBeDisabled();

    await userEvent.click(within(dialog).getByRole('combobox', { name: /status/i }));
    await userEvent.click(await screen.findByRole('option', { name: /graduated/i }));
    await userEvent.click(within(dialog).getByRole('button', { name: /save/i }));

    await waitFor(() => expect(patch).toHaveBeenCalled());
    const [url, body] = patch.mock.calls[0]!;
    expect(url).toBe(`/students/${student.id}`);
    expect(body).toEqual({ status: 'graduated' });
  });
});
