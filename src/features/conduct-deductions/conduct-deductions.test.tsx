import { screen, waitFor, within } from '@testing-library/react';
import { ApiError } from '@/lib/api-error';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClient from '@/lib/api-client';
import { paginated, renderWithProviders } from '@/test/utils';
import { ClassStanding } from './components/ClassStanding';
import { DeductionEntry } from './components/DeductionEntry';
import { RuleSheet } from './components/RuleSheet';

/**
 * ຕັດຄະແນນອຸປະນິໄສ — the discipline sheet.
 *
 * What is under test is the part the screen is answerable for. The balance and
 * the rung are the API's arithmetic and are asserted there; here it is that the
 * form sends the rule rather than a number, that it offers only the children
 * actually in the room, and that what comes back — how far this has escalated,
 * and who now has to be told — is put in front of the teacher who just filed it
 * rather than left on another tab.
 */

const activeYear = {
  id: '507f1f77bcf86cd799439001',
  code: '2026-2027',
  nameLo: 'ປີ 2026-2027',
  isActive: true,
};

const semester = {
  id: '507f1f77bcf86cd799439003',
  nameLo: 'ພາກຮຽນ 1',
  nameEn: 'Semester 1',
  number: 1,
  schoolYearId: activeYear.id,
  isActive: true,
};

const classroom = {
  id: '507f1f77bcf86cd799439002',
  name: 'A',
  capacity: 45,
  currentCount: 3,
  gradeLevelId: { id: 'g1', code: 'm4' },
  schoolYearId: activeYear.id,
  isActive: true,
};

const RULES = [
  {
    id: 'rule-1',
    code: '2.1',
    points: 10,
    nameLo: 'ໃຊ້ໂທລະສັບໃນເວລາຮຽນ',
    nameEn: 'Using a phone during class',
    isActive: true,
    sortOrder: 1,
  },
  {
    id: 'rule-2',
    code: '3.4',
    points: 15,
    nameLo: 'ນັກຮຽນຊາຍໃສ່ຕ່າງຫູ',
    nameEn: 'A male student wearing earrings',
    isActive: true,
    sortOrder: 4,
  },
];

/**
 * The middle row is a child the office has marked as gone whose placement nobody
 * has closed — the roster still carries them.
 */
const ROSTER = [
  {
    id: 'enr-1',
    studentId: { id: 'stu-1', status: 'active' },
    studentCode: 'S-0001',
    studentNameLo: 'ສົມຈິດ ວົງສາ',
    rollNumber: 1,
    status: 'active',
  },
  {
    id: 'enr-2',
    studentId: { id: 'stu-2', status: 'dropped' },
    studentCode: 'S-0002',
    studentNameLo: 'ນາງ ຄຳ',
    rollNumber: 2,
    status: 'active',
  },
  {
    id: 'enr-3',
    studentId: { id: 'stu-3', status: 'active' },
    studentCode: 'S-0003',
    studentNameLo: 'ບຸນມີ ສີສຸກ',
    rollNumber: 3,
    status: 'active',
  },
];

const LADDER = {
  baseScore: 100,
  rungs: [
    { level: 'none', minDeducted: 0, notify: [] },
    { level: 'classroom', minDeducted: 10, notify: ['homeroomTeacher', 'student'] },
    {
      level: 'level1',
      minDeducted: 20,
      notify: ['homeroomTeacher', 'disciplineCommittee', 'guardian', 'student'],
    },
  ],
};

let permits: (resource: string, action?: string) => boolean = () => true;

vi.mock('@/features/auth/hooks', () => ({
  useCan: () => (resource: string, action?: string) => permits(resource, action),
  useCurrentUser: () => ({ username: 'admin', permissions: [] }),
  useSeesEveryStudent: () => true,
}));

function stubReads(overrides: Record<string, unknown> = {}): void {
  vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    if (url in overrides) return overrides[url] as never;
    if (url === '/school-years/active') return activeYear as never;
    if (url === '/semesters/active') return semester as never;
    if (url === '/semesters') return paginated([semester]) as never;
    if (url === '/classrooms') return paginated([classroom]) as never;
    if (url === '/conduct-rules') return paginated(RULES) as never;
    if (url === '/conduct-deductions/ladder') return LADDER as never;
    if (url === `/enrollments/classroom/${classroom.id}/roster`) return ROSTER as never;
    return paginated([]) as never;
  });
}

async function chooseClassroom() {
  await userEvent.click(await screen.findByRole('combobox', { name: /class/i }));
  await userEvent.click(await screen.findByRole('button', { name: /m4 A/ }));
}

