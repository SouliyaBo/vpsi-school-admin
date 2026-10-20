import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClient from '@/lib/api-client';
import * as saveBlobModule from '@/lib/save-blob';
import { paginated, renderWithProviders } from '@/test/utils';
import { QuestionEditor, withoutImageToken } from './components/QuestionEditor';
import { ResultsPanel } from './components/ResultsPanel';
import { ScanPanel } from './components/ScanPanel';
import { SetsPanel } from './components/SetsPanel';
import { ExamPaperDetailPage } from './pages/ExamPaperDetailPage';
import { ExamPapersPage } from './pages/ExamPapersPage';

/**
 * ຈັດການບົດສອບປາລະໄນ — the shuffle itself is the API's and is asserted there.
 * What the screens are answerable for: that what the reader could not place
 * is put in front of the teacher, that the answer they choose is what goes
 * back, that a draw sends the two things a teacher decides, and that the
 * seat plan shows who holds which set before anything is printed.
 */

const PAPER = {
  id: 'paper-1',
  title: 'ບົດສອບ ພູມສາດ ມ.4',
  createdById: { id: 'user-1', username: 'boun' },
  subjectId: { id: 'sub-1', code: 'GEO', nameLo: 'ພູມສາດ' },
  classroomId: { id: 'room-1', name: 'ມ.4/ກ' },
  semesterId: null,
  source: { key: 'exam-papers/paper-1/source.docx', filename: 'geo.docx', sizeBytes: 1200 },
  preamble: 'ໂຮງຮຽນ ມ.ສ ນານາຊາດ ວຽງຈັນພັດທະນາ',
  questionCount: 2,
  optionLabelStyle: 'latin',
  warnings: [{ code: 'noAnswer', question: 2, detail: null }],
  variantCount: 4,
  shuffleOptions: true,
  seed: null,
  variants: [],
  generatedAt: null,
  questions: [
    {
      key: 'q1',
      section: null,
      text: 'ປະເທດລາວຕັ້ງຢູ່ທິດໃດຂອງທະວີບອາຊີ?',
      images: [],
      options: [
        { text: 'ທິດໃຕ້', images: [] },
        { text: 'ທິດເໜືອ', images: [] },
        { text: 'ທິດຕາເວັນອອກສຽງໃຕ້', images: [] },
        { text: 'ທິດຕາເວັນອອກສຽງເໜືອ', images: [] },
      ],
      correctIndex: 2,
      lockOptions: false,
    },
    {
      key: 'q2',
      section: null,
      text: 'ປະເທດລາວມີຊາຍແດນຮ່ວມກັບຈັກປະເທດ?',
      images: [],
      options: [
        { text: '3 ປະເທດ', images: [] },
        { text: '4 ປະເທດ', images: [] },
        { text: '5 ປະເທດ', images: [] },
        { text: 'ຖືກທຸກຂໍ້', images: [] },
      ],
      correctIndex: null,
      lockOptions: true,
    },
  ],
  createdAt: '2026-09-17T08:00:00.000Z',
  updatedAt: '2026-09-17T08:00:00.000Z',
};

const DRAWN = {
  ...PAPER,
  seed: 4242,
  generatedAt: '2026-09-17T09:00:00.000Z',
  variants: [
    {
      label: 'A',
      questionOrder: [1, 0],
      optionOrders: [
        [0, 1, 2, 3],
        [3, 2, 1, 0],
      ],
    },
    {
      label: 'B',
      questionOrder: [0, 1],
      optionOrders: [
        [1, 0, 3, 2],
        [0, 1, 2, 3],
      ],
    },
  ],
};

const SEAT_PLAN = {
  classroom: { id: 'room-1', name: 'ມ.4/ກ' },
  columns: 2,
  sets: ['A', 'B'],
  seats: [
    { rollNumber: 1, studentCode: '0801', studentNameLo: 'ນາງ ຄຳ', row: 0, column: 0, set: 'A' },
    { rollNumber: 2, studentCode: '0802', studentNameLo: 'ທ້າວ ບຸນ', row: 0, column: 1, set: 'B' },
    { rollNumber: 3, studentCode: '0803', studentNameLo: 'ນາງ ສີ', row: 1, column: 0, set: 'B' },
  ],
};

