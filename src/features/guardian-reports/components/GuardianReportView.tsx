import { useTranslation } from 'react-i18next';
import { formatDate } from '@/lib/utils';
import type {
  GuardianReportContent,
  GuardianReportSection,
  GuardianReportSnapshot,
} from '@/types/entities';

/**
 * A ລາຍງານຫາຜູ້ປົກຄອງ as the guardian reads it.
 *
 * One component for three places — the guardian's own page, the teacher's
 * preview before sending, and the teacher looking back at what went — so what a
 * teacher previews is exactly what a family is shown.
 *
 * Built for a phone first: the guardian opens this from a chat message, so every
 * table is two narrow columns at most, and nothing scrolls sideways.
 */
export function GuardianReportView({
  content,
  sections,
  message,
  guardian,
}: {
  content: GuardianReportContent;
  sections: GuardianReportSection[];
  message?: string | null;
  guardian?: GuardianReportSnapshot['guardian'];
}) {
  const { t } = useTranslation();
  const show = (section: GuardianReportSection) => sections.includes(section);

  return (
    <article className="space-y-5 text-sm">
      <header className="space-y-1">
        {guardian && (
          <p className="text-muted-foreground">
            {t('guardianReport.dear', { name: guardian.nameLo })}
          </p>
        )}
        <h2 className="text-lg font-semibold">
          {content.student.nameLo}
          {content.student.nickname && (
            <span className="font-normal text-muted-foreground"> ({content.student.nickname})</span>
          )}
        </h2>
        <p className="text-muted-foreground">
          {content.classroomName} ·{' '}
          {t('guardianReport.period', {
            month: t(`month.${content.month}`),
            term: content.semester.number,
          })}
        </p>
      </header>

      {show('monthlyMarks') && content.monthlyMarks && (
        <MarksSection marks={content.monthlyMarks} />
      )}
      {show('attendance') && content.attendance && (
        <AttendanceSection attendance={content.attendance} />
      )}
      {show('conduct') && content.conduct && <ConductSection conduct={content.conduct} />}
      {show('behavior') && content.behavior && content.behavior.length > 0 && (
        <BehaviorSection entries={content.behavior} />
      )}

      {message && (
        <section className="space-y-1 rounded-md bg-muted px-3 py-2">
          <h3 className="font-medium">{t('guardianReport.message')}</h3>
          <p className="whitespace-pre-line">{message}</p>
        </section>
      )}

      <footer className="border-t pt-3 text-muted-foreground">
        {content.teacherName && (
          <p>
            {t('guardianReport.fromTeacher')}: {content.teacherName}
          </p>
        )}
        {content.sentBy === 'office' && <p>{t('guardianReport.sentByOffice')}</p>}
      </footer>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="font-semibold">{title}</h3>
      {children}
    </section>
  );
}

