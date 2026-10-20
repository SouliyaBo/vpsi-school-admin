import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, del, get, patch, post, put, upload } from '@/lib/api-client';
import { createCrudApi, createCrudHooks, type ListParams } from '@/lib/crud';
import { saveBlob } from '@/lib/save-blob';
import type { ExamImage, ExamPaper, ExamPaperSummary, ExamQuestion } from '@/types/entities';
import type { ExamOptionLabelStyle } from '@/types/enums';

/**
 * ບົດສອບປາລະໄນ — a multiple-choice paper from the teacher's Word file to
 * several printed sets.
 *
 * Upload, review, draw, print. The list and the detail are ordinary CRUD;
 * the rest are the three files the teacher walks into the room with — the
 * sets, the answer key, the seat plan — and the seat plan as data, so the
 * screen can show it before it is printed.
 */

export interface UploadExamPaperInput {
  file: File;
  title?: string;
  subjectId?: string | null;
  classroomId?: string | null;
  semesterId?: string | null;
  onProgress?: (percent: number) => void;
}

/** A question as the review page sends it back — pictures by their keys. */
export type ExamImageInput = Pick<
  ExamImage,
  'key' | 'mimeType' | 'widthPt' | 'heightPt' | 'descentPt'
>;

export type ExamQuestionInput = Omit<ExamQuestion, 'images' | 'options'> & {
  images?: ExamImageInput[];
  options: { text: string; images?: ExamImageInput[] }[];
};

export interface UpdateExamPaperInput {
  title?: string;
  subjectId?: string | null;
  classroomId?: string | null;
  semesterId?: string | null;
  preamble?: string;
  optionLabelStyle?: ExamOptionLabelStyle;
  totalPoints?: number | null;
  questions?: ExamQuestionInput[];
}

export interface GenerateSetsInput {
  count: number;
  shuffleOptions: boolean;
  seed?: number;
}

export interface ExamPaperListParams extends ListParams {
  subjectId?: string;
  classroomId?: string;
  semesterId?: string;
}

export interface SeatPlan {
  classroom: { id: string; name: string };
  columns: number;
  sets: string[];
  seats: {
    rollNumber: number | null;
    studentCode: string;
    studentNameLo: string;
    row: number;
    column: number;
    set: string;
  }[];
}

/** One pupil's sheet as the API keeps it. */
export interface ExamResponseView {
  id: string;
  setLabel: string;
  answers: (number | null)[];
  correctCount: number;
  totalQuestions: number;
  points: number | null;
  source: 'manual' | 'scan';
  updatedAt: string;
}

export interface ResponsesView {
  classroom: { id: string; name: string };
  totalPoints: number | null;
  /** Where the points can go: the ກວດກາ column of one of this term's months. */
  monthly: {
    subject: { id: string; nameLo: string } | null;
    /**
     * The subjects the points can be sent to — the paper's own, or, where it is
     * split (ສັງຄົມ → ພູມສາດ, ປະຫວັດສາດ …), the ones it splits into.
     */
    markedSubjects: {
      id: string;
      nameLo: string;
      /** What its ກວດກາ is out of — 5 for ພາສາລາວ and the social subjects, 6 else. */
      testMax: number;
    }[];
    semester: { id: string; nameLo: string; number: number } | null;
    months: number[];
    testMax: number;
  };
  questionCount: number;
  optionLabelStyle: ExamOptionLabelStyle;
  sets: string[];
  rows: {
    studentId: string;
    studentCode: string;
    studentNameLo: string;
    rollNumber: number | null;
    response: ExamResponseView | null;
  }[];
  summary: {
    marked: number;
    students: number;
    averageCorrect: number | null;
    averagePoints: number | null;
    highestCorrect: number | null;
    lowestCorrect: number | null;
    /** Per original question, how many marked sheets had it right. */
    questions: { original: number; text: string; correct: number; hasAnswer: boolean }[];
  };
}

export type ScanFlag = 'ok' | 'blank' | 'faint' | 'double';

export interface ScanQuestion {
  number: number;
  marked: number | null;
  flag: ScanFlag;
  darkness: number[];
  centres: { x: number; y: number }[];
}

