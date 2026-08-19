import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as apiClient from '@/lib/api-client';
import { renderWithProviders } from '@/test/utils';
import { MonthlyChecklist } from './components/MonthlyChecklist';
import { MyChecklist } from './components/MyChecklist';

/**
 * The monthly checklist.
 *
 * Two things carry the feature and neither is visible from the types: the office's
 * list has to be publishable only once it exists, and a teacher's upload has to
 * reach the *line* endpoint — which is what turns a file into a submitted plan.
 * A file posted to the plain attachment endpoint would leave the line reading as
 * outstanding forever, with the document sitting on a draft nobody can see.
 */

const semester = {
  id: '507f1f77bcf86cd799439001',
  nameLo: 'ພາກຮຽນ 1',
  nameEn: 'Semester 1',
  number: 1,
  startDate: '2026-08-17T00:00:00.000Z',
  endDate: '2026-12-20T00:00:00.000Z',
  status: 'active',
  isActive: true,
};

const teacher = {
  id: '507f1f77bcf86cd799439031',
  username: 'boonmee',
  personType: 'teacher',
  personId: '507f1f77bcf86cd799439031',
};

vi.mock('@/features/auth/hooks', () => ({
  useCan: () => () => true,
  useCurrentUser: () => teacher,
  useSeesEveryStudent: () => true,
}));

const month = {
  id: '507f1f77bcf86cd799439071',
  year: 2026,
  month: 8,
  status: 'published' as const,
  publishedAt: '2026-08-01T03:00:00.000Z',
  note: 'ບໍ່ຕ້ອງສົ່ງອາທິດສອບເສັງ',
  semesterId: semester.id,
  semesterNameLo: semester.nameLo,
  semesterNameEn: semester.nameEn,
};

const task = (overrides: Record<string, unknown> = {}) => ({
  id: '507f1f77bcf86cd799439081',
  weekIndex: 1,
  weekStartDate: '2026-08-17',
  weekEndDate: '2026-08-23',
  dueDate: '2026-08-14T09:00:00.000Z',
  teacherId: teacher.personId,
  teacherCode: 'T-2627-001',
  teacherName: 'ບຸນມີ ແກ້ວ',
  subjectId: '507f1f77bcf86cd799439011',
  subjectCode: 'CHEM-M4',
  subjectNameLo: 'ເຄມີສາດ',
  subjectNameEn: 'Chemistry',
  classroomId: '507f1f77bcf86cd799439021',
  classroomName: 'm4/ກ',
  subjectGroupId: null,
  status: 'missing',
  lessonPlanId: null,
  attachmentCount: 0,
  isLate: false,
  isOverdue: false,
  submittedAt: null,
  ...overrides,
});

const checklist = (tasks: ReturnType<typeof task>[]) => ({
  month,
  weeks: [{ index: 1, startDate: '2026-08-17', endDate: '2026-08-23' }],
  tasks,
  summary: {
    total: tasks.length,
    submitted: tasks.filter((entry) => entry.status !== 'missing').length,
    approved: tasks.filter((entry) => entry.status === 'approved').length,
    outstanding: tasks.filter((entry) => entry.status === 'missing').length,
    overdue: tasks.filter((entry) => entry.isOverdue).length,
    withFiles: tasks.filter((entry) => entry.attachmentCount > 0).length,
  },
});

function stubReads(overrides: Record<string, unknown> = {}): void {
  vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    if (url in overrides) return overrides[url] as never;
    if (url === '/semesters/active') return semester as never;
    if (url === '/lesson-plan-months') return [month] as never;
    if (url === `/lesson-plan-months/${month.id}`) return checklist([task()]) as never;
    return [] as never;
  });
}

describe('monthly checklist — a teacher’s lines', () => {
  afterEach(() => vi.restoreAllMocks());

  it('posts the document to the line, which is what submits it', async () => {
    stubReads();
    const upload = vi.spyOn(apiClient, 'upload').mockResolvedValue(task({ status: 'submitted' }));
    renderWithProviders(<MyChecklist />);

    await userEvent.click(await screen.findByRole('button', { name: /upload plan/i }));

    const document_ = new File(['plan'], 'week1.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    await userEvent.upload(document.querySelector('input[type="file"]')!, document_);
    await userEvent.click(screen.getByRole('button', { name: /^upload$/i }));

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    // Not `/lesson-plans/:id/attachments` — that path needs a plan to already
    // exist and would leave the line outstanding.
    expect(upload.mock.calls[0]![0]).toBe(`/lesson-plan-tasks/${task().id}/upload`);
  });

  it('shows the head’s instruction for the month', async () => {
    stubReads();
    renderWithProviders(<MyChecklist />);

    expect(await screen.findByText(/ບໍ່ຕ້ອງສົ່ງອາທິດສອບເສັງ/)).toBeInTheDocument();
  });

  /** An approved plan is the agreed record — the API refuses to reopen it. */
  it('offers no upload once the plan is approved', async () => {
    stubReads({
      [`/lesson-plan-months/${month.id}`]: checklist([
        task({ status: 'approved', attachmentCount: 1, lessonPlanId: 'plan-1' }),
      ]),
    });
    renderWithProviders(<MyChecklist />);

    expect(await screen.findByText(/week 1/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /upload/i })).not.toBeInTheDocument();
  });

  it('says so plainly when the office has published nothing', async () => {
    stubReads({ '/lesson-plan-months': [] });
    renderWithProviders(<MyChecklist />);

    expect(await screen.findByText(/no checklist published yet/i)).toBeInTheDocument();
  });
});

describe('monthly checklist — the office’s side', () => {
  afterEach(() => vi.restoreAllMocks());

  it('drafts the month from the timetable when none exists', async () => {
    // No checklist for the month the picker opens on, whichever month that is.
    stubReads({ '/lesson-plan-months': [] });
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue(checklist([task()]));
    renderWithProviders(<MonthlyChecklist />);

    expect(await screen.findByText(/no checklist for this month yet/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /draft from the timetable/i }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]![0]).toBe('/lesson-plan-months/draft');
    const today = new Date();
    expect(post.mock.calls[0]![1]).toEqual({
      year: today.getFullYear(),
      month: today.getMonth() + 1,
    });
  });

  it('lets a line be dropped only while nothing has been handed in against it', async () => {
    const draftMonth = { ...month, status: 'draft' as const };
    stubReads({
      '/lesson-plan-months': [draftMonth],
      [`/lesson-plan-months/${month.id}`]: {
        ...checklist([
          task(),
          task({ id: 'answered-line', status: 'submitted', lessonPlanId: 'plan-1' }),
        ]),
        month: draftMonth,
      },
    });
    renderWithProviders(<MonthlyChecklist />);

    const boxes = await screen.findAllByRole('checkbox', { name: /select to drop/i });
    expect(boxes).toHaveLength(2);
    // The outstanding line is selectable; the answered one is not, because
    // dropping it would hide a plan a reviewer may have already approved.
    expect(boxes[0]).toBeEnabled();
    expect(boxes[1]).toBeDisabled();
  });
});
