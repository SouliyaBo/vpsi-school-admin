import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClient from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { renderWithProviders } from '@/test/utils';
import type { GuardianReportDraft, Semester, Student } from '@/types/entities';
import { StudentGuardianReports } from './components/StudentGuardianReports';
import { GuardianReportPublicPage } from './pages/GuardianReportPublicPage';

/**
 * ລາຍງານຫາຜູ້ປົກຄອງ, from both ends.
 *
 * The guardian's page has to hold three promises: nothing opens without the four
 * digits, a wrong guess says how many are left, and a dead or locked link stops
 * asking. The teacher's side has one that matters more than the rest: a register
 * entry the teacher unticks does not go to the family.
 */

vi.mock('@/features/auth/hooks', () => ({
  useCan: () => () => true,
  useCurrentUser: () => ({ username: 'teacher', permissions: [] }),
}));

const TOKEN = 'T'.repeat(43);

const content = {
  student: { nameLo: 'ນາງ ມະນີວອນ ສີສຸວັນ', nickname: 'ມີນ' },
  classroomName: 'ມ.1/ກ',
  semester: { number: 1, nameLo: 'ພາກຮຽນທີ 1' },
  month: 9,
  window: { from: '2026-09-01', to: '2026-09-30' },
  teacherName: 'ທະວີພອນ ໃດສະຫງວນ',
  sentBy: 'homeroom' as const,
  attendance: {
    present: 18,
    absent: 1,
    late: 3,
    excused: 0,
    sick: 1,
    totalRecorded: 23,
    absentUnexcused: 2,
    absentExcused: 1,
    latesPerAbsence: 3,
    attendanceRate: 91.3,
  },
};

function apiError(status: number, messageKey: string, details?: unknown) {
  return new ApiError({ status, messageKey, message: messageKey, details });
}

