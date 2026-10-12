import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClient from '@/lib/api-client';
import { paginated, renderWithProviders } from '@/test/utils';
import { ObservationList } from './components/ObservationList';
import { ObservationSummary } from './components/ObservationSummary';

/**
 * ຕິດຕາມການສອນຂອງຄູ — the classroom-observation sheet.
 *
 * The arithmetic of a sheet is the API's and is asserted there. What the screen
 * is answerable for is the reason the feature exists: that every sheet says who
 * did the observing, that a blank box is sent as "not marked" rather than as a
 * zero, and that the two workflow steps land with the right person — the
 * observer files, and only the teacher observed can say they have read it.
 */

const RUBRIC = {
  criterionMaxScore: 10,
  maxTotal: 60,
  criteria: [
    {
      key: 'classroom_control',
      order: 1,
      labelLo: 'ການຄຸມຫ້ອງ ແລະ ເວລາ',
      labelEn: 'Classroom and time management',
      indicatorsLo: ['ຄວບຄຸມບັນຍາກາດ', 'ດຳເນີນການສອນຕາມເວລາ'],
      indicatorsEn: ['Keeps order', 'Runs to time'],
    },
    {
      key: 'activities',
      order: 2,
      labelLo: 'ການຈັດກິດຈະກຳ',
      labelEn: 'Activities',
      indicatorsLo: ['ໃຫ້ນັກຮຽນໄດ້ຄິດ', 'ມີສ່ວນຮ່ວມທົ່ວເຖິງ'],
      indicatorsEn: ['Makes pupils think', 'Everyone takes part'],
    },
  ],
};

const OBSERVER = {
  id: 'teacher-observer',
  teacherCode: 'T-002',
  firstNameLo: 'ບຸນມີ',
  lastNameLo: 'ສີສຸກ',
};

const OBSERVED = {
  id: 'teacher-observed',
  teacherCode: 'T-001',
  firstNameLo: 'ສົມຈິດ',
  lastNameLo: 'ວົງສາ',
};

/** A draft written by the signed-in teacher about a colleague. */
const DRAFT = {
  id: 'obs-1',
  teacherId: OBSERVED,
  observerId: OBSERVER,
  subjectId: { id: 'sub-1', code: 'LAO', nameLo: 'ພາສາລາວ' },
  classroomId: { id: 'room-1', name: 'ມ.4/ກ' },
  semesterId: { id: 'sem-1', nameLo: 'ພາກຮຽນ 1' },
  observedAt: '2026-09-02T00:00:00.000Z',
  visitNumber: 2,
  scores: [
    { criterion: 'classroom_control', score: 8 },
    { criterion: 'activities', score: null },
  ],
  totalScore: 8,
  maxScore: 10,
  status: 'draft',
  note: null,
};

/** A filed sheet about the signed-in teacher, waiting to be acknowledged. */
const ABOUT_ME = {
  ...DRAFT,
  id: 'obs-2',
  teacherId: OBSERVER,
  observerId: OBSERVED,
  visitNumber: 1,
  scores: [
    { criterion: 'classroom_control', score: 9 },
    { criterion: 'activities', score: 7 },
  ],
  totalScore: 16,
  maxScore: 20,
  status: 'submitted',
};

const SUMMARY = {
  semester: { id: 'sem-1', nameLo: 'ພາກຮຽນ 1', nameEn: 'Semester 1' },
  maxTotal: 60,
  criteria: RUBRIC.criteria,
  teachers: [
    {
      teacherId: OBSERVED.id,
      teacherCode: 'T-001',
      teacherNameLo: 'ສົມຈິດ ວົງສາ',
      teacherNameEn: null,
      subjectGroupId: null,
      visitCount: 3,
      acknowledgedCount: 1,
      averageTotal: 38.5,
      maxTotal: 60,
      averageByCriterion: { classroom_control: 7.5, activities: 5 },
      lastObservedAt: '2026-09-02T00:00:00.000Z',
    },
    {
      teacherId: 'teacher-3',
      teacherCode: 'T-003',
      teacherNameLo: 'ຄຳມູນ ພົມມາ',
      teacherNameEn: null,
      subjectGroupId: null,
      visitCount: 2,
      acknowledgedCount: 2,
      averageTotal: 54,
      maxTotal: 60,
      averageByCriterion: { classroom_control: 9, activities: 9 },
      lastObservedAt: '2026-09-05T00:00:00.000Z',
    },
  ],
};