describe('conduct deductions — taking points', () => {
  beforeEach(() => {
    permits = () => true;
    stubReads();
  });
  afterEach(() => vi.restoreAllMocks());

  it('sends the rule and the students, and never a number of points', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({
      recorded: 1,
      students: [
        {
          studentId: 'stu-1',
          deducted: 10,
          remaining: 90,
          grade: 'excellent',
          publishedToConductScore: true,
          level: 'classroom',
          notify: ['homeroomTeacher', 'student'],
        },
      ],
    } as never);

    renderWithProviders(<DeductionEntry />);
    await chooseClassroom();

    await userEvent.click(screen.getByRole('combobox', { name: /rule broken/i }));
    await userEvent.click(await screen.findByRole('option', { name: /2\.1/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /ສົມຈິດ ວົງສາ/ }));
    await userEvent.click(screen.getByRole('button', { name: /record deduction/i }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const body = post.mock.calls[0]![1] as Record<string, unknown>;
    expect(body).toMatchObject({
      classroomId: classroom.id,
      ruleId: 'rule-1',
      studentIds: ['stu-1'],
    });
    // The cost belongs to the rule. A sheet whose numbers the form could
    // override would not be a published sheet.
    expect(body).not.toHaveProperty('points');
  });

  it('does not offer a student the office has taken off the roll', async () => {
    renderWithProviders(<DeductionEntry />);
    await chooseClassroom();

    expect(await screen.findByText('ສົມຈິດ ວົງສາ')).toBeInTheDocument();
    expect(screen.getByText('ບຸນມີ ສີສຸກ')).toBeInTheDocument();
    expect(screen.queryByText('ນາງ ຄຳ')).not.toBeInTheDocument();
  });

  it('says how far it has escalated and who must be told, without another click', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({
      recorded: 1,
      students: [
        {
          studentId: 'stu-1',
          deducted: 25,
          remaining: 75,
          grade: 'good',
          publishedToConductScore: true,
          level: 'level1',
          notify: ['homeroomTeacher', 'disciplineCommittee', 'guardian', 'student'],
        },
      ],
    } as never);

    renderWithProviders(<DeductionEntry />);
    await chooseClassroom();
    await userEvent.click(screen.getByRole('combobox', { name: /rule broken/i }));
    await userEvent.click(await screen.findByRole('option', { name: /2\.1/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /ສົມຈິດ ວົງສາ/ }));
    await userEvent.click(screen.getByRole('button', { name: /record deduction/i }));

    expect(await screen.findByText(/75 points left/i)).toBeInTheDocument();
    expect(screen.getByText('Level 1')).toBeInTheDocument();
    // The whole point of the ladder: the guardians now have to hear about it.
    expect(screen.getByText(/the guardians/i)).toBeInTheDocument();
  });

  it('warns that a hand-set conduct mark is what the report card still prints', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({
      recorded: 1,
      students: [
        {
          studentId: 'stu-1',
          deducted: 10,
          remaining: 90,
          grade: 'excellent',
          publishedToConductScore: false,
          level: 'classroom',
          notify: ['homeroomTeacher', 'student'],
        },
      ],
    } as never);

    renderWithProviders(<DeductionEntry />);
    await chooseClassroom();
    await userEvent.click(screen.getByRole('combobox', { name: /rule broken/i }));
    await userEvent.click(await screen.findByRole('option', { name: /2\.1/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /ສົມຈິດ ວົງສາ/ }));
    await userEvent.click(screen.getByRole('button', { name: /record deduction/i }));

    expect(await screen.findByText(/set by hand/i)).toBeInTheDocument();
  });
});