/** One photographed sheet as the reader filed it, for the review page. */
export interface ExamScan {
  id: string;
  status: 'pending' | 'confirmed' | 'failed';
  failure?: 'notAnImage' | 'cornersNotFound' | 'lowContrast' | null;
  filename?: string | null;
  image?: { width: number; height: number } | null;
  imageUrl: string | null;
  studentId?: string | null;
  studentCode?: string | null;
  studentNameLo?: string | null;
  setLabel?: string | null;
  qr?: { paperId: string; set: string | null; studentId: string | null } | null;
  codeFromBubbles?: string | null;
  answers: (number | null)[];
  questions: ScanQuestion[];
  corners: { x: number; y: number }[];
  contrast?: number | null;
  responseId?: string | null;
  createdAt: string;
}

const crud = createCrudApi<ExamPaperSummary, never, UpdateExamPaperInput>('/exam-papers');

export const examPapersApi = {
  ...crud,
  detail: (id: string) => get<ExamPaper>(`/exam-papers/${id}`),
  upload: ({
    file,
    title,
    subjectId,
    classroomId,
    semesterId,
    onProgress,
  }: UploadExamPaperInput) => {
    const form = new FormData();
    form.append('file', file);
    if (title) form.append('title', title);
    if (subjectId) form.append('subjectId', subjectId);
    if (classroomId) form.append('classroomId', classroomId);
    if (semesterId) form.append('semesterId', semesterId);
    // Equations from MathType are drawn one by one on the server — a paper
    // of 140 takes about a minute.
    return upload<ExamPaper>('/exam-papers', form, onProgress, { timeoutMs: 5 * 60 * 1000 });
  },
  update: (id: string, body: UpdateExamPaperInput) => patch<ExamPaper>(`/exam-papers/${id}`, body),
  generate: (id: string, body: GenerateSetsInput) =>
    post<ExamPaper>(`/exam-papers/${id}/generate`, body),
  remove: (id: string) => del<void>(`/exam-papers/${id}`),
  sourceUrl: (id: string) => get<{ url: string | null }>(`/exam-papers/${id}/source`),
  seatPlan: (id: string, classroomId: string | undefined, columns: number) =>
    get<SeatPlan>(`/exam-papers/${id}/seat-plan`, { params: { classroomId, columns } }),
  responses: (id: string, classroomId: string | undefined) =>
    get<ResponsesView>(`/exam-papers/${id}/responses`, { params: { classroomId } }),
  saveResponse: (
    id: string,
    studentId: string,
    body: { setLabel: string; answers: (number | null)[] },
  ) => put<ExamResponseView>(`/exam-papers/${id}/responses/${studentId}`, body),
  deleteResponse: (id: string, studentId: string) =>
    del<void>(`/exam-papers/${id}/responses/${studentId}`),
  scans: (id: string) => get<ExamScan[]>(`/exam-papers/${id}/scans`),
  uploadScans: (id: string, files: File[], onProgress?: (percent: number) => void) => {
    const form = new FormData();
    for (const file of files) form.append('files', file);
    return upload<ExamScan[]>(`/exam-papers/${id}/scans`, form, onProgress, {
      timeoutMs: 5 * 60 * 1000,
    });
  },
  updateScan: (
    id: string,
    scanId: string,
    body: {
      studentId?: string | null;
      setLabel?: string | null;
      answers?: (number | null)[];
      confirm?: boolean;
    },
  ) => patch<ExamScan>(`/exam-papers/${id}/scans/${scanId}`, body),
  deleteScan: (id: string, scanId: string) => del<void>(`/exam-papers/${id}/scans/${scanId}`),
  pushToMonthlyMarks: (
    id: string,
    body: { classroomId?: string; subjectId?: string; month: number; overrideReason?: string },
  ) =>
    post<{ saved: number; skipped: number; errors: { studentId: string; reason: string }[] }>(
      `/exam-papers/${id}/push-to-monthly-marks`,
      body,
    ),
};

/**
 * A file the API renders, saved under the name the API chose — the title with
 * the set in it, which the teacher will recognise on the desktop later.
 *
 * `fallback` is what the file is called when that name cannot be read: the
 * browser shows a cross-origin script no header it has not been told to
 * expose, and an older API deployment does not expose this one. The fallback
 * carries the right extension, because a Word file saved as `.pdf` is a file
 * that will not open — which is worse than a plain name.
 */
