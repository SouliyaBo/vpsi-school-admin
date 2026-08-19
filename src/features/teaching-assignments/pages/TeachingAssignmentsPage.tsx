import { CalendarClock, ClipboardList, School } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { localizedName } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/common/PageHeader';
import { AssignmentList } from '../components/AssignmentList';
import { ClassroomTimetable } from '../components/ClassroomTimetable';
import { TeacherTimetable } from '../components/TeacherTimetable';

/**
 * Where teaching is allocated.
 *
 * One record answers three questions, and each has its own reader: the office
 * maintains the list, a teacher wants their own week, and a class wants its
 * timetable. Splitting them into tabs keeps the maintenance table from having to
 * double as a timetable it cannot lay out.
 */
export function TeachingAssignmentsPage() {
  const { t, i18n } = useTranslation();
  const activeYear = useActiveSchoolYear();

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('assignment.title')}
        description={t('assignment.subtitle')}
        actions={
          activeYear.data && (
            <Badge variant="outline">{localizedName(activeYear.data, i18n.language)}</Badge>
          )
        }
      />

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">
            <ClipboardList />
            {t('assignment.listTab')}
          </TabsTrigger>
          <TabsTrigger value="teacher">
            <CalendarClock />
            {t('assignment.teacherTab')}
          </TabsTrigger>
          <TabsTrigger value="classroom">
            <School />
            {t('assignment.classroomTab')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <AssignmentList />
        </TabsContent>
        <TabsContent value="teacher">
          <TeacherTimetable />
        </TabsContent>
        <TabsContent value="classroom">
          <ClassroomTimetable />
        </TabsContent>
      </Tabs>
    </div>
  );
}