const RESPONSES = {
  classroom: { id: 'room-1', name: 'ມ.4/ກ' },
  totalPoints: 6,
  monthly: {
    subject: { id: 'sub-1', nameLo: 'ພູມສາດ' },
    markedSubjects: [{ id: 'sub-1', nameLo: 'ພູມສາດ', testMax: 6 }],
    semester: { id: 'sem-1', nameLo: 'ພາກຮຽນ 1', number: 1 },
    months: [9, 10, 11],
    testMax: 6,
  },
  questionCount: 2,
  optionLabelStyle: 'latin',
  sets: ['A', 'B'],
  rows: [
    {
      studentId: 'stu-1',
      studentCode: '0801',
      studentNameLo: 'ນາງ ຄຳ',
      rollNumber: 1,
      response: {
        id: 'resp-1',
        setLabel: 'A',
        answers: [2, null],
        correctCount: 1,
        totalQuestions: 1,
        points: 6,
        source: 'manual',
        updatedAt: '2026-09-18T08:00:00.000Z',
      },
    },
    {
      studentId: 'stu-2',
      studentCode: '0802',
      studentNameLo: 'ທ້າວ ບຸນ',
      rollNumber: 2,
      response: null,
    },
  ],
  summary: {
    marked: 1,
    students: 2,
    averageCorrect: 1,
    averagePoints: 6,
    highestCorrect: 1,
    lowestCorrect: 1,
    questions: [
      { original: 1, text: 'ປະເທດລາວຕັ້ງຢູ່ທິດໃດຂອງທະວີບອາຊີ?', correct: 1, hasAnswer: true },
      { original: 2, text: 'ປະເທດລາວມີຊາຍແດນຮ່ວມກັບຈັກປະເທດ?', correct: 0, hasAnswer: false },
    ],
  },
};

const SCAN = {
  id: 'scan-1',
  status: 'pending',
  filename: 'IMG_0001.jpg',
  image: { width: 1000, height: 1400 },
  imageUrl: 'https://example.test/scan-1.jpg',
  studentId: null,
  studentCode: '0802',
  studentNameLo: null,
  setLabel: 'B',
  qr: null,
  codeFromBubbles: '0802',
  answers: [3, null],
  questions: [
    {
      number: 1,
      marked: 3,
      flag: 'ok',
      darkness: [0.05, 0.04, 0.06, 0.92],
      centres: [
        { x: 100, y: 500 },
        { x: 130, y: 500 },
        { x: 160, y: 500 },
        { x: 190, y: 500 },
      ],
    },
    {
      number: 2,
      marked: null,
      flag: 'double',
      darkness: [0.7, 0.66, 0.05, 0.04],
      centres: [
        { x: 100, y: 530 },
        { x: 130, y: 530 },
        { x: 160, y: 530 },
        { x: 190, y: 530 },
      ],
    },
  ],
  corners: [
    { x: 50, y: 50 },
    { x: 950, y: 50 },
    { x: 50, y: 1350 },
    { x: 950, y: 1350 },
  ],
  contrast: 200,
  responseId: null,
  createdAt: '2026-09-18T09:00:00.000Z',
};

let permits: (resource: string, action?: string) => boolean = () => true;

vi.mock('@/features/auth/hooks', () => ({
  useCan: () => (resource: string, action?: string) => permits(resource, action),
  useCurrentUser: () => ({
    username: 'boun',
    personType: 'teacher',
    personId: 'teacher-1',
    permissions: [],
  }),
  useSeesEveryStudent: () => true,
}));

function stubReads(paper: unknown = PAPER): void {
  vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    if (url === '/exam-papers') return paginated([paper]) as never;
    if (url === '/exam-papers/paper-1/seat-plan') return SEAT_PLAN as never;
    if (url === '/exam-papers/paper-1/responses') return RESPONSES as never;
    if (url === '/exam-papers/paper-1/scans') return [SCAN] as never;
    if (url.startsWith('/exam-papers/')) return paper as never;
    return paginated([]) as never;
  });
}

describe('the list', () => {
  beforeEach(() => {
    permits = () => true;
    stubReads();
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows each paper with how far it has got, and offers the upload', async () => {
    renderWithProviders(<ExamPapersPage />);

    await screen.findByText('ບົດສອບ ພູມສາດ ມ.4');
    const row = screen.getAllByRole('row')[1];
    expect(row).toHaveTextContent('ບົດສອບ ພູມສາດ ມ.4');
    expect(row).toHaveTextContent('ພູມສາດ · ມ.4/ກ');
    expect(row).toHaveTextContent('2 questions');
    expect(row).toHaveTextContent('No sets yet');

    await userEvent.click(screen.getAllByRole('button', { name: 'Upload paper' })[0]);
    expect(await screen.findByRole('dialog')).toHaveTextContent('Upload a paper from Word');
  });

  it('hides the upload from somebody who may only read', async () => {
    permits = (_resource, action) => action === 'read';
    renderWithProviders(<ExamPapersPage />);
    await screen.findByText('ບົດສອບ ພູມສາດ ມ.4');
    expect(screen.queryByRole('button', { name: 'Upload paper' })).not.toBeInTheDocument();
  });
});

