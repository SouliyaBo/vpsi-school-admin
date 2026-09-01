import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient, download, get, post } from '@/lib/api-client';

/** The editable body of a ໃບຢັ້ງຢືນການສຶກສາ. */
export interface StudyCertificateFields {
  birthPlaceLo?: string;
  fatherNameLo?: string;
  motherNameLo?: string;
  currentAddressLo?: string;
  studyFromYearCode?: string;
  studyToYearCode?: string;
  classLabelLo?: string;
}

export type StudyCertificateField = keyof StudyCertificateFields;

export interface StudyCertificatePrefill extends StudyCertificateFields {
  studentId: string;
  studentCode: string;
  titleLo: string;
  fullNameLo: string;
  dateOfBirth: string | null;
  /** Fields the register could not answer; the office types these. */
  missing: StudyCertificateField[];
}

export interface StudyCertificateInput extends StudyCertificateFields {
  studentId: string;
  issuedDate?: string;
}

/**
 * What the register can answer about this pupil, and what it cannot.
 *
 * Fetched only while the dialog is open: the answer depends on the pupil's
 * enrollments and on the last letter issued to them, so a cached copy from a
 * previous visit could be stale in a way nobody would notice until it was
 * printed.
 */
export function useStudyCertificatePrefill(studentId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['certificates', 'study-verification', 'prefill', studentId],
    queryFn: () =>
      get<StudyCertificatePrefill>(`/certificates/study-verification/prefill/${studentId}`),
    enabled: Boolean(studentId) && enabled,
    staleTime: 0,
  });
}

/** Downloads a PDF blob and hands it to the browser as a file. */
function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  // Revoking immediately can cancel the download in Safari, so the object URL is
  // released on the next tick instead.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Renders the letter without issuing it.
 *
 * Separate mutation from issuing because the two have different costs: a preview
 * can be run as often as the wording needs checking, while issuing spends a
 * number from a gap-free series that outsiders verify.
 */
export function usePreviewStudyCertificate() {
  return useMutation({
    mutationFn: (input: StudyCertificateInput) =>
      post<Blob>('/certificates/study-verification/preview', input, { responseType: 'blob' }),
    onSuccess: (blob) => saveBlob(blob, 'study-verification-draft.pdf'),
  });
}

export function useIssueStudyCertificate() {
  return useMutation({
    // The one call that goes through the axios instance rather than the `post`
    // helper: the allocated number comes back on a response header, and the
    // helper returns only the body — which here is the PDF itself. The office
    // writes that number into its own book, so losing it is not an option.
    mutationFn: async (input: StudyCertificateInput) => {
      const response = await apiClient.post<Blob>('/certificates/study-verification', input, {
        responseType: 'blob',
      });
      const header = response.headers['x-certificate-number'];
      const certificateNumber = typeof header === 'string' ? decodeURIComponent(header) : null;
      return { blob: response.data, certificateNumber };
    },
    // The download itself happens here so every caller gets the file; the
    // caller adds whatever it wants to say about the number it was given.
    onSuccess: ({ blob, certificateNumber }) =>
      saveBlob(blob, `${(certificateNumber ?? 'certificate').replace(/[^\p{L}\p{N}]+/gu, '-')}.pdf`),
  });
}

/** Re-downloads an already-issued certificate. */
export function useDownloadCertificate() {
  return useMutation({
    mutationFn: (id: string) => download(`/certificates/${id}/file`),
    onSuccess: (blob) => saveBlob(blob, 'certificate.pdf'),
  });
}
