import { AlertTriangle, ListChecks, Split } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ExamPaper } from '@/types/entities';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUpdateExamPaper, type ResponsesView } from '../api';
import { guessSubject, sectionMap, sectionsOf, toParts } from '../lib/subject-parts';

/**
 * ແຍກຄະແນນຕາມວິຊາ — for a paper whose subject is marked as several (ທຳມະຊາດ →
 * ຟີຊິກ, ເຄມີ, ຊີວະ): which ພາກ is which subject, and what each subject's part
 * is out of.
 *
 * Before anything is saved the headings are read for a subject's name, so a
 * paper with "ພາກ I ຟີຊິກ" opens already filled in; the teacher checks it and
 * saves. A ພາກ left on ບໍ່ນັບ counts towards no subject.
 *
 * Remounted by the caller when the paper changes, so a save elsewhere is what
 * the form shows next.
 */

const NONE = '__none';

export function SubjectPartsCard({
  paper,
  view,
  readOnly,
  onReviewQuestions,
}: {
  paper: ExamPaper;
  view: ResponsesView;
  readOnly: boolean;
  /** Opens the ກວດຄຳຖາມ tab, where the ພາກ are set; absent, the card only says where. */
  onReviewQuestions?: () => void;
}) {
  const { t } = useTranslation();
  const update = useUpdateExamPaper();
  const subjects = view.monthly.markedSubjects;
  const sections = useMemo(() => sectionsOf(paper.questions), [paper.questions]);
  const saved = paper.subjectParts ?? [];

  const [map, setMap] = useState<Record<string, string>>(() => {
    if (saved.length > 0) return sectionMap(saved);
    const guessed: Record<string, string> = {};
    for (const { section } of sections) {
      const id = guessSubject(section, subjects);
      if (id) guessed[section] = id;
    }
    return guessed;
  });
  const [points, setPoints] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      saved.map((part) => [part.subjectId, part.points === null ? '' : String(part.points)]),
    ),
  );

  // No heading names a subject and nothing is saved: the paper is not divided
  // by subject yet, and the dropdowns below have nothing to work with.
  const undivided =
    saved.length === 0 && sections.every(({ section }) => guessSubject(section, subjects) === null);
  const used = subjects.filter((subject) => Object.values(map).includes(subject.id));
  const unassigned = sections
    .filter(({ section }) => !map[section])
    .reduce((sum, { questions }) => sum + questions, 0);
  const parsed = Object.fromEntries(
    used.map((subject) => {
      const text = (points[subject.id] ?? '').trim();
      return [subject.id, text === '' ? null : Number(text)];
    }),
  );
  const invalid = Object.values(parsed).some(
    (value) => value !== null && (!Number.isFinite(value) || value < 0),
  );

  function save() {
    update.mutate({
      id: paper.id,
      body: {
        subjectParts: toParts(
          map,
          parsed,
          subjects.map((subject) => subject.id),
        ),
      },
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Split className="size-4" />
          {t('examPaper.partsTitle')}
        </CardTitle>
        <CardDescription>{t('examPaper.partsDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="list-decimal space-y-0.5 ps-5 text-sm">
          <li>{t('examPaper.partsStep1')}</li>
          <li>{t('examPaper.partsStep2')}</li>
          <li>{t('examPaper.partsStep3')}</li>
        </ol>
        <p className="text-xs text-muted-foreground">{t('examPaper.partsNotNeeded')}</p>

        {undivided && (
          <div
            role="status"
            className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
          >
            <p className="flex items-center gap-2 font-medium">
              <AlertTriangle className="size-4" />
              {t('examPaper.partsUndivided')}
            </p>
            <p>{t('examPaper.partsUndividedHint')}</p>
            {onReviewQuestions && (
              <Button type="button" size="sm" variant="outline" onClick={onReviewQuestions}>
                <ListChecks />
                {t('examPaper.partsGoReview')}
              </Button>
            )}
          </div>
        )}

        <div className="space-y-2">
          {sections.map(({ section, questions }) => (
            <div key={section} className="flex flex-wrap items-center gap-3">
              <span className="min-w-48 flex-1 text-sm">
                {section || (
                  <span className="text-muted-foreground">{t('examPaper.partsNoSection')}</span>
                )}{' '}
                <span className="text-xs text-muted-foreground">
                  {t('examPaper.partsQuestions', { count: questions })}
                </span>
              </span>
              <Select
                value={map[section] ?? NONE}
                disabled={readOnly}
                onValueChange={(value) =>
                  setMap((current) => {
                    const next = { ...current };
                    if (value === NONE) delete next[section];
                    else next[section] = value;
                    return next;
                  })
                }
              >
                <SelectTrigger
                  className="w-52"
                  aria-label={`${t('examPaper.partsSubject')} ${section || t('examPaper.partsNoSection')}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t('examPaper.partsNone')}</SelectItem>
                  {subjects.map((subject) => (
                    <SelectItem key={subject.id} value={subject.id}>
                      {subject.nameLo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        {used.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t('examPaper.partsPoints')}</p>
            <div className="flex flex-wrap gap-3">
              {used.map((subject) => {
                const outOf = parsed[subject.id] ?? paper.totalPoints ?? null;
                return (
                  <div key={subject.id} className="space-y-1">
                    <Label htmlFor={`part-points-${subject.id}`}>{subject.nameLo}</Label>
                    <Input
                      id={`part-points-${subject.id}`}
                      type="number"
                      min={0}
                      step="0.5"
                      className="w-28"
                      placeholder={
                        paper.totalPoints === null || paper.totalPoints === undefined
                          ? ''
                          : String(paper.totalPoints)
                      }
                      value={points[subject.id] ?? ''}
                      disabled={readOnly}
                      onChange={(event) =>
                        setPoints((current) => ({ ...current, [subject.id]: event.target.value }))
                      }
                    />
                    {outOf !== null && outOf > subject.testMax && (
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        {t('examPaper.partsOverTest', { max: subject.testMax })}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">{t('examPaper.partsPointsHint')}</p>
          </div>
        )}

        {used.length > 0 && unassigned > 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            {t('examPaper.partsUnassigned', { count: unassigned })}
          </p>
        )}

        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={invalid || update.isPending} onClick={save}>
              {t('examPaper.partsSave')}
            </Button>
            {saved.length > 0 && (
              <Button
                type="button"
                variant="outline"
                disabled={update.isPending}
                onClick={() => update.mutate({ id: paper.id, body: { subjectParts: [] } })}
              >
                {t('examPaper.partsClear')}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
