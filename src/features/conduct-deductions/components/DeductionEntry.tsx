import { AlertTriangle, Gavel, Info, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useClassroomOptions } from '@/features/classrooms/api';
import { useClassRoster } from '@/features/enrollments/api';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { errorMessage } from '@/lib/error-message';
import { notify } from '@/lib/toast';
import { isOnCurrentRoll, nickname, refId, refObject, toDateInput } from '@/lib/utils';
import type { Student } from '@/types/entities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/common/EmptyState';
import { EntitySelect } from '@/components/common/EntitySelect';
import { StudentName } from '@/components/common/StudentName';
import {
  ESCALATION_TONES,
  useConductRules,
  useRecordDeduction,
  type DeductionOutcome,
} from '../api';
import { NotifyList } from './NotifyList';

/**
 * ຕັດຄະແນນ — applying one rule to the children who broke it.
 *
 * Shaped as one rule and many children rather than one child at a time, because
 * that is the act: a rule is broken by a group and written down once. The points
 * are never typed — they belong to the rule, and a sheet whose numbers could be
 * overridden per child would not be a published sheet.
 *
 * What comes back from the save is the point of the screen. A teacher who has
 * just taken 10 points off someone needs to know it puts them past ຂັ້ນ 1 and
 * that the guardians must now be told; making them go and look that up on
 * another tab is how a ladder stops being followed.
 */
