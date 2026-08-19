import { File as FileIcon, Upload, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatBytes } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

interface FileUploadProps {
  /** Performs the upload. `onProgress` is fed straight from axios. */
  onUpload: (file: File, onProgress: (percent: number) => void) => Promise<unknown>;
  accept?: string;
  maxSizeBytes?: number;
  /** Existing image to show as a preview (e.g. a student's current photo). */
  currentUrl?: string | null;
  label?: string;
  disabled?: boolean;
  className?: string;
  onUploaded?: () => void;
}

const DEFAULT_MAX = 5 * 1024 * 1024;

/**
 * Single-file upload with drag-and-drop and a real progress bar.
 *
 * Every module that accepts a file (student/teacher photo, lesson-plan
 * attachment, document, announcement attachment) posts multipart to its own
 * endpoint, so the request itself is the caller's business — this component owns
 * only selection, validation and progress.
 */
export function FileUpload({
  onUpload,
  accept = 'image/png,image/jpeg,image/webp',
  maxSizeBytes = DEFAULT_MAX,
  currentUrl,
  label,
  disabled = false,
  className,
  onUploaded,
}: FileUploadProps) {
  const { t } = useTranslation();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const isImage = accept.includes('image');

  function reset() {
    setFile(null);
    setProgress(null);
    setLocalError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  function accepts(candidate: File): boolean {
    const patterns = accept.split(',').map((entry) => entry.trim());
    return patterns.some((pattern) =>
      pattern.endsWith('/*')
        ? candidate.type.startsWith(pattern.slice(0, -1))
        : pattern.startsWith('.')
          ? candidate.name.toLowerCase().endsWith(pattern.toLowerCase())
          : candidate.type === pattern,
    );
  }

  function select(candidate: File | undefined) {
    if (!candidate) return;
    setLocalError(null);

    if (!accepts(candidate)) {
      setLocalError(t('file.wrongType'));
      return;
    }
    if (candidate.size > maxSizeBytes) {
      setLocalError(t('file.tooLarge', { size: formatBytes(maxSizeBytes) }));
      return;
    }

    setFile(candidate);
    if (isImage && candidate.type.startsWith('image/')) {
      setPreviewUrl(URL.createObjectURL(candidate));
    }
  }

  async function submit() {
    if (!file) return;
    setProgress(0);
    try {
      await onUpload(file, setProgress);
      onUploaded?.();
      reset();
    } catch {
      // The mutation's own error handling toasts; just leave the file selected
      // so the user can retry without picking it again.
      setProgress(null);
    }
  }

  const shownImage = previewUrl ?? currentUrl;
  const isUploading = progress !== null;

  return (
    <div className={cn('space-y-2', className)}>
      {label && <p className="text-sm font-medium">{label}</p>}

      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          if (!disabled) select(event.dataTransfer.files?.[0]);
        }}
        className={cn(
          'flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border p-4 transition-colors',
          isDragging && 'border-primary bg-primary-subtle',
          disabled && 'pointer-events-none opacity-60',
        )}
      >
        {isImage && shownImage && (
          <img
            src={shownImage}
            alt=""
            className="size-24 rounded-md border border-border object-cover"
          />
        )}

        {!isImage && file && (
          <div className="flex items-center gap-2 text-sm">
            <FileIcon className="size-4 text-muted-foreground" />
            <span className="font-medium">{file.name}</span>
          </div>
        )}

        <label
          htmlFor={inputId}
          className="cursor-pointer text-center text-sm text-muted-foreground hover:text-foreground"
        >
          {t('file.dropHint')}
          <span className="mt-0.5 block text-xs">{t('file.maxSize', { size: formatBytes(maxSizeBytes) })}</span>
        </label>

        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept}
          className="sr-only"
          disabled={disabled}
          onChange={(event) => select(event.target.files?.[0])}
        />

        {file && !isUploading && (
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={submit}>
              <Upload />
              {t('common.upload')}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={reset}>
              <X />
              {t('common.remove')}
            </Button>
          </div>
        )}

        {isUploading && (
          <div className="w-full space-y-1">
            <Progress value={progress} />
            <p className="text-center text-xs text-muted-foreground">
              {t('common.uploading')} {progress}%
            </p>
          </div>
        )}
      </div>

      {localError && <p className="text-xs font-medium text-danger">{localError}</p>}
      {file && !localError && (
        <p className="text-xs text-muted-foreground">
          {t('file.selected')}: {file.name} · {formatBytes(file.size)}
        </p>
      )}
    </div>
  );
}