describe('the review', () => {
  beforeEach(() => {
    permits = () => true;
    stubReads();
  });
  afterEach(() => vi.restoreAllMocks());

  it('puts what the reader could not place in front of the teacher', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/exam-papers/:id" element={<ExamPaperDetailPage />} />
      </Routes>,
      { route: '/exam-papers/paper-1' },
    );

    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent('Question 2: no bold answer was found');
    // The question itself is flagged too, and its lock — set by the reader
    // for ຖືກທຸກຂໍ້ — is on.
    expect(screen.getByText('No answer chosen')).toBeInTheDocument();
    const locks = screen.getAllByRole('switch', { name: 'Lock option order' });
    expect(locks[0]).not.toBeChecked();
    expect(locks[1]).toBeChecked();
  });

  it('sends back the answer the teacher chose, and the whole list with it', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockImplementation(async () => PAPER as never);
    renderWithProviders(<QuestionEditor paper={PAPER as never} />);

    const save = screen.getByRole('button', { name: 'Save questions' });
    expect(save).toBeDisabled();

    // Question 2's option C — "5 ປະເທດ" — is the right one.
    await userEvent.click(screen.getAllByRole('radio', { name: 'Correct C' })[1]);
    expect(save).toBeEnabled();
    await userEvent.click(save);

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    const [url, body] = patch.mock.calls[0] as [
      string,
      { questions: { key: string; correctIndex: number | null; lockOptions: boolean }[] },
    ];
    expect(url).toBe('/exam-papers/paper-1');
    expect(body.questions.map((q) => [q.key, q.correctIndex, q.lockOptions])).toEqual([
      ['q1', 2, false],
      ['q2', 2, true],
    ]);
  });
});

describe('the sets', () => {
  beforeEach(() => {
    permits = () => true;
  });
  afterEach(() => vi.restoreAllMocks());

  it('draws with the two things the teacher decides — how many, and whether the letters move', async () => {
    stubReads();
    const post = vi.spyOn(apiClient, 'post').mockImplementation(async () => DRAWN as never);
    renderWithProviders(<SetsPanel paper={PAPER as never} />);

    await userEvent.clear(screen.getByLabelText('Number of sets'));
    await userEvent.type(screen.getByLabelText('Number of sets'), '3');
    await userEvent.click(screen.getByRole('switch', { name: 'Shuffle the options A–D too' }));
    await userEvent.click(screen.getByRole('button', { name: 'Draw sets' }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][0]).toBe('/exam-papers/paper-1/generate');
    expect(post.mock.calls[0][1]).toEqual({ count: 3, shuffleOptions: false });
  });

  it('saves a Word download as .docx even when the API’s file name cannot be read', async () => {
    stubReads(DRAWN);
    // The header is what a cross-origin response hides from a script unless
    // the API exposes it — an older deployment does not.
    vi.spyOn(apiClient.apiClient, 'get').mockResolvedValue({
      data: new Blob(['docx']),
      headers: {},
    } as never);
    const save = vi.spyOn(saveBlobModule, 'saveBlob').mockImplementation(() => {});
    renderWithProviders(<SetsPanel paper={DRAWN as never} />);

    const wordButtons = screen.getAllByRole('button', { name: 'Word' });
    await userEvent.click(wordButtons[1]);

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][1]).toBe('ບົດສອບ ພູມສາດ ມ.4／ຊຸດ A.docx');
  });

  it('keeps the files behind the draw, then shows who holds which set', async () => {
    stubReads(DRAWN);
    const { rerender } = renderWithProviders(<SetsPanel paper={PAPER as never} />);
    expect(screen.getByRole('button', { name: 'Answer key (all sets)' })).toBeDisabled();

    rerender(<SetsPanel paper={DRAWN as never} />);
    expect(screen.getByRole('button', { name: 'Answer key (all sets)' })).toBeEnabled();
    expect(screen.getByText('Set A')).toBeInTheDocument();
    expect(screen.getByText('Set B')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Show plan' }));
    await screen.findByText('ນາງ ຄຳ');
    const rows = within(screen.getAllByRole('table')[1]).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('ນາງ ຄຳ');
    expect(rows[1]).toHaveTextContent('A');
    expect(rows[3]).toHaveTextContent('ນາງ ສີ');
    expect(rows[3]).toHaveTextContent('B');
  });
});

