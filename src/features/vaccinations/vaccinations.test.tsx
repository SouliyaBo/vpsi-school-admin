import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClient from '@/lib/api-client';
import { paginated, renderWithProviders } from '@/test/utils';
import type { VaccinationCampaign } from '@/types/entities';
import { DoseSheet } from './components/DoseSheet';
import { VaccinationsPage } from './pages/VaccinationsPage';

/**
 * The dose sheet, which is where the rules that matter are enforced.
 *
 * Three of them, all about the same thing — the school must not state that it
 * gave a dose it cannot stand behind:
 *   · an untouched row is not an outcome, so an untouched sheet saves nothing;
 *   · a dose marked given needs a date and a guardian's consent;
 *   · a refusal or an absence is recorded as an outcome, without consent, because
 *     "no record" must not mean both "not vaccinated" and "never asked".
 */

const campaign: VaccinationCampaign = {
  id: 'cam-1',
  nameLo: 'ວັກຊີນ HPV ເຂັມທີ 1',
  vaccine: 'hpv',
  doseNumber: 1,
  scheduledDate: '2026-11-03T00:00:00.000Z',
  schoolYearId: 'sy-1',
  eligibility: { gender: 'female', gradeLevelIds: [] },
  studentIds: ['stu-1', 'stu-2'],
  provider: 'ສູນສາທາລະນະສຸກເມືອງ',
  status: 'active',
  notes: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const student = (id: string, code: string, firstNameLo: string) => ({
  id,
  studentCode: code,
  firstNameLo,
  lastNameLo: 'ວົງສາ',
  gender: 'female' as const,
  dateOfBirth: '2014-06-15T00:00:00.000Z',
  guardians: [{ guardianId: 'gua-1', fullNameLo: 'ນາງ ດາລາ', phone: '2055512345', relationship: 'mother', isPrimary: true }],
  status: 'active' as const,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
});

const classroom = {
  id: 'cls-1',
  name: 'ກ',
  capacity: 45,
  currentCount: 3,
  gradeLevelId: { id: 'g3', code: 'm3', nameLo: 'ມ.3' },
  schoolYearId: 'sy-1',
  isActive: true,
};

/**
 * The picker's view of that class: two girls the round covers, and a boy it does
 * not. The boy is returned rather than omitted, so a short list reads as "the
 * round does not cover him" instead of a missing enrolment.
 */
const CANDIDATES = [
  { student: student('stu-1', '0801', 'ຈຸທາລັດ'), eligible: true, selected: true, record: null },
  { student: student('stu-2', '0802', 'ພອນສະຫວັນ'), eligible: true, selected: false, record: null },
  {
    student: { ...student('stu-3', '0803', 'ສົມພອນ'), gender: 'male' as const },
    eligible: false,
    selected: false,
    record: null,
  },
];

const ROLL = [
  { student: student('stu-1', '0801', 'ຈຸທາລັດ'), record: null, classroom: { id: 'cls-1', name: 'ກ' } },
  { student: student('stu-2', '0802', 'ພອນສະຫວັນ'), record: null, classroom: { id: 'cls-1', name: 'ກ' } },
];

vi.mock('@/features/auth/hooks', () => ({
  useCan: () => () => true,
  useCurrentUser: () => ({ username: 'nurse', permissions: [] }),
  useSeesEveryStudent: () => true,
}));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    if (url === `/vaccinations/campaigns/${campaign.id}/roll`) return ROLL as never;
    if (url === '/vaccinations/campaigns') return paginated([campaign]) as never;
    if (url === `/vaccinations/campaigns/${campaign.id}/candidates`) return CANDIDATES as never;
    if (url === '/classrooms') return paginated([classroom]) as never;
    if (url === `/classrooms/${classroom.id}`) return classroom as never;
    if (url === '/school-years/active') return { id: 'sy-1', code: '2026-2027', nameLo: 'ປີ 2026-2027', isActive: true } as never;
    if (url === '/school-years') return paginated([{ id: 'sy-1', code: '2026-2027', nameLo: 'ປີ 2026-2027', isActive: true }]) as never;
    if (url === '/grade-levels') return paginated([
      { id: 'g1', code: 'm1', nameLo: 'ມ.1', level: 1 },
      { id: 'g3', code: 'm3', nameLo: 'ມ.3', level: 3 },
    ]) as never;
    return paginated([]) as never;
  });
  vi.spyOn(apiClient, 'post').mockResolvedValue({ recorded: 2 } as never);
  vi.spyOn(apiClient, 'put').mockResolvedValue(campaign as never);
});

/** Sets one row's outcome by its select. */
async function setOutcome(rowIndex: number, label: RegExp) {
  const rows = await screen.findAllByRole('row');
  // +1 skips the header row.
  const selects = within(rows[rowIndex + 1]!).getAllByRole('combobox');
  await userEvent.click(selects[0]!);
  await userEvent.click(await screen.findByRole('option', { name: label }));
}