async function downloadNamed(
  url: string,
  fallback: string,
  params?: Record<string, unknown>,
): Promise<void> {
  const response = await apiClient.get<Blob>(url, { params, responseType: 'blob' });
  const disposition = String(response.headers['content-disposition'] ?? '');
  const match = /filename\*=UTF-8''([^;]+)/.exec(disposition);
  saveBlob(response.data, match ? decodeURIComponent(match[1]) : fallback);
}

/**
 * A title as a file name — the same blocklist the API uses, and the fullwidth
 * solidus between the parts because a plain `/` does not survive a download.
 */
function fileSafe(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'exam';
}

const hooks = createCrudHooks<ExamPaperSummary, never, UpdateExamPaperInput>('exam-papers', crud);
export const examPaperKeys = hooks.keys;

export const useExamPapers = hooks.useList;
export const useDeleteExamPaper = hooks.useDelete;

export function useExamPaper(id: string | undefined) {
  return useQuery({
    queryKey: examPaperKeys.detail(id),
    queryFn: () => examPapersApi.detail(id!),
    enabled: Boolean(id),
  });
}

export function useUploadExamPaper() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UploadExamPaperInput) => examPapersApi.upload(input),
    meta: { successMessage: 'examPaper.uploaded' },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: examPaperKeys.all }),
  });
}

export function useUpdateExamPaper() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateExamPaperInput }) =>
      examPapersApi.update(id, body),
    meta: { successMessage: 'examPaper.saved' },
    onSuccess: (paper) => {
      queryClient.setQueryData(examPaperKeys.detail(paper.id), paper);
      void queryClient.invalidateQueries({ queryKey: examPaperKeys.all });
    },
  });
}

export function useGenerateSets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: GenerateSetsInput }) =>
      examPapersApi.generate(id, body),
    meta: { successMessage: 'examPaper.generated' },
    onSuccess: (paper) => {
      queryClient.setQueryData(examPaperKeys.detail(paper.id), paper);
      void queryClient.invalidateQueries({ queryKey: examPaperKeys.all });
    },
  });
}

export function useDownloadSets() {
  return useMutation({
    mutationFn: ({
      id,
      title,
      format,
      set,
    }: {
      id: string;
      title: string;
      format: 'pdf' | 'docx';
      set: string;
    }) =>
      downloadNamed(
        `/exam-papers/${id}/sets`,
        `${fileSafe(title)}／${set === 'all' ? 'ທຸກຊຸດ' : `ຊຸດ ${set}`}.${format}`,
        { format, set },
      ),
  });
}

export function useDownloadAnswerKey() {
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      downloadNamed(`/exam-papers/${id}/answer-key`, `${fileSafe(title)}／ເສີຍ.pdf`),
  });
}

export function useDownloadSeatPlan() {
  return useMutation({
    mutationFn: ({
      id,
      title,
      classroomId,
      columns,
    }: {
      id: string;
      title: string;
      classroomId?: string;
      columns: number;
    }) =>
      downloadNamed(`/exam-papers/${id}/seat-plan.pdf`, `${fileSafe(title)}／ແຈກຊຸດ.pdf`, {
        classroomId,
        columns,
      }),
  });
}

export function useDownloadAnswerSheets() {
  return useMutation({
    mutationFn: ({
      id,
      title,
      classroomId,
      columns,
      blank,
      blankOnly,
    }: {
      id: string;
      title: string;
      classroomId?: string;
      columns: number;
      blank: number;
      blankOnly?: boolean;
    }) =>
      downloadNamed(`/exam-papers/${id}/answer-sheets.pdf`, `${fileSafe(title)}／ເຈ້ຍຕອບ.pdf`, {
        classroomId,
        columns,
        blank,
        blankOnly: blankOnly ? 'true' : undefined,
      }),
  });
}

export function useResponses(id: string | undefined, classroomId: string | undefined) {
  return useQuery({
    queryKey: [...examPaperKeys.detail(id), 'responses', classroomId ?? null],
    queryFn: () => examPapersApi.responses(id!, classroomId),
    enabled: Boolean(id),
  });
}

