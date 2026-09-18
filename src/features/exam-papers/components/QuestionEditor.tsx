import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Lock,
  Plus,
  Save,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { ExamPaper, ExamQuestion } from '@/types/entities';
import { EXAM_OPTION_LABEL_STYLES, type ExamOptionLabelStyle } from '@/types/enums';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { OPTION_LETTERS, useUpdateExamPaper, type ExamQuestionInput } from '../api';
import { hasMath, MathText } from './MathText';

/**
 * The review — what the reader made of the file, for the teacher to correct.
 *
 * The whole list is held locally and sent back whole on save: a question's
 * printed number is a position, so an edit that moves one is an edit to the
 * list, and one PATCH cannot leave the order ambiguous. The one thing checked
 * before save is the thing the answer key depends on — which option is
 * right — and even that is a warning, not a bar, because a teacher may want
 * the sets printed before they have finished the key.
 */

interface Draft {
  preamble: string;
  optionLabelStyle: ExamOptionLabelStyle;
  questions: ExamQuestion[];
}

function fromPaper(paper: ExamPaper): Draft {
  return {
    preamble: paper.preamble,
    optionLabelStyle: paper.optionLabelStyle,
    questions: paper.questions.map((question) => ({
      ...question,
      images: [...question.images],
      options: question.options.map((option) => ({ ...option, images: [...option.images] })),
    })),
  };
}