async function setConsent(rowIndex: number, label: RegExp) {
  const rows = await screen.findAllByRole('row');
  const selects = within(rows[rowIndex + 1]!).getAllByRole('combobox');
  await userEvent.click(selects[1]!);
  await userEvent.click(await screen.findByRole('option', { name: label }));
}

const saveButton = () => screen.getByRole('button', { name: /^save$/i });

describe('DoseSheet', () => {
  it('opens with nothing marked, and will not save an untouched sheet', async () => {
    renderWithProviders(<DoseSheet campaign={campaign} />);
    await screen.findByText('ຈຸທາລັດ ວົງສາ');

    expect(screen.getByText('0/2 recorded')).toBeInTheDocument();
    // An unmarked row is "not yet decided", which is a different fact from every
    // outcome the sheet can record — including `absent`.
    expect(saveButton()).toBeDisabled();
  });

  it('blocks a dose marked given until it has consent', async () => {
    renderWithProviders(<DoseSheet campaign={campaign} />);
    await screen.findByText('ຈຸທາລັດ ວົງສາ');

    await setOutcome(0, /^given$/i);

    // The date is seeded from the campaign, so consent is what is still missing.
    expect(await screen.findByText(/needs consent/i)).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();

    await setConsent(0, /^consented$/i);

    await waitFor(() => expect(screen.queryByText(/needs consent/i)).not.toBeInTheDocument());
    expect(saveButton()).toBeEnabled();
  });

  it('records a refusal without consent, because the honest answer has to be filable', async () => {
    renderWithProviders(<DoseSheet campaign={campaign} />);
    await screen.findByText('ຈຸທາລັດ ວົງສາ');

    await setOutcome(0, /^refused$/i);

    expect(screen.queryByText(/needs consent/i)).not.toBeInTheDocument();
    expect(saveButton()).toBeEnabled();

    await userEvent.click(saveButton());

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));
    const body = vi.mocked(apiClient.post).mock.calls[0]![1] as {
      records: { studentId: string; status: string; administeredDate?: string }[];
    };
    // Only the marked row is sent — the untouched one stays unrecorded rather
    // than being filed as anything.
    expect(body.records).toHaveLength(1);
    expect(body.records[0]).toMatchObject({ studentId: 'stu-1', status: 'refused' });
    // No date and no vial on an outcome that is not a dose given: a stale batch
    // number is what points a recall at the wrong child.
    expect(body.records[0]).not.toHaveProperty('administeredDate');
    expect(body.records[0]).not.toHaveProperty('batchNumber');
  });

  it('sends the date, the vial and the primary guardian for a dose given', async () => {
    renderWithProviders(<DoseSheet campaign={campaign} />);
    await screen.findByText('ຈຸທາລັດ ວົງສາ');

    await userEvent.type(screen.getByLabelText(/batch no/i), 'B2409-17');
    await setOutcome(0, /^given$/i);
    await setConsent(0, /^consented$/i);
    await userEvent.click(saveButton());

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));
    const body = vi.mocked(apiClient.post).mock.calls[0]![1] as {
      records: { administeredDate: string; batchNumber: string; consent: { guardianId: string } }[];
    };
    expect(body.records[0]).toMatchObject({
      administeredDate: '2026-11-03',
      batchNumber: 'B2409-17',
      // The guardian the consent form went home with; the API checks it against
      // the student's own list rather than trusting the sheet.
      consent: { status: 'given', guardianId: 'gua-1' },
    });
  });

  it('fills only the unmarked rows, leaving a refusal alone', async () => {
    renderWithProviders(<DoseSheet campaign={campaign} />);
    await screen.findByText('ຈຸທາລັດ ວົງສາ');

    await setOutcome(0, /^refused$/i);
    await userEvent.click(screen.getByRole('button', { name: /fill unmarked rows as given/i }));

    expect(await screen.findByText('2/2 recorded')).toBeInTheDocument();
    // The second row now needs consent; the first is still a refusal, which a
    // convenience button must not have overwritten.
    expect(await screen.findByText(/needs consent/i)).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });
});

/**
 * The page and the campaign form, rendered for real.
 *
 * These exist because the dose-sheet tests above pass while the route is broken:
 * a bad import or an invented prop anywhere else in the feature only shows up
 * when the page itself is mounted. The root tsconfig is solution-style, so a
 * plain `tsc --noEmit` checks nothing and will not catch it either — `tsc -b` and
 * these two tests are what do.
 */