let permits: (resource: string, action?: string) => boolean = () => true;

vi.mock('@/features/auth/hooks', () => ({
  useCan: () => (resource: string, action?: string) => permits(resource, action),
  // The signed-in user is the observer on the draft and the observed teacher on
  // the filed sheet, which is what lets one fixture set exercise both sides.
  useCurrentUser: () => ({
    username: 'boun',
    personType: 'teacher',
    personId: 'teacher-observer',
    permissions: [],
  }),
  useSeesEveryStudent: () => true,
}));

function stubReads(rows: unknown[] = [DRAFT, ABOUT_ME]): void {
  vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    if (url === '/teaching-observations/rubric') return RUBRIC as never;
    if (url === '/teaching-observations/summary') return SUMMARY as never;
    if (url === '/teaching-observations') return paginated(rows) as never;
    if (url.startsWith('/teaching-observations/')) return rows[0] as never;
    if (url === '/subject-groups') return paginated([]) as never;
    return paginated([]) as never;
  });
}

describe('the sheet list', () => {
  beforeEach(() => {
    permits = () => true;
    stubReads();
  });
  afterEach(() => vi.restoreAllMocks());

  it('names the observer on every row — the column the paper form lacks', async () => {
    renderWithProviders(<ObservationList />);

    // Both names appear on the first row: the teacher observed and the one who
    // observed them. Each also appears in the other role on the second row,
    // which is exactly the pairing the paper form cannot express.
    await screen.findAllByText('ສົມຈິດ ວົງສາ');

    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('ສົມຈິດ ວົງສາ');
    expect(rows[1]).toHaveTextContent('ບຸນມີ ສີສຸກ');
  });

  it('shows a draft total against what has actually been marked, not out of sixty', async () => {
    renderWithProviders(<ObservationList />);

    // 8 of a possible 10, because only one of the two criteria carries a mark.
    expect(await screen.findByText('/ 10')).toBeInTheDocument();
  });

  it('offers filing to the observer', async () => {
    renderWithProviders(<ObservationList />);
    await screen.findAllByText('ສົມຈິດ ວົງສາ');

    await userEvent.click(screen.getAllByRole('button', { name: /actions|ຈັດການ/i })[0]!);
    expect(await screen.findByRole('menuitem', { name: /file the sheet/i })).toBeInTheDocument();
  });

  it('offers acknowledging only on the sheet written about the signed-in teacher', async () => {
    renderWithProviders(<ObservationList />);
    await screen.findAllByText('ສົມຈິດ ວົງສາ');

    const menus = screen.getAllByRole('button', { name: /actions|ຈັດການ/i });

    // Row one is the draft this user wrote about somebody else — nothing to
    // acknowledge, and it is still a draft.
    await userEvent.click(menus[0]!);
    await screen.findByRole('menuitem', { name: /file the sheet/i });
    expect(screen.queryByRole('menuitem', { name: /confirm i have read/i })).toBeNull();
    await userEvent.keyboard('{Escape}');

    // Row two was filed about them, so it is theirs to confirm — and not theirs
    // to edit.
    await userEvent.click(menus[1]!);
    expect(
      await screen.findByRole('menuitem', { name: /confirm i have read/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^edit$/i })).toBeNull();
  });

  it('sends the acknowledgement for that sheet alone', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue(ABOUT_ME as never);

    renderWithProviders(<ObservationList />);
    await screen.findAllByText('ສົມຈິດ ວົງສາ');

    await userEvent.click(screen.getAllByRole('button', { name: /actions|ຈັດການ/i })[1]!);
    await userEvent.click(await screen.findByRole('menuitem', { name: /confirm i have read/i }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/teaching-observations/obs-2/acknowledge'),
    );
  });

  it('hides the new-sheet button from an account that may only read', async () => {
    permits = (_resource, action) => action === 'read';
    renderWithProviders(<ObservationList />);
    await screen.findAllByText('ສົມຈິດ ວົງສາ');

    expect(screen.queryByRole('button', { name: /new observation/i })).toBeNull();
  });
});

