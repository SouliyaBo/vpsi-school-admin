import { FileDown, FileText, Grid3X3, KeyRound, Printer, Shuffle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useClassroomOptions } from '@/features/classrooms/api';
import { formatDate, refId, refObject } from '@/lib/utils';
import type { Classroom, ExamPaper } from '@/types/entities';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EntitySelect } from '@/components/common/EntitySelect';
import {
  useDownloadAnswerKey,
  useDownloadAnswerSheets,
  useDownloadSeatPlan,
  useDownloadSets,
  useGenerateSets,
  useSeatPlan,
} from '../api';

/**
 * Drawing the sets and getting them out of the building.
 *
 * Three cards: the draw, the files, the seat plan. The draw is a two-field
 * form because that is all a teacher decides — how many sets, and whether
 * the letters move too; the seed is shown, not asked for. The seat plan is
 * shown on screen before it is printed, because "who gets set C" is a
 * question asked at the door with the stack in hand.
 */

const MAX_SETS = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

interface Props {
  paper: ExamPaper;
  readOnly?: boolean;
}

export function SetsPanel({ paper, readOnly = false }: Props) {
  const { t } = useTranslation();
  const generate = useGenerateSets();
  const downloadSets = useDownloadSets();
  const downloadKey = useDownloadAnswerKey();
  const downloadSeatPlan = useDownloadSeatPlan();
  const downloadSheets = useDownloadAnswerSheets();
  const [blankInput, setBlankInput] = useState('2');
  const blank = clamp(Number(blankInput) || 0, 0, 50);

  // Held as typed, clamped when used: a controlled number that snaps to its
  // minimum the moment the field is cleared cannot be retyped.
  const [countInput, setCountInput] = useState(String(paper.variantCount || 4));
  const count = clamp(Number(countInput) || 1, 1, MAX_SETS);
  const [shuffleOptions, setShuffleOptions] = useState(paper.shuffleOptions ?? true);
  const [classroomId, setClassroomId] = useState<string | undefined>(
    refId(paper.classroomId) ?? undefined,
  );
  const [columnsInput, setColumnsInput] = useState('4');
  const columns = clamp(Number(columnsInput) || 1, 1, 12);
  const [showPlan, setShowPlan] = useState(false);

  const hasSets = paper.variants.length > 0;
  const seatPlan = useSeatPlan(showPlan ? paper.id : undefined, classroomId, columns);
  const useAnyClassroomOptions = (search: string) => useClassroomOptions(search);
  const busy =
    downloadSets.isPending ||
    downloadKey.isPending ||
    downloadSeatPlan.isPending ||
    downloadSheets.isPending;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shuffle className="size-4" />
            {t('examPaper.generateTitle')}
          </CardTitle>
          <CardDescription>{t('examPaper.generateDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="set-count">{t('examPaper.count')}</Label>
              <Input
                id="set-count"
                type="number"
                min={1}
                max={MAX_SETS}
                value={countInput}
                disabled={readOnly}
                onChange={(event) => setCountInput(event.target.value)}
                onBlur={() => setCountInput(String(count))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shuffle-options">{t('examPaper.shuffleOptions')}</Label>
              <div className="flex items-center gap-3 pt-2">
                <Switch
                  id="shuffle-options"
                  checked={shuffleOptions}
                  disabled={readOnly}
                  onCheckedChange={setShuffleOptions}
                />
                <span className="text-xs text-muted-foreground">
                  {t('examPaper.shuffleOptionsHint')}
                </span>
              </div>
            </div>
          </div>

          {hasSets && (
            <p className="text-sm text-muted-foreground">
              {t('examPaper.generatedAt')}: {formatDate(paper.generatedAt)} ·{' '}
              {t('examPaper.setCount', { count: paper.variants.length })} · {t('examPaper.seed')}{' '}
              <span className="font-mono">{paper.seed}</span>
              <br />
              <span className="text-xs">{t('examPaper.seedHint')}</span>
            </p>
          )}

          {!readOnly && (
            <div className="space-y-2">
              <Button
                type="button"
                disabled={generate.isPending || paper.questions.length === 0}
                onClick={() => generate.mutate({ id: paper.id, body: { count, shuffleOptions } })}
              >
                <Shuffle />
                {hasSets ? t('examPaper.regenerate') : t('examPaper.generate')}
              </Button>
              {hasSets && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {t('examPaper.regenerateWarning')}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileDown className="size-4" />
            {t('examPaper.downloadsTitle')}
          </CardTitle>
          {!hasSets && <CardDescription>{t('examPaper.noSets')}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-3">
          <Table>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">{t('examPaper.allSets')}</TableCell>
                <TableCell className="text-end">
                  <DownloadButtons
                    disabled={!hasSets || busy}
                    onPdf={() =>
                      downloadSets.mutate({
                        id: paper.id,
                        title: paper.title,
                        format: 'pdf',
                        set: 'all',
                      })
                    }
                    onWord={() =>
                      downloadSets.mutate({
                        id: paper.id,
                        title: paper.title,
                        format: 'docx',
                        set: 'all',
                      })
                    }
                  />
                </TableCell>
              </TableRow>
              {paper.variants.map((variant) => (
                <TableRow key={variant.label}>
                  <TableCell>{t('examPaper.set', { label: variant.label })}</TableCell>
                  <TableCell className="text-end">
                    <DownloadButtons
                      disabled={busy}
                      onPdf={() =>
                        downloadSets.mutate({
                          id: paper.id,
                          title: paper.title,
                          format: 'pdf',
                          set: variant.label,
                        })
                      }
                      onWord={() =>
                        downloadSets.mutate({
                          id: paper.id,
                          title: paper.title,
                          format: 'docx',
                          set: variant.label,
                        })
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex flex-wrap items-center gap-3 border-t pt-3">
            <Button
              type="button"
              variant="outline"
              disabled={!hasSets || busy}
              onClick={() => downloadKey.mutate({ id: paper.id, title: paper.title })}
            >
              <KeyRound />
              {t('examPaper.answerKey')}
            </Button>
            <span className="text-xs text-muted-foreground">{t('examPaper.answerKeyHint')}</span>
          </div>
          {busy && <p className="text-xs text-muted-foreground">{t('examPaper.downloading')}</p>}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Grid3X3 className="size-4" />
            {t('examPaper.seatPlanTitle')}
          </CardTitle>
          <CardDescription>{t('examPaper.seatPlanDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <div className="space-y-2">
              <Label>{t('examPaper.classroom')}</Label>
              <EntitySelect
                label={t('examPaper.classroom')}
                value={classroomId ?? null}
                onChange={(value) => {
                  setClassroomId(value);
                  setShowPlan(false);
                }}
                useOptions={useAnyClassroomOptions}
                selectedLabel={
                  classroomId === refId(paper.classroomId)
                    ? refObject<Classroom>(paper.classroomId)?.name
                    : undefined
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="seat-columns">{t('examPaper.columns')}</Label>
              <Input
                id="seat-columns"
                type="number"
                min={1}
                max={12}
                className="w-28"
                value={columnsInput}
                onChange={(event) => setColumnsInput(event.target.value)}
                onBlur={() => setColumnsInput(String(columns))}
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!hasSets || !classroomId}
                onClick={() => setShowPlan(true)}
              >
                {t('examPaper.showSeatPlan')}
              </Button>
              <Button
                type="button"
                disabled={!hasSets || !classroomId || busy}
                onClick={() =>
                  downloadSeatPlan.mutate({
                    id: paper.id,
                    title: paper.title,
                    classroomId,
                    columns,
                  })
                }
              >
                <FileText />
                {t('examPaper.seatPlanPdf')}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {classroomId ? t('examPaper.columnsHint') : t('examPaper.selectClassroom')}
          </p>

          {/* The bubble sheets come off the same plan: the set on each
              pupil's sheet is the set on their desk. */}
          <div className="flex flex-wrap items-end gap-3 border-t pt-3">
            <div className="space-y-2">
              <Label htmlFor="blank-sheets">{t('examPaper.blankCount')}</Label>
              <Input
                id="blank-sheets"
                type="number"
                min={0}
                max={50}
                className="w-24"
                value={blankInput}
                onChange={(event) => setBlankInput(event.target.value)}
                onBlur={() => setBlankInput(String(blank))}
              />
            </div>
            <Button
              type="button"
              disabled={!hasSets || !classroomId || busy}
              onClick={() =>
                downloadSheets.mutate({
                  id: paper.id,
                  title: paper.title,
                  classroomId,
                  columns,
                  blank,
                })
              }
            >
              <Printer />
              {t('examPaper.answerSheets')}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!hasSets || busy}
              onClick={() =>
                downloadSheets.mutate({
                  id: paper.id,
                  title: paper.title,
                  columns,
                  blank: Math.max(1, blank),
                  blankOnly: true,
                })
              }
            >
              {t('examPaper.blankSheets')}
            </Button>
            <span className="basis-full text-xs text-muted-foreground">
              {t('examPaper.answerSheetsHint')}
            </span>
          </div>

          {showPlan && seatPlan.data && (
            <div className="space-y-4">
              <SeatGrid plan={seatPlan.data} />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">{t('examPaper.rollNumber')}</TableHead>
                    <TableHead>{t('examPaper.studentName')}</TableHead>
                    <TableHead className="w-16 text-center">{t('examPaper.row')}</TableHead>
                    <TableHead className="w-16 text-center">{t('examPaper.sets')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {seatPlan.data.seats.map((seat) => (
                    <TableRow key={seat.studentCode}>
                      <TableCell className="tabular-nums">{seat.rollNumber ?? '—'}</TableCell>
                      <TableCell>
                        {seat.studentNameLo}{' '}
                        <span className="text-xs text-muted-foreground">{seat.studentCode}</span>
                      </TableCell>
                      <TableCell className="text-center tabular-nums">{seat.row + 1}</TableCell>
                      <TableCell className="text-center font-semibold">{seat.set}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DownloadButtons({
  disabled,
  onPdf,
  onWord,
}: {
  disabled: boolean;
  onPdf: () => void;
  onWord: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="inline-flex gap-2">
      <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onPdf}>
        {t('examPaper.pdf')}
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onWord}>
        {t('examPaper.word')}
      </Button>
    </div>
  );
}

/** The room from the front: one tile per seat, the set in it and the roll number. */
function SeatGrid({
  plan,
}: {
  plan: {
    columns: number;
    seats: { rollNumber: number | null; set: string; studentCode: string }[];
  };
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <p className="text-center text-xs font-medium text-muted-foreground">
        {t('examPaper.front')}
      </p>
      <div
        className="mx-auto grid w-fit gap-1.5"
        style={{ gridTemplateColumns: `repeat(${plan.columns}, minmax(3.5rem, 1fr))` }}
      >
        {plan.seats.map((seat) => (
          <div
            key={seat.studentCode}
            className="rounded border bg-muted/40 px-2 py-1.5 text-center"
            title={seat.studentCode}
          >
            <div className="text-lg font-bold leading-tight">{seat.set}</div>
            <div className="text-[10px] text-muted-foreground">
              {seat.rollNumber ?? seat.studentCode}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
