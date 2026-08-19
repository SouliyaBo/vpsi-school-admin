import { File as FileIcon, Paperclip, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatBytes } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/** 20 MB, matching the API's `UPLOAD_RULES.document`. */
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

/**
 * The same set the API accepts for a `document` upload — PDF, Word, Excel,
 * PowerPoint and a photographed page.
 *
 * Both extensions and MIME types are listed: Windows reports `.docx` with a MIME
 * type that varies by which Office version wrote it, so matching on either is
 * what keeps a valid file from being refused in the browser before it is ever
 * sent.
 */
export const ACCEPTED_DOCUMENTS = [
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.png',
  '.jpg',
  '.jpeg',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png',
  'image/jpeg',
].join(',');

/** Whether a file matches an `accept` string, by extension or by MIME type. */
export function isAccepted(file: File, accept = ACCEPTED_DOCUMENTS): boolean {
  return accept
    .split(',')
    .map((entry) => entry.trim())
    .some((pattern) =>
      pattern.startsWith('.')
        ? file.name.toLowerCase().endsWith(pattern.toLowerCase())
        : file.type === pattern,
    );
}

interface Props {
  /** Files staged for upload. */
  files: File[];
  onChange: (files: File[]) => void;
  /** Shown under the drop area, e.g. "uploaded once the plan is saved". */
  hint?: string;
  disabled?: boolean;
}

/**
 * Picks documents *before* there is anything to attach them to.
 *
 * `FileUpload` posts the moment a file is chosen, which the create form cannot
 * do: the API keys an attachment to a plan id, and the plan does not exist until
 * the form is submitted. So this only stages files, and the caller uploads them
 * once the id comes back.
 */
export function AttachmentPicker({ files, onChange, hint, disabled = false }: Props) {
  const { t } = useTranslation();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  /** Why the last pick was refused — silently dropping a file reads as a bug. */
  const [error, setError] = useState<string | null>(null);

  function add(candidates: FileList | null) {
    if (!candidates?.length) return;
    setError(null);

    const merged = [...files];
    for (const file of Array.from(candidates)) {
      if (!isAccepted(file)) {
        setError(t('file.wrongType'));
        continue;
      }
      if (file.size > MAX_DOCUMENT_BYTES) {
        setError(t('file.tooLarge', { size: formatBytes(MAX_DOCUMENT_BYTES) }));
        continue;
      }
      // Same name and size twice over is a double-click, not two documents.
      if (merged.some((kept) => kept.name === file.name && kept.size === file.size)) continue;
      merged.push(file);
    }

    onChange(merged);
    // Clear the input so re-picking the same file fires `change` again.
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="space-y-2">
      <label
        htmlFor={inputId}
        className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed border-border p-4 text-center text-sm text-muted-foreground hover:text-foreground"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (!disabled) add(event.dataTransfer.files);
        }}
      >
        <Paperclip className="size-4" />
        {t('file.dropHint')}
        <span className="text-xs">
          {t('lessonPlan.uploadHint', { max: formatBytes(MAX_DOCUMENT_BYTES) })}
        </span>
      </label>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        multiple
        accept={ACCEPTED_DOCUMENTS}
        className="sr-only"
        disabled={disabled}
        onChange={(event) => add(event.target.files)}
      />

      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((file) => (
            <li
              key={`${file.name}-${file.size}`}
              className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm"
            >
              <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatBytes(file.size)}
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled}
                aria-label={t('common.remove')}
                onClick={() => onChange(files.filter((kept) => kept !== file))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-xs font-medium text-danger">{error}</p>}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
