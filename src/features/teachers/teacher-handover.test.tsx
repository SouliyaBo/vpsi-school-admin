import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClient from '@/lib/api-client';
import { paginated, renderWithProviders } from '@/test/utils';
import { TeacherHandoverDialog } from './components/TeacherHandoverDialog';

/**
 * ສົ່ງມອບການສອນ — the dialog the office uses when a teacher leaves mid-term.
 *
 * What these pin is the part the office has to be able to trust: that the dialog
 * shows what will move *before* it moves anything, and that it sends the whole
 * handover rather than whichever half somebody remembered to tick. The ordering
 * and the transaction are the API's, and are tested there.
 */

const outgoing = {
  id: '507f1f77bcf86cd799439011',
  teacherCode: 'T-2627-001',
  firstNameLo: 'ບຸນມີ',
  lastNameLo: 'ວົງສາ',
  gender: 'female' as const,
  status: 'active' as const,
  isAcademicHead: false,
};

const incoming = {
  id: '507f1f77bcf86cd799439012',
  teacherCode: 'T-2627-002',
  firstNameLo: 'ຄຳຫລ້າ',
  lastNameLo: 'ສີສຸວົງ',
  gender: 'male' as const,
  status: 'active' as const,
  isAcademicHead: false,
};

const HOLDS = {
  teacherId: outgoing.id,
  status: 'active',
  isAcademicHead: false,
  hasActiveAccount: true,
  assignments: [
    {
      id: 'ta-1',
      subjectNameLo: 'ຄະນິດສາດ',
      classroomName: 'ກ',
      gradeLevelCode: 'm4',
      semesterNameLo: 'ພາກຮຽນ 1',
      periods: 2,
    },
    {
      id: 'ta-2',
      subjectNameLo: 'ຟີຊິກສາດ',
      classroomName: 'ຂ',
      gradeLevelCode: 'm4',
      semesterNameLo: 'ພາກຮຽນ 1',
      periods: 1,
    },
  ],
  homerooms: [{ id: 'c-1', name: 'ກ', gradeLevelCode: 'm4', studentCount: 32 }],
  subjectGroups: [],
};

vi.mock('@/features/auth/hooks', () => ({
  useCan: () => () => true,
  useCurrentUser: () => ({ username: 'admin', permissions: [] }),
  useSeesEveryStudent: () => true,
}));

function stubReads(commitments: unknown = HOLDS): void {
  vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    if (url === `/teachers/${outgoing.id}/commitments`) return commitments as never;
    if (url === '/teachers') return paginated([outgoing, incoming]) as never;
    return paginated([]) as never;
  });
}

/** Opens the teacher picker and takes the incoming teacher. */
async function chooseIncoming() {
  await userEvent.click(screen.getByRole('combobox', { name: /teacher taking over/i }));
  await userEvent.click(await screen.findByRole('button', { name: /T-2627-002/ }));
}

describe('teacher handover dialog', () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => stubReads());

  it('shows what will move before anything moves', async () => {
    renderWithProviders(
      <TeacherHandoverDialog open onOpenChange={() => {}} teacher={outgoing} />,
    );

    // The office is checking this against a conversation they had with the head,
    // not against the screen — so the lessons and the room are named, not counted.
    expect(await screen.findByText(/2 lesson\(s\) on the timetable/i)).toBeInTheDocument();
    expect(screen.getByText(/ຄະນິດສາດ · m4\/ກ/)).toBeInTheDocument();
    expect(screen.getByText(/32 students/)).toBeInTheDocument();
    // And the one thing a handover cannot do for them.
    expect(screen.getByText(/login is still active/i)).toBeInTheDocument();
  });

  it('sends the whole handover, not whichever half was remembered', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({
      fromTeacherId: outgoing.id,
      toTeacherId: incoming.id,
      assignmentsMoved: 2,
      homeroomsMoved: 1,
      subjectGroupsMoved: 0,
      resigned: true,
    });

    renderWithProviders(
      <TeacherHandoverDialog open onOpenChange={() => {}} teacher={outgoing} />,
    );
    await screen.findByText(/2 lesson\(s\) on the timetable/i);
    await chooseIncoming();
    await userEvent.click(screen.getByRole('button', { name: /^hand over$/i }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]![0]).toBe(`/teachers/${outgoing.id}/handover`);
    // Lessons, homeroom and the status together: the whole point is that the
    // office cannot leave one of them behind by forgetting a tick.
    expect(post.mock.calls[0]![1]).toMatchObject({
      toTeacherId: incoming.id,
      assignments: true,
      homerooms: true,
      resign: true,
      // A department headship is a decision, not a consequence.
      subjectGroups: false,
    });
  });

  it('lets a temporary handover leave the status alone', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({
      fromTeacherId: outgoing.id,
      toTeacherId: incoming.id,
      assignmentsMoved: 2,
      homeroomsMoved: 1,
      subjectGroupsMoved: 0,
      resigned: false,
    });

    renderWithProviders(
      <TeacherHandoverDialog open onOpenChange={() => {}} teacher={outgoing} />,
    );
    await screen.findByText(/2 lesson\(s\) on the timetable/i);
    await chooseIncoming();
    await userEvent.click(screen.getByRole('checkbox', { name: /as resigned/i }));
    await userEvent.click(screen.getByRole('button', { name: /^hand over$/i }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]![1]).toMatchObject({ resign: false });
  });

  it('will not submit for a teacher who holds nothing', async () => {
    stubReads({ ...HOLDS, assignments: [], homerooms: [], subjectGroups: [] });
    const post = vi.spyOn(apiClient, 'post');

    renderWithProviders(
      <TeacherHandoverDialog open onOpenChange={() => {}} teacher={outgoing} />,
    );

    expect(await screen.findByText(/nothing to hand over/i)).toBeInTheDocument();
    // Held closed rather than left to submit into a refusal: a button that fails
    // teaches people to ignore the message that comes back.
    expect(screen.getByRole('button', { name: /^hand over$/i })).toBeDisabled();
    expect(post).not.toHaveBeenCalled();
  });
});