/** A label and a value on one line — the shape every figure here takes. */
function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed py-1 last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function MarksSection({ marks }: { marks: NonNullable<GuardianReportContent['monthlyMarks']> }) {
  const { t } = useTranslation();
  return (
    <Section title={t('guardianReport.section.monthlyMarks')}>
      {/* Four narrow columns, not a scroll: the subject name wraps, the
          figures never do. No full marks beside them — the school's call. */}
      <table className="w-full">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="py-1 text-left font-normal">{t('guardianReport.subject')}</th>
            <th className="w-14 py-1 text-right font-normal">{t('guardianReport.test')}</th>
            <th className="w-14 py-1 text-right font-normal">{t('guardianReport.score')}</th>
            <th className="w-12 py-1 text-right font-normal">{t('guardianReport.grade')}</th>
          </tr>
        </thead>
        <tbody>
          {marks.subjects.map((subject) => (
            <tr key={subject.nameLo} className="border-b border-dashed last:border-b-0">
              <td className="py-1 pr-2 text-muted-foreground">{subject.nameLo}</td>
              <td className="py-1 text-right tabular-nums">{subject.test ?? '—'}</td>
              <td className="py-1 text-right font-medium tabular-nums">{subject.score ?? '—'}</td>
              <td className="py-1 text-right font-medium">{subject.grade ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="rounded-md bg-muted px-3 py-1">
        <Line label={t('guardianReport.total')} value={marks.total ?? '—'} />
        <Line label={t('guardianReport.average')} value={marks.average ?? '—'} />
        {marks.grade && <Line label={t('guardianReport.grade')} value={marks.grade} />}
      </dl>
      {!marks.isComplete && (
        <p className="text-xs text-muted-foreground">{t('guardianReport.incomplete')}</p>
      )}
    </Section>
  );
}

function AttendanceSection({
  attendance,
}: {
  attendance: NonNullable<GuardianReportContent['attendance']>;
}) {
  const { t } = useTranslation();
  return (
    <Section title={t('guardianReport.section.attendance')}>
      <dl>
        <Line label={t('attendanceStatus.present')} value={attendance.present} />
        <Line label={t('attendanceStatus.late')} value={attendance.late} />
        <Line label={t('attendanceStatus.absent')} value={attendance.absent} />
        <Line label={t('attendanceStatus.excused')} value={attendance.excused} />
        <Line label={t('attendanceStatus.sick')} value={attendance.sick} />
      </dl>
      <dl className="rounded-md bg-muted px-3 py-1">
        <Line label={t('guardianReport.absentUnexcused')} value={attendance.absentUnexcused} />
        <Line label={t('guardianReport.absentExcused')} value={attendance.absentExcused} />
        <Line label={t('guardianReport.attendanceRate')} value={`${attendance.attendanceRate}%`} />
      </dl>
      <p className="text-xs text-muted-foreground">
        {t('guardianReport.latesRule', { count: attendance.latesPerAbsence })}
      </p>
    </Section>
  );
}

function ConductSection({ conduct }: { conduct: NonNullable<GuardianReportContent['conduct']> }) {
  const { t } = useTranslation();
  return (
    <Section title={t('guardianReport.section.conduct')}>
      <dl className="rounded-md bg-muted px-3 py-1">
        <Line
          label={t('guardianReport.conductRemaining')}
          value={`${conduct.remaining} / ${conduct.baseScore}`}
        />
        {conduct.grade && (
          <Line
            label={t('guardianReport.grade')}
            value={t(`termResult.conductGrade.${conduct.grade}`)}
          />
        )}
      </dl>
      {conduct.deductions.length === 0 ? (
        <p className="text-muted-foreground">{t('guardianReport.noDeductions')}</p>
      ) : (
        <div className="space-y-1">
          <p className="text-muted-foreground">{t('guardianReport.deductions')}</p>
          <dl>
            {conduct.deductions.map((deduction, index) => (
              <Line
                key={`${deduction.date}-${index}`}
                label={`${formatDate(deduction.date)} · ${deduction.ruleNameLo}`}
                value={`−${deduction.points}`}
              />
            ))}
          </dl>
        </div>
      )}
    </Section>
  );
}

function BehaviorSection({ entries }: { entries: NonNullable<GuardianReportContent['behavior']> }) {
  const { t } = useTranslation();
  return (
    <Section title={t('guardianReport.section.behavior')}>
      <ul className="space-y-2">
        {entries.map((entry, index) => (
          <li key={`${entry.date}-${index}`} className="rounded-md border px-3 py-2">
            <p className="text-xs text-muted-foreground">
              {formatDate(entry.date)}
              {entry.subjectNameLo && ` · ${entry.subjectNameLo}`}
            </p>
            {entry.behavior && <p>{entry.behavior}</p>}
            {entry.action && (
              <p className="text-muted-foreground">
                {t('guardianReport.behaviorAction')}: {entry.action}
              </p>
            )}
            {entry.remark && (
              <p className="text-muted-foreground">
                {t('guardianReport.remark')}: {entry.remark}
              </p>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}