describe('GuardianReportPublicPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('asks for nothing when the link lost its token', async () => {
    renderWithProviders(<GuardianReportPublicPage />, { route: '/r' });

    expect(await screen.findByRole('alert')).toHaveTextContent(/incomplete/i);
    expect(screen.queryByLabelText(/last 4 digits/i)).not.toBeInTheDocument();
  });

  it('says how many tries are left, then opens on the right digits', async () => {
    const post = vi
      .spyOn(apiClient, 'post')
      .mockRejectedValueOnce(apiError(400, 'guardianReport.wrongPin', { attemptsLeft: 4 }))
      .mockResolvedValueOnce({
        schoolNameLo: 'ໂຮງຮຽນ ວີພີເອັສໄອ',
        expiresAt: '2026-11-27T00:00:00.000Z',
        report: {
          ...content,
          guardian: { nameLo: 'ບຸນມີ ສີສຸວັນ', relationship: 'father' },
          sections: ['attendance'],
          message: 'ນ້ອງຕັ້ງໃຈຮຽນດີ',
          generatedAt: '2026-10-28T00:00:00.000Z',
        },
      } as never);

    renderWithProviders(<GuardianReportPublicPage />, { route: `/r#${TOKEN}` });

    const input = await screen.findByLabelText(/last 4 digits/i);
    await userEvent.type(input, '1234');
    await userEvent.click(screen.getByRole('button', { name: /open report/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('4 tries left');
    // The token goes in the body, never the URL.
    expect(post).toHaveBeenCalledWith('/guardian-reports/open', { token: TOKEN, pin: '1234' });

    await userEvent.clear(input);
    await userEvent.type(input, '6001');
    await userEvent.click(screen.getByRole('button', { name: /open report/i }));

    expect(await screen.findByText('ນາງ ມະນີວອນ ສີສຸວັນ')).toBeInTheDocument();
    expect(screen.getByText('ນ້ອງຕັ້ງໃຈຮຽນດີ')).toBeInTheDocument();
    expect(screen.getByText('91.3%')).toBeInTheDocument();
    expect(screen.queryByLabelText(/last 4 digits/i)).not.toBeInTheDocument();
  });

  it('shows ກວດກາ beside each mark, with no full marks and no rank', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({
      schoolNameLo: null,
      expiresAt: '2026-11-27T00:00:00.000Z',
      report: {
        ...content,
        monthlyMarks: {
          subjects: [
            { nameLo: 'ພາສາລາວ-ວັນນະຄະດີ', nameEn: null, score: 7.75, test: 3.5, grade: 'A' },
            { nameLo: 'ຄະນິດສາດ', nameEn: null, score: 6, test: 2, grade: 'C' },
          ],
          total: 13.75,
          average: 6.88,
          grade: 'B',
          isComplete: true,
        },
        guardian: { nameLo: 'ບຸນມີ ສີສຸວັນ', relationship: 'father' },
        sections: ['monthlyMarks'],
        message: null,
        generatedAt: '2026-10-28T00:00:00.000Z',
      },
    } as never);

    renderWithProviders(<GuardianReportPublicPage />, { route: `/r#${TOKEN}` });
    await userEvent.type(await screen.findByLabelText(/last 4 digits/i), '6001');
    await userEvent.click(screen.getByRole('button', { name: /open report/i }));

    const row = (await screen.findByText('ຄະນິດສາດ')).closest('tr')!;
    expect(row).toHaveTextContent(/ຄະນິດສາດ\s*2\s*6\s*C/);
    expect(screen.getByRole('columnheader', { name: 'Test' })).toBeInTheDocument();
    expect(screen.queryByText(/\/ 10|\/ 9/)).not.toBeInTheDocument();
    expect(screen.queryByText(/rank/i)).not.toBeInTheDocument();
  });

  it('says when the school office sent it rather than the homeroom teacher', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({
      schoolNameLo: null,
      expiresAt: '2026-11-27T00:00:00.000Z',
      report: {
        ...content,
        sentBy: 'office',
        guardian: { nameLo: 'ບຸນມີ ສີສຸວັນ', relationship: 'father' },
        sections: ['attendance'],
        message: null,
        generatedAt: '2026-10-28T00:00:00.000Z',
      },
    } as never);

    renderWithProviders(<GuardianReportPublicPage />, { route: `/r#${TOKEN}` });
    await userEvent.type(await screen.findByLabelText(/last 4 digits/i), '6001');
    await userEvent.click(screen.getByRole('button', { name: /open report/i }));

    expect(await screen.findByText('Sent by the school office')).toBeInTheDocument();
    expect(screen.getByText(/ທະວີພອນ ໃດສະຫງວນ/)).toBeInTheDocument();
  });

  it('stops asking once the link is locked', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue(apiError(403, 'guardianReport.locked'));

    renderWithProviders(<GuardianReportPublicPage />, { route: `/r#${TOKEN}` });

    await userEvent.type(await screen.findByLabelText(/last 4 digits/i), '0000');
    await userEvent.click(screen.getByRole('button', { name: /open report/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/locked/i);
    expect(screen.queryByLabelText(/last 4 digits/i)).not.toBeInTheDocument();
  });

  it('keeps an axios-shaped failure readable too', async () => {
    // What the real client throws before `toApiError` sees it.
    const error = new AxiosError('Not Found', '404', undefined, undefined, {
      status: 404,
      statusText: 'Not Found',
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: { statusCode: 404, messageKey: 'guardianReport.unavailable', message: 'x' },
    });
    vi.spyOn(apiClient, 'post').mockRejectedValue(error);

    renderWithProviders(<GuardianReportPublicPage />, { route: `/r#${TOKEN}` });

    await userEvent.type(await screen.findByLabelText(/last 4 digits/i), '6001');
    await userEvent.click(screen.getByRole('button', { name: /open report/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no longer works/i);
  });
});

describe('StudentGuardianReports — sending one', () => {
  const semester = {
    id: 'sem-1',
    schoolYearId: 'sy-1',
    number: 1,
    nameLo: 'ພາກຮຽນທີ 1',
    startDate: '2026-08-17T00:00:00.000Z',
    endDate: '2027-01-15T00:00:00.000Z',
    status: 'active',
    isActive: true,
  } as Semester;

  const student = {
    id: 'stu-1',
    studentCode: '0801',
    firstNameLo: 'ມະນີວອນ',
    lastNameLo: 'ສີສຸວັນ',
    gender: 'female',
    dateOfBirth: '2014-06-15T00:00:00.000Z',
    guardians: [
      {
        guardianId: 'gua-1',
        fullNameLo: 'ບຸນມີ ສີສຸວັນ',
        phone: '02055566001',
        relationship: 'father',
        isPrimary: true,
      },
    ],
    status: 'active',
  } as unknown as Student;

  const draft: GuardianReportDraft = {
    ...content,
    monthlyMarks: undefined,
    conduct: { baseScore: 100, remaining: 95, grade: 'excellent', deductions: [] },
    behavior: [
      {
        id: 'log-1',
        date: '2026-09-10',
        subjectNameLo: 'ທຳມະຊາດ',
        behavior: 'ລົມກັນໃນຫ້ອງ',
        action: 'ເຕືອນ',
        remark: null,
      },
      {
        id: 'log-2',
        date: '2026-09-12',
        subjectNameLo: 'ພາສາລາວ',
        behavior: 'ຜິດຖຽງກັບ ທ້າວ ສົມສັກ',
        action: null,
        remark: null,
      },
    ],
    guardians: [
      {
        id: 'gua-1',
        nameLo: 'ບຸນມີ ສີສຸວັນ',
        relationship: 'father',
        isPrimary: true,
        canViewRecords: true,
        hasPhone: true,
      },
      {
        id: 'gua-2',
        nameLo: 'ດາລາ ສີສຸວັນ',
        relationship: 'mother',
        isPrimary: false,
        canViewRecords: false,
        hasPhone: true,
      },
    ],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/guardian-reports') return [] as never;
      if (url === '/guardian-reports/draft') return draft as never;
      throw new Error(`unexpected GET ${url}`);
    });
  });

  it('leaves out the register entry the teacher unticks, and hands back a Lao message with the link', async () => {
    const post = vi.spyOn(apiClient, 'post').mockImplementation(
      async (_url, body) =>
        ({
          token: TOKEN,
          report: {
            id: 'rep-1',
            studentId: 'stu-1',
            guardianId: 'gua-1',
            month: (body as { month: number }).month,
            semesterId: 'sem-1',
            state: 'active',
            expiresAt: '2026-11-27T00:00:00.000Z',
            failedAttempts: 0,
            viewCount: 0,
            firstViewedAt: null,
            lastViewedAt: null,
            revokedAt: null,
            createdAt: '2026-10-28T00:00:00.000Z',
            snapshot: {
              ...content,
              guardian: { nameLo: 'ບຸນມີ ສີສຸວັນ', relationship: 'father' },
              sections: ['attendance', 'conduct', 'behavior'],
              message: null,
              generatedAt: '2026-10-28T00:00:00.000Z',
            },
          },
        }) as never,
    );

    renderWithProviders(<StudentGuardianReports student={student} semester={semester} enabled />);

    await userEvent.click(await screen.findByRole('button', { name: /new report/i }));

    // The entry naming another child is unticked before sending.
    const other = await screen.findByLabelText(/ທ້າວ ສົມສັກ/);
    await userEvent.click(other);

    // The guardian without viewing rights is not the one picked.
    await waitFor(() => expect(screen.getByRole('button', { name: /create link/i })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: /create link/i }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    const [url, body] = post.mock.calls[0]!;
    expect(url).toBe('/guardian-reports');
    expect(body).toMatchObject({
      studentId: 'stu-1',
      guardianId: 'gua-1',
      behaviorLogIds: ['log-1'],
    });
    expect(body).not.toHaveProperty('message');

    // Written to the family in Lao, with the token in the fragment.
    const message = (await screen.findByRole('textbox', {
      name: /link ready/i,
    })) as HTMLTextAreaElement;
    expect(message.value).toContain(`/r#${TOKEN}`);
    expect(message.value).toContain('ສະບາຍດີ ທ່ານ ບຸນມີ ສີສຸວັນ');
    expect(screen.getByText(/6001/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /whatsapp/i })).toHaveAttribute(
      'href',
      expect.stringMatching(/^https:\/\/wa\.me\/8562055566001\?text=/),
    );
  });
});