describe('conduct deductions — the class standing', () => {
  beforeEach(() => {
    permits = () => true;
  });
  afterEach(() => vi.restoreAllMocks());

  it('lists a student with nothing against them on their full 100', async () => {
    stubReads({
      [`/conduct-deductions/summary/classroom/${classroom.id}/semester/${semester.id}`]: [
        {
          studentId: 'stu-1',
          studentCode: 'S-0001',
          studentNameLo: 'ສົມຈິດ ວົງສາ',
          studentNickname: null,
          rollNumber: 1,
          deducted: 25,
          entries: 2,
          lastDate: '2026-09-14',
          remaining: 75,
          grade: 'good',
          level: 'level1',
          notify: ['homeroomTeacher', 'disciplineCommittee', 'guardian', 'student'],
        },
        {
          studentId: 'stu-3',
          studentCode: 'S-0003',
          studentNameLo: 'ບຸນມີ ສີສຸກ',
          studentNickname: null,
          rollNumber: 3,
          deducted: 0,
          entries: 0,
          lastDate: null,
          remaining: 100,
          grade: 'excellent',
          level: 'none',
          notify: [],
        },
      ],
    });

    renderWithProviders(<ClassStanding />);
    await chooseClassroom();

    // A clean record is half the information on a discipline sheet: dropping it
    // would read as a class where everyone is in trouble.
    const table = within(await screen.findByRole('table'));
    const clean = table.getByText('ບຸນມີ ສີສຸກ').closest('tr') as HTMLElement;
    expect(within(clean).getByText('100')).toBeInTheDocument();
    expect(within(clean).getByText(/below reporting/i)).toBeInTheDocument();

    const flagged = table.getByText('ສົມຈິດ ວົງສາ').closest('tr') as HTMLElement;
    expect(within(flagged).getByText('−25')).toBeInTheDocument();
    expect(within(flagged).getByText('Level 1')).toBeInTheDocument();

    expect(screen.getByText(/1 of 2 students have to be reported/i)).toBeInTheDocument();

    // And the names that have to be reported are spelled out under the table,
    // rather than left as a badge the reader has to decode.
    expect(screen.getByText(/the discipline committee/i)).toBeInTheDocument();
  });
});

describe('conduct deductions — the rule sheet', () => {
  beforeEach(() => stubReads());
  afterEach(() => vi.restoreAllMocks());

  it('groups the rules into the columns the printed sheet has', async () => {
    renderWithProviders(<RuleSheet />);

    expect(await screen.findByText('10 points per occurrence')).toBeInTheDocument();
    expect(screen.getByText('15 points per occurrence')).toBeInTheDocument();
  });

  it('shows the ladder the school published, rather than restating it', async () => {
    renderWithProviders(<RuleSheet />);

    expect(await screen.findByText(/Classroom level/)).toBeInTheDocument();
    expect(screen.getByText('10+')).toBeInTheDocument();
    expect(screen.getByText('20+')).toBeInTheDocument();
  });

  /**
   * The API caps a page at 100 rows and answers 400 above it. Asking for more
   * here would not degrade to a short page — it would fail the request, and this
   * screen renders a failed request as an empty sheet unless it is told
   * otherwise. Hence both of these.
   */
  it('asks for the sheet within the page size the API will serve', async () => {
    const get = vi.spyOn(apiClient, 'get');
    renderWithProviders(<RuleSheet />);
    await screen.findByText('10 points per occurrence');

    const call = get.mock.calls.find(([url]) => url === '/conduct-rules');
    const params = (call?.[1] as { params?: Record<string, string> })?.params ?? {};
    expect(Number(params.limit)).toBeLessThanOrEqual(100);
  });

  it('says the sheet could not be loaded rather than that there is none', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/conduct-rules') {
        throw new ApiError({ message: 'limit must not be greater than 100', status: 400 });
      }
      if (url === '/conduct-deductions/ladder') return LADDER as never;
      return paginated([]) as never;
    });

    renderWithProviders(<RuleSheet />);

    expect(await screen.findByText(/limit must not be greater than 100/i)).toBeInTheDocument();
    // The one answer that would send the office off to retype a sheet they have
    // already entered.
    expect(screen.queryByText('No rules yet')).not.toBeInTheDocument();
  });

  it('opens a blank form for the second rule, not the first one again', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({ id: 'rule-3' } as never);
    renderWithProviders(<RuleSheet />);

    await userEvent.click(await screen.findByRole('button', { name: /add a rule/i }));
    await userEvent.type(screen.getByLabelText(/number/i), '2.6');
    await userEvent.type(screen.getByLabelText(/wording \(lao\)/i), 'ໜີຮຽນ');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    // Adding a second rule straight after the first: the office types two or
    // three in a sitting, and a form that opened on the last one would either
    // be retyped over or filed as a duplicate.
    await userEvent.click(await screen.findByRole('button', { name: /add a rule/i }));
    expect(screen.getByLabelText(/number/i)).toHaveValue('');
    expect(screen.getByLabelText(/wording \(lao\)/i)).toHaveValue('');
  });

  it('keeps the sheet read-only for an account that may not edit it', async () => {
    permits = (_resource, action) => action !== 'manage';
    renderWithProviders(<RuleSheet />);

    expect(await screen.findByText('10 points per occurrence')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add a rule/i })).not.toBeInTheDocument();
  });
});
