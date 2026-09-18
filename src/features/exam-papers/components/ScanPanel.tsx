import { Camera, CheckCircle2, ImagePlus, ScanLine, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { notify } from '@/lib/toast';
import type { ExamPaper } from '@/types/entities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  OPTION_LETTERS,
  useDeleteScan,
  useScans,
  useUpdateScan,
  useUploadScans,
  type ExamScan,
  type ResponsesView,
  type ScanFlag,
} from '../api';

/**
 * Reading the sheets from photographs.
 *
 * Upload a stack; each photo comes back as a scan with the reader's
 * proposal and its doubts. The review shows the photo with the reader's
 * eyes drawn on it — a ring on every bubble it looked at, filled where it
 * saw ink — and the teacher confirms or corrects by clicking the photo.
 * Only a confirmed scan becomes a mark.
 */

interface Props {
  paper: ExamPaper;
  view: ResponsesView;
  readOnly?: boolean;
}

const ACCEPT = 'image/*,.jpg,.jpeg,.png,.heic';

export function ScanPanel({ paper, view, readOnly = false }: Props) {
  const { t } = useTranslation();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const scans = useScans(paper.id);
  const uploadScans = useUploadScans();
  const deleteScan = useDeleteScan();

  const reviewed = scans.data?.find((scan) => scan.id === reviewing) ?? null;

  function addFiles(next: File[]) {
    if (next.length > 0) setFiles((current) => [...current, ...next]);
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, i) => i !== index));
  }

  function upload() {
    if (files.length === 0) return;
    uploadScans.mutate(
      { id: paper.id, files, onProgress: setProgress },
      {
        onSuccess: (result) => {
          notify.success(t('examPaper.scanUploaded', { count: result.length }));
          setFiles([]);
        },
        onSettled: () => setProgress(null),
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScanLine className="size-4" />
          {t('examPaper.scanTitle')}
        </CardTitle>
        <CardDescription>{t('examPaper.scanDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-3">
            {/* Two inputs on purpose: a phone offers its camera only for a
                single-file input, and hides it the moment `multiple` is set.
                So the camera takes one sheet at a time and the pile grows;
                the library picker takes many at once. */}
            <Button type="button" variant="outline" onClick={() => cameraRef.current?.click()}>
              <Camera />
              {t('examPaper.scanTakePhoto')}
            </Button>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              aria-label={t('examPaper.scanTakePhoto')}
              onChange={(event) => {
                addFiles(Array.from(event.target.files ?? []));
                event.target.value = '';
              }}
            />
            <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
              <ImagePlus />
              {t('examPaper.scanPick')}
            </Button>
            <input
              id={inputId}
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              multiple
              className="sr-only"
              aria-label={t('examPaper.scanPick')}
              onChange={(event) => {
                addFiles(Array.from(event.target.files ?? []));
                event.target.value = '';
              }}
            />
            {files.length > 0 && (
              <>
                <Button type="button" disabled={uploadScans.isPending} onClick={upload}>
                  <Upload />
                  {t('examPaper.scanUpload', { count: files.length })}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={uploadScans.isPending}
                  onClick={() => setFiles([])}
                >
                  <X />
                  {t('examPaper.scanClearFiles')}
                </Button>
              </>
            )}
            {progress !== null && (
              <div className="flex basis-full items-center gap-2">
                <Progress value={progress} className="max-w-xs" />
                <span className="text-xs text-muted-foreground">
                  {t('examPaper.scanUploading', { percent: progress })}
                </span>
              </div>
            )}
            {files.length > 0 && progress === null && (
              <ul className="flex basis-full flex-wrap gap-2">
                {files.map((file, index) => (
                  <li key={`${file.name}-${index}`}>
                    <FilePreview file={file} onRemove={() => removeFile(index)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {scans.data && scans.data.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('examPaper.scanEmpty')}</p>
        )}

        {scans.data && scans.data.length > 0 && (
          <ul className="divide-y">
            {scans.data.map((scan) => (
              <ScanRow
                key={scan.id}
                scan={scan}
                readOnly={readOnly}
                onReview={() => setReviewing(scan.id)}
                onDelete={() => deleteScan.mutate({ id: paper.id, scanId: scan.id })}
              />
            ))}
          </ul>
        )}
      </CardContent>

      {reviewed && (
        <ScanReviewDialog
          paper={paper}
          view={view}
          scan={reviewed}
          readOnly={readOnly}
          onClose={() => setReviewing(null)}
        />
      )}
    </Card>
  );
}

/** A thumbnail of a photo waiting to be uploaded, with a way to drop it. */
function FilePreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return (
    <div className="relative">
      {url ? (
        <img src={url} alt={file.name} className="h-16 w-12 rounded border object-cover" />
      ) : (
        <div className="h-16 w-12 rounded border bg-muted" />
      )}
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="absolute -end-2 -top-2 size-5"
        aria-label={t('examPaper.scanRemoveFile')}
        onClick={onRemove}
      >
        <X className="size-3" />
      </Button>
    </div>
  );
}

function flaggedCount(scan: ExamScan): number {
  return scan.questions.filter((q) => q.flag === 'faint' || q.flag === 'double').length;
}

function ScanRow({
  scan,
  readOnly,
  onReview,
  onDelete,
}: {
  scan: ExamScan;
  readOnly: boolean;
  onReview: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const flagged = flaggedCount(scan);
  return (
    <li className="flex flex-wrap items-center gap-3 py-2">
      {scan.imageUrl ? (
        <img src={scan.imageUrl} alt="" className="h-14 w-10 rounded border object-cover" />
      ) : (
        <div className="h-14 w-10 rounded border bg-muted" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {scan.studentNameLo ?? (
            <span className="text-amber-700 dark:text-amber-300">
              {t('examPaper.scanUnknownStudent')}
            </span>
          )}{' '}
          <span className="text-xs text-muted-foreground">{scan.studentCode ?? ''}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {scan.status === 'failed'
            ? t(`examPaper.scanFailure.${scan.failure ?? 'notAnImage'}`)
            : [
                scan.setLabel
                  ? t('examPaper.set', { label: scan.setLabel })
                  : t('examPaper.scanUnknownSet'),
                flagged > 0
                  ? t('examPaper.scanFlagged', { count: flagged })
                  : t('examPaper.scanClean'),
                scan.filename,
              ]
                .filter(Boolean)
                .join(' · ')}
        </p>
      </div>
      <Badge
        variant={
          scan.status === 'confirmed' ? 'default' : scan.status === 'failed' ? 'danger' : 'outline'
        }
      >
        {scan.status === 'confirmed' && <CheckCircle2 className="me-1 size-3" />}
        {t(
          scan.status === 'confirmed'
            ? 'examPaper.scanConfirmed'
            : scan.status === 'failed'
              ? 'examPaper.scanFailed'
              : 'examPaper.scanPending',
        )}
      </Badge>
      {scan.status !== 'failed' && (
        <Button
          type="button"
          size="sm"
          variant={scan.status === 'pending' ? 'default' : 'outline'}
          onClick={onReview}
        >
          {t('examPaper.scanReview')}
        </Button>
      )}
      {!readOnly && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={t('examPaper.scanDelete')}
          onClick={onDelete}
        >
          <Trash2 className="text-destructive" />
        </Button>
      )}
    </li>
  );
}

const FLAG_COLOUR: Record<ScanFlag, string> = {
  ok: '#16a34a',
  blank: '#9ca3af',
  faint: '#f59e0b',
  double: '#dc2626',
};

/**
 * The photograph with the reader's eyes drawn on it. The overlay is an SVG
 * in the photo's own pixel space, so it scales with the image however the
 * window is sized; a click on a ring is a click on that answer.
 */
function ScanReviewDialog({
  paper,
  view,
  scan,
  readOnly,
  onClose,
}: {
  paper: ExamPaper;
  view: ResponsesView;
  scan: ExamScan;
  readOnly: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const update = useUpdateScan();
  const letters = OPTION_LETTERS[view.optionLabelStyle];
  const [answers, setAnswers] = useState<(number | null)[]>(scan.answers);
  const [studentId, setStudentId] = useState<string>(scan.studentId ?? '');
  const [setLabel, setSetLabel] = useState<string>(scan.setLabel ?? '');
  const [onlyFlagged, setOnlyFlagged] = useState(true);
  const confirmed = scan.status === 'confirmed';
  const locked = readOnly || confirmed;

  useEffect(() => {
    setAnswers(scan.answers);
    setStudentId(scan.studentId ?? '');
    setSetLabel(scan.setLabel ?? '');
  }, [scan.id, scan.answers, scan.studentId, scan.setLabel]);

  const listed = useMemo(
    () =>
      scan.questions.filter(
        (q) => !onlyFlagged || q.flag === 'faint' || q.flag === 'double' || q.flag === 'blank',
      ),
    [scan.questions, onlyFlagged],
  );

  function choose(position: number, option: number | null) {
    if (locked) return;
    setAnswers((current) => current.map((value, i) => (i === position ? option : value)));
  }

  const width = scan.image?.width ?? 1;
  const height = scan.image?.height ?? 1;
  const r = Math.max(6, Math.round(width / 130));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{t('examPaper.scanReviewTitle')}</DialogTitle>
          <DialogDescription>{t('examPaper.scanReviewHint')}</DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-4 overflow-hidden lg:grid-cols-[1fr_20rem]">
          <div className="relative min-h-0 overflow-auto rounded border bg-muted/40">
            {scan.imageUrl && (
              <div className="relative" style={{ aspectRatio: `${width} / ${height}` }}>
                <img src={scan.imageUrl} alt="" className="block h-auto w-full" />
                <svg
                  className="absolute inset-0 h-full w-full"
                  viewBox={`0 0 ${width} ${height}`}
                  role="img"
                  aria-label={t('examPaper.scanReviewTitle')}
                >
                  {scan.corners.map((c, i) => (
                    <rect
                      key={i}
                      x={c.x - r}
                      y={c.y - r}
                      width={r * 2}
                      height={r * 2}
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth={Math.max(1, r / 4)}
                    />
                  ))}
                  {scan.questions.map((q) =>
                    q.centres.map((c, option) => {
                      const chosen = answers[q.number - 1] === option;
                      const colour = chosen ? '#16a34a' : FLAG_COLOUR[q.flag];
                      const unsure = q.flag === 'faint' || q.flag === 'double';
                      return (
                        <circle
                          key={`${q.number}-${option}`}
                          cx={c.x}
                          cy={c.y}
                          r={r}
                          fill={
                            chosen ? colour : unsure && q.darkness[option] > 0.25 ? colour : 'none'
                          }
                          fillOpacity={chosen ? 0.45 : 0.3}
                          stroke={chosen || unsure ? colour : 'rgba(0,0,0,0.18)'}
                          strokeWidth={
                            chosen || unsure ? Math.max(1.5, r / 3) : Math.max(0.6, r / 8)
                          }
                          className={locked ? undefined : 'cursor-pointer'}
                          onClick={() => choose(q.number - 1, chosen ? null : option)}
                        >
                          <title>{`${q.number} ${letters[option]} · ${Math.round(q.darkness[option] * 100)}%`}</title>
                        </circle>
                      );
                    }),
                  )}
                </svg>
              </div>
            )}
          </div>

          <div className="flex min-h-0 flex-col gap-3 overflow-auto">
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>
                {t('examPaper.scanQr')}:{' '}
                {scan.qr ? t('examPaper.scanQrRead') : t('examPaper.scanQrNone')}
                {scan.codeFromBubbles && ` · ${t('examPaper.scanCode')} ${scan.codeFromBubbles}`}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="scan-student">{t('examPaper.scanStudent')}</Label>
              <Select value={studentId} onValueChange={setStudentId} disabled={locked}>
                <SelectTrigger id="scan-student">
                  <SelectValue placeholder={t('examPaper.scanUnknownStudent')} />
                </SelectTrigger>
                <SelectContent>
                  {view.rows.map((row) => (
                    <SelectItem key={row.studentId} value={row.studentId}>
                      {row.rollNumber ?? '—'} · {row.studentNameLo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="scan-set">{t('examPaper.sets')}</Label>
              <Select value={setLabel} onValueChange={setSetLabel} disabled={locked}>
                <SelectTrigger id="scan-set">
                  <SelectValue placeholder={t('examPaper.scanUnknownSet')} />
                </SelectTrigger>
                <SelectContent>
                  {view.sets.map((label) => (
                    <SelectItem key={label} value={label}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={onlyFlagged}
                onCheckedChange={(checked) => setOnlyFlagged(checked === true)}
              />
              {t('examPaper.scanOnlyFlagged')}
            </label>

            <ol className="min-h-0 flex-1 space-y-1 overflow-auto text-sm">
              {listed.map((q) => {
                const position = q.number - 1;
                const unsure = q.flag === 'faint' || q.flag === 'double';
                return (
                  <li
                    key={q.number}
                    className={cn(
                      'flex items-center gap-2 rounded px-2 py-1',
                      unsure && 'bg-amber-50 dark:bg-amber-950',
                    )}
                  >
                    <span className="w-7 shrink-0 tabular-nums">{q.number}.</span>
                    <span className="w-16 shrink-0 text-xs text-muted-foreground">
                      {t(`examPaper.scanFlag.${q.flag}`)}
                    </span>
                    <div className="flex gap-1">
                      {letters.slice(0, q.centres.length).map((letter, option) => (
                        <Button
                          key={letter}
                          type="button"
                          size="sm"
                          variant={answers[position] === option ? 'default' : 'outline'}
                          className="h-7 w-7 p-0"
                          disabled={locked}
                          aria-label={`${q.number} ${letter}`}
                          onClick={() => choose(position, option)}
                        >
                          {letter}
                        </Button>
                      ))}
                      <Button
                        type="button"
                        size="sm"
                        variant={answers[position] === null ? 'secondary' : 'ghost'}
                        className="h-7 px-2 text-xs"
                        disabled={locked}
                        onClick={() => choose(position, null)}
                      >
                        {t('examPaper.scanBlank')}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        <DialogFooter>
          {confirmed ? (
            <Badge>
              <CheckCircle2 className="me-1 size-3" />
              {t('examPaper.scanConfirmed')}
            </Badge>
          ) : (
            !readOnly && (
              <Button
                type="button"
                disabled={!studentId || !setLabel || update.isPending}
                onClick={() =>
                  update.mutate(
                    {
                      id: paper.id,
                      scanId: scan.id,
                      body: { studentId, setLabel, answers, confirm: true },
                    },
                    {
                      onSuccess: () => {
                        notify.success(t('examPaper.scanConfirmedToast'));
                        onClose();
                      },
                    },
                  )
                }
              >
                <CheckCircle2 />
                {t('examPaper.scanConfirm')}
              </Button>
            )
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