describe('VaccinationsPage', () => {
  it('lists the rounds and says who each one covers', async () => {
    renderWithProviders(<VaccinationsPage />);

    expect(await screen.findByText('ວັກຊີນ HPV ເຂັມທີ 1')).toBeInTheDocument();
    // The eligibility column is the one field worth checking before the sheet is
    // opened — and the only place a round's "girls only" is actually stated.
    expect(await screen.findByText(/female/i)).toBeInTheDocument();
  });

  it('opens the campaign form with every field it declares', async () => {
    renderWithProviders(<VaccinationsPage />);
    await screen.findByText('ວັກຊີນ HPV ເຂັມທີ 1');

    await userEvent.click(screen.getByRole('button', { name: /plan a campaign/i }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByLabelText(/name \(lao\)/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/scheduled date/i)).toBeInTheDocument();
    // The eligibility rule, which is the whole reason this form is not just CRUD.
    expect(within(dialog).getByText(/filters the student picker/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/none selected = every grade/i)).toBeInTheDocument();
    // Grade levels come from the lookup, as checkboxes rather than a dropdown.
    expect(await within(dialog).findByText(/m1/)).toBeInTheDocument();
  });

  it('opens a round on the picker, because a sheet needs students first', async () => {
    renderWithProviders(<VaccinationsPage />);
    await userEvent.click(await screen.findByText('ວັກຊີນ HPV ເຂັມທີ 1'));

    // The campaign replaces the list in place — it is only ever reached from its
    // row, so it has no route of its own.
    expect(await screen.findByRole('tab', { name: /students on the round/i })).toHaveAttribute(
      'data-state',
      'active',
    );
    expect(screen.getByText(/pick a class, then tick the students/i)).toBeInTheDocument();
  });

  it('reaches the dose sheet from the round’s second tab', async () => {
    renderWithProviders(<VaccinationsPage />);
    await userEvent.click(await screen.findByText('ວັກຊີນ HPV ເຂັມທີ 1'));
    await userEvent.click(await screen.findByRole('tab', { name: /dose sheet/i }));

    expect(await screen.findByText('ຈຸທາລັດ ວົງສາ')).toBeInTheDocument();
    expect(screen.getByText('0/2 recorded')).toBeInTheDocument();
  });
});

/** Picks the class, which is what makes the picker load. */
async function openPickerForClass() {
  renderWithProviders(<VaccinationsPage />);
  await userEvent.click(await screen.findByText('ວັກຊີນ HPV ເຂັມທີ 1'));
  await userEvent.click(await screen.findByRole('combobox', { name: /class/i }));
  await userEvent.click(await screen.findByRole('button', { name: /ກ/ }));
}

/**
 * The picker — the reason the roll stopped being a rule sweep.
 *
 * A rule that matched every girl in the school put children on a dose sheet
 * nobody had decided to vaccinate. The round now holds an explicit list, so what
 * matters here is that the list says exactly what the office ticked: no more, and
 * — across classes — no less.
 */
describe('StudentPicker', () => {
  it('lists the whole class, and will not let an ineligible name be ticked', async () => {
    await openPickerForClass();

    const boy = await screen.findByText('ສົມພອນ ວົງສາ');
    const row = boy.closest('label')!;
    // Shown rather than hidden, so a short list is not mistaken for a missing
    // enrolment — but not pickable, because the round does not cover him.
    expect(within(row).getByText(/not eligible/i)).toBeInTheDocument();
    expect(within(row).getByRole('checkbox')).toBeDisabled();

    expect(screen.getByText('1/3 ticked')).toBeInTheDocument();
  });

  it('saves only what was ticked, and keeps students from other classes', async () => {
    await openPickerForClass();
    await screen.findByText('ພອນສະຫວັນ ວົງສາ');

    const row = screen.getByText('ພອນສະຫວັນ ວົງສາ').closest('label')!;
    await userEvent.click(within(row).getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(apiClient.put).toHaveBeenCalledTimes(1));
    const [url, body] = vi.mocked(apiClient.put).mock.calls[0]!;
    expect(url).toBe(`/vaccinations/campaigns/${campaign.id}/students`);
    // stu-1 was already ticked, stu-2 has just been added, stu-3 is ineligible.
    // The campaign's own list held stu-1 and stu-2 only, so nothing else carries
    // through here — but the payload is the whole set, never a delta.
    expect((body as { studentIds: string[] }).studentIds.sort()).toEqual(['stu-1', 'stu-2']);
  });

  it('pins a student to the round once their dose is recorded', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/vaccinations/campaigns') return paginated([campaign]) as never;
      if (url === '/classrooms') return paginated([classroom]) as never;
      if (url === `/classrooms/${classroom.id}`) return classroom as never;
      if (url === '/school-years/active') return { id: 'sy-1', code: '2026-2027', isActive: true } as never;
      if (url === `/vaccinations/campaigns/${campaign.id}/candidates`) {
        return [
          {
            ...CANDIDATES[0],
            record: { id: 'vac-1', status: 'administered', consent: { status: 'given' } },
          },
        ] as never;
      }
      return paginated([]) as never;
    });

    await openPickerForClass();

    const row = (await screen.findByText('ຈຸທາລັດ ວົງສາ')).closest('label')!;
    // The record is a fact about a child who attended; dropping her from the
    // round would orphan it from the reason it exists.
    expect(within(row).getByRole('checkbox')).toBeDisabled();
    expect(within(row).getByText(/^given$/i)).toBeInTheDocument();
  });
});