describe('the results', () => {
  beforeEach(() => {
    permits = () => true;
    stubReads(DRAWN);
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows each sheet as letters, and sends a keyed sheet back as letter indexes for its set', async () => {
    const put = vi.spyOn(apiClient, 'put').mockImplementation(async () => ({}) as never);
    renderWithProviders(<ResultsPanel paper={DRAWN as never} />);

    // The stored sheet reads back as the letters the teacher typed.
    const stored = await screen.findByLabelText('Answers ນາງ ຄຳ');
    expect(stored).toHaveValue('C-');
    expect(screen.getByText('1/2 keyed in')).toBeInTheDocument();

    // Key in the second pupil: set B, "d b".
    const field = screen.getByLabelText('Answers ທ້າວ ບຸນ');
    await userEvent.type(field, 'd b');
    const rows = screen.getAllByRole('row');
    await userEvent.click(within(rows[2]).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put.mock.calls[0][0]).toBe('/exam-papers/paper-1/responses/stu-2');
    expect(put.mock.calls[0][1]).toEqual({ setLabel: 'A', answers: [3, 1] });
  });

  it('refuses more letters than the paper has questions', async () => {
    renderWithProviders(<ResultsPanel paper={DRAWN as never} />);
    const field = await screen.findByLabelText('Answers ທ້າວ ບຸນ');
    await userEvent.type(field, 'ABC');
    expect(screen.getByText('More than 2 answers typed')).toBeInTheDocument();
    const rows = screen.getAllByRole('row');
    expect(within(rows[2]).getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('names the most-missed question by the teacher’s own numbering, skipping ones without a key', async () => {
    renderWithProviders(<ResultsPanel paper={DRAWN as never} />);
    await screen.findByText('Most missed questions (by the teacher’s numbering)');
    expect(screen.getByText('1/1 correct')).toBeInTheDocument();
    expect(screen.queryByText('ປະເທດລາວມີຊາຍແດນຮ່ວມກັບຈັກປະເທດ?')).not.toBeInTheDocument();
  });
});

describe('sending marks to the monthly sheet', () => {
  beforeEach(() => {
    permits = () => true;
  });
  afterEach(() => vi.restoreAllMocks());

  it('sends the keyed points into the chosen month’s ກວດກາ column', async () => {
    stubReads(DRAWN);
    const post = vi
      .spyOn(apiClient, 'post')
      .mockImplementation(async () => ({ saved: 1, skipped: 0, errors: [] }) as never);
    renderWithProviders(<ResultsPanel paper={DRAWN as never} />);

    await screen.findByLabelText('Answers ນາງ ຄຳ');
    await userEvent.click(screen.getByRole('button', { name: 'Send marks' }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][0]).toBe('/exam-papers/paper-1/push-to-monthly-marks');
    expect(post.mock.calls[0][1]).toEqual({ classroomId: 'room-1', month: 9 });
    expect(await screen.findByText('Sent to the monthly sheet: 1 pupils')).toBeInTheDocument();
  });

  it('asks which subject a paper for a split ສາຍວິຊາ sends its points to', async () => {
    // A ສັງຄົມ paper: written as one, marked as the three it splits into.
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/exam-papers/paper-1/responses') {
        return {
          ...RESPONSES,
          monthly: {
            ...RESPONSES.monthly,
            subject: { id: 'social', nameLo: 'ສັງຄົມ' },
            markedSubjects: [
              { id: 'civ', nameLo: 'ສຶກສາພົນລະເມືອງ', testMax: 5 },
              { id: 'geo', nameLo: 'ພູມສາດ', testMax: 5 },
              { id: 'hist', nameLo: 'ປະຫວັດສາດ', testMax: 5 },
            ],
          },
        } as never;
      }
      return paginated([]) as never;
    });
    renderWithProviders(<ResultsPanel paper={DRAWN as never} />);

    expect(
      await screen.findByText(
        'ສັງຄົມ is marked as several subjects — choose which one the marks go to',
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Send to subject')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send marks' })).toBeDisabled();
  });

  it('says why a send cannot happen before the button is pressed', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/exam-papers/paper-1/responses') {
        return { ...RESPONSES, totalPoints: 20 } as never;
      }
      return paginated([]) as never;
    });
    renderWithProviders(<ResultsPanel paper={{ ...DRAWN, totalPoints: 20 } as never} />);

    expect(
      await screen.findByText(
        'A total of 20 exceeds the ກວດກາ column (6) — set a total of at most 6 first',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send marks' })).toBeDisabled();
  });
});