function newKey(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Takes picture `index` out of `text`: its `⟦n⟧` token goes, and the tokens
 * of the pictures after it move down one, so they still point at the right
 * picture once the list is shorter.
 */
export function withoutImageToken(text: string, index: number): string {
  return text.replace(/⟦(\d+)⟧/g, (token, n: string) => {
    const i = Number(n) - 1;
    if (i === index) return '';
    return i > index ? `⟦${i}⟧` : token;
  });
}

function toInput(question: ExamQuestion): ExamQuestionInput {
  const strip = (images: ExamQuestion['images']) =>
    images.map(({ key, mimeType, widthPt, heightPt, descentPt }) => ({
      key,
      mimeType,
      widthPt,
      heightPt,
      descentPt,
    }));
  return {
    key: question.key,
    section: question.section ?? null,
    text: question.text,
    images: strip(question.images),
    options: question.options.map((option) => ({
      text: option.text,
      images: strip(option.images),
    })),
    correctIndex: question.correctIndex ?? null,
    lockOptions: question.lockOptions,
  };
}

interface Props {
  paper: ExamPaper;
  readOnly?: boolean;
}

export function QuestionEditor({ paper, readOnly = false }: Props) {
  const { t } = useTranslation();
  const update = useUpdateExamPaper();
  const [draft, setDraft] = useState<Draft>(() => fromPaper(paper));
  const [dirty, setDirty] = useState(false);

  // A fresh read from the server (after save, or a reload) replaces an
  // unedited draft; an edited one is the teacher's and stays.
  useEffect(() => {
    if (!dirty) setDraft(fromPaper(paper));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper]);

  const letters = OPTION_LETTERS[draft.optionLabelStyle];
  const missingAnswers = useMemo(
    () =>
      draft.questions.filter(
        (question) => question.correctIndex === null || question.correctIndex === undefined,
      ).length,
    [draft.questions],
  );

  function edit(mutate: (next: Draft) => void) {
    setDraft((current) => {
      const next: Draft = {
        ...current,
        questions: current.questions.map((question) => ({
          ...question,
          options: question.options.map((option) => ({ ...option })),
        })),
      };
      mutate(next);
      return next;
    });
    setDirty(true);
  }

  function editQuestion(index: number, mutate: (question: ExamQuestion) => void) {
    edit((next) => mutate(next.questions[index]));
  }

  function move(index: number, delta: number) {
    edit((next) => {
      const target = index + delta;
      if (target < 0 || target >= next.questions.length) return;
      [next.questions[index], next.questions[target]] = [
        next.questions[target],
        next.questions[index],
      ];
    });
  }

  function save() {
    update.mutate(
      {
        id: paper.id,
        body: {
          preamble: draft.preamble,
          optionLabelStyle: draft.optionLabelStyle,
          questions: draft.questions.map(toInput),
        },
      },
      { onSuccess: () => setDirty(false) },
    );
  }

  return (
    <div className="space-y-4">
      {paper.warnings.length > 0 && (
        <div
          role="status"
          className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
        >
          <p className="mb-1 flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" />
            {t('examPaper.warningsTitle')}
          </p>
          <ul className="list-disc space-y-0.5 ps-6">
            {paper.warnings.map((warning, index) => (
              <li key={index}>
                {t(`examPaper.warning.${warning.code}`, {
                  question: warning.question ?? '',
                  detail: warning.detail ?? '',
                })}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <Label htmlFor="exam-preamble">{t('examPaper.preamble')}</Label>
            <Textarea
              id="exam-preamble"
              rows={4}
              value={draft.preamble}
              disabled={readOnly}
              onChange={(event) => edit((next) => (next.preamble = event.target.value))}
            />
            <p className="text-xs text-muted-foreground">{t('examPaper.preambleHint')}</p>
            <p className="text-xs text-muted-foreground">{t('examPaper.mathHint')}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="exam-letters">{t('examPaper.optionLabelStyle')}</Label>
            <Select
              value={draft.optionLabelStyle}
              disabled={readOnly}
              onValueChange={(value) =>
                edit((next) => (next.optionLabelStyle = value as ExamOptionLabelStyle))
              }
            >
              <SelectTrigger id="exam-letters" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXAM_OPTION_LABEL_STYLES.map((style) => (
                  <SelectItem key={style} value={style}>
                    {t(style === 'lao' ? 'examPaper.optionLabelLao' : 'examPaper.optionLabelLatin')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <ol className="space-y-3">
        {draft.questions.map((question, index) => (
          <li key={question.key}>
            <Card
              className={cn(
                question.correctIndex === null || question.correctIndex === undefined
                  ? 'border-amber-300'
                  : undefined,
              )}
            >
              <CardContent className="space-y-3 pt-6">
                <div className="flex flex-wrap items-start gap-2">
                  <span className="mt-2 w-14 shrink-0 font-semibold tabular-nums">
                    {t('examPaper.questionNumber', { number: index + 1 })}
                  </span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <Input
                      aria-label={t('examPaper.section')}
                      placeholder={t('examPaper.section')}
                      className="h-8 max-w-xs text-xs"
                      value={question.section ?? ''}
                      disabled={readOnly}
                      onChange={(event) =>
                        editQuestion(index, (q) => (q.section = event.target.value || null))
                      }
                    />
                    <Textarea
                      aria-label={t('examPaper.questionText')}
                      rows={2}
                      value={question.text}
                      disabled={readOnly}
                      onChange={(event) =>
                        editQuestion(index, (q) => (q.text = event.target.value))
                      }
                    />
                    {/⟦\d+⟧/.test(question.text) && (
                      <p className="text-xs text-muted-foreground">
                        {t('examPaper.imageTokenHint')}
                      </p>
                    )}
                    {hasMath(question.text) && (
                      <MathText
                        text={question.text}
                        className="block rounded-md bg-muted/50 px-2 py-1 text-sm"
                      />
                    )}
                    <Pictures
                      images={question.images}
                      readOnly={readOnly}
                      onRemove={(imageIndex) =>
                        editQuestion(index, (q) => {
                          q.images.splice(imageIndex, 1);
                          q.text = withoutImageToken(q.text, imageIndex);
                        })
                      }
                    />
                  </div>
                  {!readOnly && (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t('examPaper.moveUp')}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t('examPaper.moveDown')}
                        disabled={index === draft.questions.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t('examPaper.removeQuestion')}
                        onClick={() => edit((next) => next.questions.splice(index, 1))}
                      >
                        <Trash2 className="text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>

                <RadioGroup
                  aria-label={t('examPaper.correctAnswer')}
                  className="ps-16"
                  value={
                    question.correctIndex === null || question.correctIndex === undefined
                      ? ''
                      : String(question.correctIndex)
                  }
                  disabled={readOnly}
                  onValueChange={(value) =>
                    editQuestion(index, (q) => (q.correctIndex = Number(value)))
                  }
                >
                  {question.options.map((option, optionIndex) => (
                    <div key={optionIndex} className="flex items-start gap-2">
                      <RadioGroupItem
                        value={String(optionIndex)}
                        id={`${question.key}-${optionIndex}`}
                        aria-label={`${t('examPaper.correct')} ${letters[optionIndex]}`}
                        className="mt-2.5"
                      />
                      <Label
                        htmlFor={`${question.key}-${optionIndex}`}
                        className="mt-2.5 w-6 shrink-0 font-medium"
                      >
                        {letters[optionIndex]}.
                      </Label>
                      <div className="min-w-0 flex-1 space-y-1">
                        <Input
                          aria-label={`${t('examPaper.option')} ${letters[optionIndex]}`}
                          value={option.text}
                          disabled={readOnly}
                          onChange={(event) =>
                            editQuestion(
                              index,
                              (q) => (q.options[optionIndex].text = event.target.value),
                            )
                          }
                        />
                        {hasMath(option.text) && (
                          <MathText
                            text={option.text}
                            className="block rounded-md bg-muted/50 px-2 py-1 text-sm"
                          />
                        )}
                        <Pictures
                          images={option.images}
                          readOnly={readOnly}
                          onRemove={(imageIndex) =>
                            editQuestion(index, (q) => {
                              const option = q.options[optionIndex];
                              option.images.splice(imageIndex, 1);
                              option.text = withoutImageToken(option.text, imageIndex);
                            })
                          }
                        />
                      </div>
                      {!readOnly && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={t('examPaper.removeOption')}
                          disabled={question.options.length <= 2}
                          onClick={() =>
                            editQuestion(index, (q) => {
                              q.options.splice(optionIndex, 1);
                              if (q.correctIndex === optionIndex) q.correctIndex = null;
                              else if (q.correctIndex != null && q.correctIndex > optionIndex) {
                                q.correctIndex -= 1;
                              }
                            })
                          }
                        >
                          <X />
                        </Button>
                      )}
                    </div>
                  ))}
                </RadioGroup>

                <div className="flex flex-wrap items-center gap-4 ps-16 text-sm">
                  {!readOnly && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={question.options.length >= 8}
                      onClick={() =>
                        editQuestion(index, (q) => q.options.push({ text: '', images: [] }))
                      }
                    >
                      <Plus />
                      {t('examPaper.addOption')}
                    </Button>
                  )}
                  <label className="flex items-center gap-2">
                    <Switch
                      checked={question.lockOptions}
                      disabled={readOnly}
                      aria-label={t('examPaper.lockOptions')}
                      onCheckedChange={(checked) =>
                        editQuestion(index, (q) => (q.lockOptions = checked))
                      }
                    />
                    <Lock className="size-3.5 text-muted-foreground" />
                    <span>{t('examPaper.lockOptions')}</span>
                  </label>
                  {(question.correctIndex === null || question.correctIndex === undefined) && (
                    <span className="text-amber-700 dark:text-amber-300">
                      {t('examPaper.noCorrectAnswer')}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>

      {!readOnly && (
        <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t bg-background/95 py-3 backdrop-blur">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              edit((next) =>
                next.questions.push({
                  key: newKey(),
                  section: next.questions[next.questions.length - 1]?.section ?? null,
                  text: '',
                  images: [],
                  options: [
                    { text: '', images: [] },
                    { text: '', images: [] },
                    { text: '', images: [] },
                    { text: '', images: [] },
                  ],
                  correctIndex: null,
                  lockOptions: false,
                }),
              )
            }
          >
            <Plus />
            {t('examPaper.addQuestion')}
          </Button>
          <span className="text-sm text-muted-foreground">
            {t('examPaper.questionCount', { count: draft.questions.length })}
            {missingAnswers > 0 && (
              <> · {t('examPaper.missingAnswers', { count: missingAnswers })}</>
            )}
          </span>
          <div className="ms-auto flex items-center gap-2">
            {dirty && (
              <>
                <span className="text-sm text-muted-foreground">{t('examPaper.unsaved')}</span>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setDraft(fromPaper(paper));
                    setDirty(false);
                  }}
                >
                  <Undo2 />
                  {t('examPaper.discard')}
                </Button>
              </>
            )}
            <Button type="button" disabled={!dirty || update.isPending} onClick={save}>
              <Save />
              {t('examPaper.save')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Thumbnails of the pictures a stem or option carries, by their signed URLs. */
function Pictures({
  images,
  readOnly,
  onRemove,
}: {
  images: ExamQuestion['images'];
  readOnly: boolean;
  onRemove: (index: number) => void;
}) {
  const { t } = useTranslation();
  if (images.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {images.map((image, index) => (
        <div key={image.key} className="relative">
          {image.url ? (
            <img
              src={image.url}
              alt=""
              className="max-h-32 rounded border object-contain"
              style={{ maxWidth: Math.min(240, image.widthPt) }}
            />
          ) : (
            <div className="h-16 w-24 rounded border bg-muted" />
          )}
          {!readOnly && (
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute -end-2 -top-2 size-6"
              aria-label={t('examPaper.removeImage')}
              onClick={() => onRemove(index)}
            >
              <X className="size-3" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