/**
 * ປະເມີນຄັ້ງທີ is counted per observer, and the form says which number that is.
 *
 * The screen's part in the rule: before this, the field was blank and unexplained
 * and the observer typed the number from their own paper — which collided with a
 * colleague's sheet about the same lesson and was refused. The number the API
 * would use is now shown against the field the moment the lesson is named.
 */
describe('the visit number the form offers', () => {
  const TEACHERS = [OBSERVED, OBSERVER];
  const SUBJECTS = [{ id: 'sub-1', code: 'LAO', nameLo: 'ພາສາລາວ', nameEn: 'Lao' }];
  const ROOMS = [{ id: 'room-1', name: 'M3 A' }];
  const SEMESTERS = [{ id: 'sem-1', nameLo: 'ພາກຮຽນ 1', nameEn: 'Semester 1', isActive: true }];

  beforeEach(() => {
    permits = () => true;
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      // Ahead of the `/teaching-observations/` prefix below, which would
      // otherwise answer this with a sheet.
      if (url === '/teaching-observations/next-visit') return { visitNumber: 2, semesterId: 'sem-1' } as never;
      if (url === '/teaching-observations/rubric') return RUBRIC as never;
      if (url === '/teaching-observations') return paginated([DRAFT]) as never;
      if (url.startsWith('/teaching-observations/')) return DRAFT as never;
      if (url === '/teachers') return paginated(TEACHERS) as never;
      if (url === '/subjects') return paginated(SUBJECTS) as never;
      if (url === '/classrooms') return paginated(ROOMS) as never;
      if (url === '/semesters') return paginated(SEMESTERS) as never;
      return paginated([]) as never;
    });
  });
  afterEach(() => vi.restoreAllMocks());

  /** Walks an `EntitySelect` inside the dialog: open it, then take the option. */
  async function pick(dialog: HTMLElement, field: RegExp, option: RegExp) {
    await userEvent.click(within(dialog).getByRole('combobox', { name: field }));
    await userEvent.click(await screen.findByRole('button', { name: option }));
  }

  it('asks for the signed-in observer’s own next number, and shows it', async () => {
    const get = vi.mocked(apiClient.get);

    renderWithProviders(<ObservationList />);
    await screen.findAllByText('ສົມຈິດ ວົງສາ');

    await userEvent.click(screen.getAllByRole('button', { name: /new observation/i })[0]!);
    const dialog = await screen.findByRole('dialog');

    // The observer is already filled in as the signed-in teacher; the teacher
    // observed and the subject are what complete the question. The room is
    // named on the sheet but is not part of the count, so it is not picked here.
    await pick(dialog, /teacher observed/i, /T-001/);
    await pick(dialog, /subject taught/i, /LAO/);
    await pick(dialog, /semester/i, /Semester 1/);

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        '/teaching-observations/next-visit',
        expect.objectContaining({
          params: {
            teacherId: 'teacher-observed',
            observerId: 'teacher-observer',
            subjectId: 'sub-1',
            semesterId: 'sem-1',
          },
        }),
      ),
    );

    expect(await within(dialog).findByText(/this will be visit 2/i)).toBeInTheDocument();
  });
});

describe('the per-teacher summary', () => {
  beforeEach(() => {
    permits = () => true;
    stubReads();
  });
  afterEach(() => vi.restoreAllMocks());

  it('leads with the weakest average — the teacher who needs support', async () => {
    renderWithProviders(<ObservationSummary />);
    await screen.findByText('ສົມຈິດ ວົງສາ');

    const rows = screen.getAllByRole('row');
    // Row 0 is the header; the API orders the body and the screen preserves it.
    expect(rows[1]).toHaveTextContent('ສົມຈິດ ວົງສາ');
    expect(rows[1]).toHaveTextContent('38.5');
    expect(rows[2]).toHaveTextContent('ຄຳມູນ ພົມມາ');
  });

  it('flags visits the teacher has not confirmed reading', async () => {
    renderWithProviders(<ObservationSummary />);

    // Three visits, one acknowledged — two conversations that never happened.
    expect(await screen.findByText('(1 ✓)')).toBeInTheDocument();
  });
});