describe('scanning', () => {
  beforeEach(() => {
    permits = () => true;
    stubReads(DRAWN);
  });
  afterEach(() => vi.restoreAllMocks());

  it('uploads the chosen photos as one multipart request', async () => {
    const post = vi.spyOn(apiClient.apiClient, 'post').mockResolvedValue({ data: [SCAN] } as never);
    renderWithProviders(<ScanPanel paper={DRAWN as never} view={RESPONSES as never} />);

    const input = screen.getByLabelText('Choose photos', { selector: 'input' });
    await userEvent.upload(input, [
      new File(['a'], 'IMG_0001.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'IMG_0002.jpg', { type: 'image/jpeg' }),
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Upload 2 photos' }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [url, body] = post.mock.calls[0] as [string, FormData];
    expect(url).toBe('/exam-papers/paper-1/scans');
    expect(body.getAll('files')).toHaveLength(2);
  });

  it('piles up photos taken one at a time with the camera', async () => {
    renderWithProviders(<ScanPanel paper={DRAWN as never} view={RESPONSES as never} />);
    const camera = screen.getByLabelText('Take photo', { selector: 'input' });
    expect(camera).toHaveAttribute('capture', 'environment');
    expect(camera).not.toHaveAttribute('multiple');

    await userEvent.upload(camera, new File(['a'], 'IMG_1.jpg', { type: 'image/jpeg' }));
    await userEvent.upload(camera, new File(['b'], 'IMG_2.jpg', { type: 'image/jpeg' }));
    expect(screen.getByRole('button', { name: 'Upload 2 photos' })).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('button', { name: 'Remove this photo' })[0]);
    expect(screen.getByRole('button', { name: 'Upload 1 photos' })).toBeInTheDocument();
  });

  it('lists what the reader proposed and what it was unsure of', async () => {
    renderWithProviders(<ScanPanel paper={DRAWN as never} view={RESPONSES as never} />);
    expect(await screen.findByText('Pupil unknown — choose one')).toBeInTheDocument();
    expect(screen.getByText(/Set B · 1 to check · IMG_0001.jpg/)).toBeInTheDocument();
    expect(screen.getByText('To review')).toBeInTheDocument();
  });

  it('confirms a reviewed sheet with the teacher’s pupil, set and corrected answers', async () => {
    const patch = vi
      .spyOn(apiClient, 'patch')
      .mockResolvedValue({ ...SCAN, status: 'confirmed' } as never);
    renderWithProviders(<ScanPanel paper={DRAWN as never} view={RESPONSES as never} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Review' }));
    const dialog = await screen.findByRole('dialog');
    // The reader read 2 as a double mark; the teacher settles it as B.
    await userEvent.click(within(dialog).getByRole('button', { name: '2 B' }));
    // And names the pupil the reader could not.
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Pupil' }));
    await userEvent.click(await screen.findByRole('option', { name: '2 · ທ້າວ ບຸນ' }));
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Confirm and save the mark' }),
    );

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch.mock.calls[0][0]).toBe('/exam-papers/paper-1/scans/scan-1');
    expect(patch.mock.calls[0][1]).toEqual({
      studentId: 'stu-2',
      setLabel: 'B',
      answers: [3, 1],
      confirm: true,
    });
  });
});

describe('formulas in the text', () => {
  beforeEach(() => {
    permits = () => true;
  });
  afterEach(() => vi.restoreAllMocks());

  it('draws a $…$ formula under the field as the teacher types, and shows bad TeX in red', async () => {
    renderWithProviders(<QuestionEditor paper={PAPER as never} />);
    const stem = screen.getAllByRole('textbox', { name: 'Question' })[0];
    await userEvent.clear(stem);
    await userEvent.type(stem, 'ໃຫ້ $x^2$ ແລ້ວ');

    // KaTeX sets the formula as markup; the words stay words.
    const preview = stem.parentElement!.querySelector('.katex');
    expect(preview).not.toBeNull();
    expect(preview!.textContent).toContain('x');

    await userEvent.clear(stem);
    // `{` opens a key descriptor to user-event; doubled, it is the character.
    await userEvent.type(stem, 'ໃຫ້ $\\frac{{a}{{b$ ແລ້ວ');
    expect(stem.parentElement!.querySelector('.katex')).toBeNull();
    expect(screen.getByTitle('LaTeX')).toHaveTextContent('$\\frac{a}{b$');
  });
});

describe('pictures in the text', () => {
  it('drops the removed picture’s token and renumbers the ones after it', () => {
    expect(withoutImageToken('ໃຫ້ ⟦1⟧ ແລະ ⟦2⟧ ແລ້ວ ⟦3⟧', 1)).toBe('ໃຫ້ ⟦1⟧ ແລະ  ແລ້ວ ⟦2⟧');
    expect(withoutImageToken('⟦1⟧', 0)).toBe('');
  });
});