export function DeductionEntry() {
  const { t, i18n } = useTranslation();
  const activeYear = useActiveSchoolYear();

  const [classroomId, setClassroomId] = useState<string | undefined>();
  const [date, setDate] = useState(toDateInput(new Date()));
  const [ruleId, setRuleId] = useState<string | undefined>();
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [saveError, setSaveError] = useState<unknown>(null);
  const [outcomes, setOutcomes] = useState<DeductionOutcome[]>([]);

  const useClassroomsForYear = (search: string) => useClassroomOptions(search, activeYear.data?.id);
  const rules = useConductRules();
  const roster = useClassRoster(classroomId);
  const record = useRecordDeduction();

  /**
   * The sheet in its printed order — cheapest column first — with the points on
   * every line. A teacher picks the rule they saw broken, and the cost follows;
   * showing it here is what makes the two feel like one choice.
   */
  const ruleOptions = rules.data?.data ?? [];

  // Only the children actually in the room: a placement the office never closed
  // outlives the child leaving, and points taken off someone who has gone are
  // points nobody can act on. The API refuses them too.
  const students = useMemo(
    () => (roster.data ?? []).filter((enrollment) => isOnCurrentRoll(enrollment.studentId)),
    [roster.data],
  );

  // Resolved once for the result panel, which names children the roster has
  // already been fetched for — the API answers with ids, not names.
  const namesById = useMemo(
    () =>
      new Map(
        students.map((enrollment) => [
          refId(enrollment.studentId) ?? '',
          {
            name: enrollment.studentNameLo,
            // Read in Lao regardless of the interface language, to match the
            // register name it sits beside.
            nickname: nickname(refObject<Student>(enrollment.studentId), 'lo'),
          },
        ]),
      ),
    [students],
  );

  // A class change leaves a selection of children who are not in the new room.
  useEffect(() => {
    setSelected([]);
    setOutcomes([]);
  }, [classroomId]);

  const selectedRule = ruleOptions.find((rule) => rule.id === ruleId);
  const canSave = Boolean(classroomId && ruleId && selected.length > 0) && !record.isPending;

  function toggle(studentId: string) {
    setSelected((previous) =>
      previous.includes(studentId)
        ? previous.filter((id) => id !== studentId)
        : [...previous, studentId],
    );
  }

  function submit() {
    if (!canSave) return;
    setSaveError(null);
    setOutcomes([]);

    record
      .mutateAsync({
        classroomId: classroomId!,
        ruleId: ruleId!,
        date,
        studentIds: selected,
        ...(note.trim() ? { note: note.trim() } : {}),
      })
      .then((result) => {
        notify.success(t('conductDeduction.recorded', { count: result.recorded }));
        setOutcomes(result.students);
        // The rule and the class stay put: a lesson that produced one deduction
        // usually produces the next one too. The names do not.
        setSelected([]);
        setNote('');
      })
      .catch(setSaveError);
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="grid gap-3 pt-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="deduction-classroom">{t('conductDeduction.classroom')}</Label>
            <EntitySelect
              id="deduction-classroom"
              value={classroomId ?? null}
              onChange={setClassroomId}
              useOptions={useClassroomsForYear}
              placeholder={t('conductDeduction.selectClassroom')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="deduction-date">{t('conductDeduction.date')}</Label>
            <Input
              id="deduction-date"
              type="date"
              value={date}
              // The ledger records what happened, so the API refuses a future
              // date; stopping it here beats a 400 after the names are ticked.
              max={toDateInput(new Date())}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="deduction-rule">{t('conductDeduction.rule')}</Label>
            <Select value={ruleId ?? ''} onValueChange={setRuleId}>
              <SelectTrigger id="deduction-rule">
                <SelectValue placeholder={t('conductDeduction.selectRule')} />
              </SelectTrigger>
              <SelectContent>
                {ruleOptions.map((rule) => (
                  <SelectItem key={rule.id} value={rule.id}>
                    {rule.code} ·{' '}
                    {i18n.language === 'en' && rule.nameEn ? rule.nameEn : rule.nameLo} (
                    {t('conductDeduction.pointsShort', { points: rule.points })})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {rules.error != null ? (
              // A failed load must not read as an empty sheet: the teacher would
              // conclude there is no rule covering what they just saw.
              <p className="text-xs text-danger">{errorMessage(rules.error)}</p>
            ) : (
              ruleOptions.length === 0 &&
              !rules.isLoading && (
                <p className="text-xs text-warning">{t('conductDeduction.noRules')}</p>
              )
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex items-center justify-between">
            <Label>{t('conductDeduction.students')}</Label>
            {selectedRule && selected.length > 0 && (
              <Badge variant="warning">
                {t('conductDeduction.willDeduct', {
                  points: selectedRule.points,
                  count: selected.length,
                })}
              </Badge>
            )}
          </div>

          {!classroomId ? (
            <EmptyState icon={Users} title={t('conductDeduction.pickClassFirst')} />
          ) : roster.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-9 w-full" />
              ))}
            </div>
          ) : students.length === 0 ? (
            <EmptyState icon={Users} title={t('conductDeduction.emptyRoster')} />
          ) : (
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {students.map((enrollment) => {
                const studentId = refId(enrollment.studentId) ?? '';
                const isChecked = selected.includes(studentId);
                return (
                  <label
                    key={enrollment.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm hover:bg-muted/50"
                  >
                    <Checkbox checked={isChecked} onCheckedChange={() => toggle(studentId)} />
                    <span className="min-w-0 flex-1 truncate">
                      <StudentName
                        name={enrollment.studentNameLo}
                        // Read in Lao regardless of the interface language, to
                        // match the register name it sits beside.
                        nickname={nickname(refObject<Student>(enrollment.studentId), 'lo')}
                      />
                    </span>
                    <span className="text-xs text-muted-foreground">{enrollment.studentCode}</span>
                  </label>
                );
              })}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="deduction-note">{t('conductDeduction.note')}</Label>
            <Textarea
              id="deduction-note"
              rows={2}
              value={note}
              placeholder={t('conductDeduction.notePlaceholder')}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          {saveError != null && (
            <p className="flex items-start gap-2 text-sm text-danger">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {errorMessage(saveError)}
            </p>
          )}

          <div className="flex justify-end">
            <Button onClick={submit} disabled={!canSave}>
              <Gavel />
              {t('conductDeduction.save')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {outcomes.length > 0 && (
        <Card>
          <CardContent className="space-y-3 pt-5">
            <h3 className="text-sm font-medium">{t('conductDeduction.outcomeTitle')}</h3>
            {outcomes.map((outcome) => (
              <Outcome
                key={outcome.studentId}
                outcome={outcome}
                name={namesById.get(outcome.studentId)?.name ?? outcome.studentId}
                nickname={namesById.get(outcome.studentId)?.nickname ?? null}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Where one child now stands, and what the sheet says has to happen about it. */
function Outcome({
  outcome,
  name,
  nickname: studentNickname,
}: {
  outcome: DeductionOutcome;
  name: string;
  nickname: string | null;
}) {
  const { t } = useTranslation();

  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">
          <StudentName name={name} nickname={studentNickname} />
        </span>
        <span className="flex items-center gap-2">
          <span className="text-sm tabular-nums text-muted-foreground">
            {t('conductDeduction.remainingOf', { remaining: outcome.remaining })}
          </span>
          <Badge variant={ESCALATION_TONES[outcome.level]}>
            {t(`conductEscalation.${outcome.level}`)}
          </Badge>
        </span>
      </div>

      {outcome.notify.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t('conductDeduction.mustTell')} <NotifyList parties={outcome.notify} />
        </p>
      )}

      {!outcome.publishedToConductScore && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          {t('conductDeduction.manualScoreKept')}
        </p>
      )}
    </div>
  );
}
