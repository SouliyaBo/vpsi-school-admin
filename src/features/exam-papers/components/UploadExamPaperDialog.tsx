import { zodResolver } from '@hookform/resolvers/zod';
import { FileUp } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useClassroomOptions } from '@/features/classrooms/api';
import { useSemesterOptions } from '@/features/semesters/api';
import { useSubjectOptions } from '@/features/subjects/api';
import { formatBytes } from '@/lib/utils';
import { optionalId, optionalText } from '@/lib/zod-helpers';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { EntitySelectField } from '@/components/common/EntitySelect';
import { TextField } from '@/components/common/fields';
import { FormDialog } from '@/components/common/FormDialog';
import { useUploadExamPaper } from '../api';

/**
 * The upload. The file is the only thing required: the reader names the
 * paper after it, and the subject, class and term are labels for the list,
 * not inputs to the shuffle — a teacher in a hurry can fill them in later.
 */
const schema = z.object({
  title: optionalText(200),
  subjectId: optionalId(),
  classroomId: optionalId(),
  semesterId: optionalId(),
});
type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = { title: '', subjectId: '', classroomId: '', semesterId: '' };

const ACCEPT = '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UploadExamPaperDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const uploadPaper = useUploadExamPaper();

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  useEffect(() => {
    if (!open) return;
    form.reset(EMPTY);
    setFile(null);
    setFileError(null);
    setProgress(null);
  }, [open, form]);

  const useTaughtSubjectOptions = (search: string) =>
    useSubjectOptions(search, undefined, 'taught');
  const useAnyClassroomOptions = (search: string) => useClassroomOptions(search);
  const useAnySemesterOptions = (search: string) => useSemesterOptions(search);

  function pick(candidate: File | null) {
    setFile(candidate);
    setFileError(
      candidate && !candidate.name.toLowerCase().endsWith('.docx')
        ? t('examPaper.fileRequired')
        : null,
    );
  }

  function submit(values: FormValues) {
    if (!file || fileError) {
      setFileError(t('examPaper.fileRequired'));
      return;
    }
    uploadPaper.mutate(
      {
        file,
        title: values.title || undefined,
        subjectId: values.subjectId || undefined,
        classroomId: values.classroomId || undefined,
        semesterId: values.semesterId || undefined,
        onProgress: setProgress,
      },
      {
        onSuccess: (paper) => {
          onOpenChange(false);
          // Straight to the review: the upload is not finished until the
          // teacher has seen what the reader made of it.
          navigate(`/exam-papers/${paper.id}`);
        },
        onSettled: () => setProgress(null),
      },
    );
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('examPaper.uploadTitle')}
      description={t('examPaper.uploadDescription')}
      onSubmit={form.handleSubmit(submit)}
      isSubmitting={uploadPaper.isPending}
      submitLabel={t('examPaper.upload')}
    >
      <Form {...form}>
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor={inputId}>
              {t('examPaper.file')} <span className="text-destructive">*</span>
            </Label>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
                <FileUp />
                {t('examPaper.chooseFile')}
              </Button>
              {file && (
                <span className="min-w-0 truncate text-sm">
                  {file.name}{' '}
                  <span className="text-muted-foreground">({formatBytes(file.size)})</span>
                </span>
              )}
            </div>
            <input
              id={inputId}
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              onChange={(event) => pick(event.target.files?.[0] ?? null)}
            />
            {fileError && <p className="text-sm text-destructive">{fileError}</p>}
            {progress !== null && <Progress value={progress} />}
          </div>

          <TextField
            control={form.control}
            name="title"
            label={t('examPaper.titleField')}
            description={t('examPaper.titleHint')}
          />
          <EntitySelectField
            control={form.control}
            name="subjectId"
            label={t('examPaper.subject')}
            useOptions={useTaughtSubjectOptions}
          />
          <EntitySelectField
            control={form.control}
            name="classroomId"
            label={t('examPaper.classroom')}
            useOptions={useAnyClassroomOptions}
          />
          <EntitySelectField
            control={form.control}
            name="semesterId"
            label={t('examPaper.semester')}
            useOptions={useAnySemesterOptions}
          />
        </div>
      </Form>
    </FormDialog>
  );
}