export function useSaveResponse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      studentId,
      body,
    }: {
      id: string;
      studentId: string;
      body: { setLabel: string; answers: (number | null)[] };
    }) => examPapersApi.saveResponse(id, studentId, body),
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({
        queryKey: [...examPaperKeys.detail(variables.id), 'responses'],
      }),
  });
}

export function usePushToMonthlyMarks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: { classroomId?: string; subjectId?: string; month: number; overrideReason?: string };
    }) => examPapersApi.pushToMonthlyMarks(id, body),
    // The monthly sheet moved; whatever of it is on screen is stale.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['monthly-marks'] }),
  });
}

export function useScans(id: string | undefined) {
  return useQuery({
    queryKey: [...examPaperKeys.detail(id), 'scans'],
    queryFn: () => examPapersApi.scans(id!),
    enabled: Boolean(id),
  });
}

export function useUploadScans() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      files,
      onProgress,
    }: {
      id: string;
      files: File[];
      onProgress?: (percent: number) => void;
    }) => examPapersApi.uploadScans(id, files, onProgress),
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({ queryKey: [...examPaperKeys.detail(variables.id), 'scans'] }),
  });
}

export function useUpdateScan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      scanId,
      body,
    }: {
      id: string;
      scanId: string;
      body: Parameters<typeof examPapersApi.updateScan>[2];
    }) => examPapersApi.updateScan(id, scanId, body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: [...examPaperKeys.detail(variables.id), 'scans'],
      });
      // A confirmed scan is a new response.
      if (variables.body.confirm) {
        void queryClient.invalidateQueries({
          queryKey: [...examPaperKeys.detail(variables.id), 'responses'],
        });
      }
    },
  });
}

export function useDeleteScan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, scanId }: { id: string; scanId: string }) =>
      examPapersApi.deleteScan(id, scanId),
    meta: { successMessage: 'toast.deleted' },
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({ queryKey: [...examPaperKeys.detail(variables.id), 'scans'] }),
  });
}

export function useDeleteResponse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, studentId }: { id: string; studentId: string }) =>
      examPapersApi.deleteResponse(id, studentId),
    meta: { successMessage: 'toast.deleted' },
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({
        queryKey: [...examPaperKeys.detail(variables.id), 'responses'],
      }),
  });
}

/**
 * `"BCDA-B"` → `[1, 2, 3, 0, null, 1]` — one letter per printed question as
 * the teacher reads them off the sheet, `-` for a blank; the API does the
 * same with what it is sent, this is only so the count on screen is live.
 */
export function parseAnswerString(
  text: string,
  letters: readonly string[],
  count: number,
): (number | null)[] {
  const chars = [...text.toUpperCase()].filter((ch) => !/\s/.test(ch));
  return Array.from({ length: count }, (_, i) => {
    const ch = chars[i];
    if (ch === undefined) return null;
    const index = letters.findIndex((letter) => letter.toUpperCase() === ch);
    return index >= 0 ? index : null;
  });
}

/** The inverse, for showing a stored sheet in the field. */
export function answersToString(answers: (number | null)[], letters: readonly string[]): string {
  return answers.map((answer) => (answer === null ? '-' : (letters[answer] ?? '-'))).join('');
}

export function useSeatPlan(
  id: string | undefined,
  classroomId: string | undefined,
  columns: number,
) {
  return useQuery({
    queryKey: [...examPaperKeys.detail(id), 'seat-plan', classroomId ?? null, columns],
    queryFn: () => examPapersApi.seatPlan(id!, classroomId, columns),
    enabled: Boolean(id) && Boolean(classroomId),
  });
}

export function useSourceUrl(id: string | undefined) {
  return useMutation({
    mutationFn: async () => {
      const { url } = await examPapersApi.sourceUrl(id!);
      if (url) window.open(url, '_blank', 'noopener');
    },
  });
}

/** The letters a set prints, in the paper's style. */
export const OPTION_LETTERS: Record<ExamOptionLabelStyle, string[]> = {
  latin: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
  lao: ['ກ', 'ຂ', 'ຄ', 'ງ', 'ຈ', 'ສ', 'ຊ', 'ຍ'],
};
