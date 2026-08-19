import { AxiosError } from 'axios';
import type { ApiErrorBody, ValidationDetails } from '@/types/common';

/**
 * Normalised error the whole app works with.
 *
 * Everything that can fail — a request, a mutation, a file upload — is turned
 * into one of these, so error UI never has to special-case axios internals.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly messageKey?: string;
  readonly details?: unknown;
  readonly requestId?: string;
  /** True when the request never reached the server (offline, DNS, CORS). */
  readonly isNetworkError: boolean;

  constructor(init: {
    message: string;
    status: number;
    messageKey?: string;
    details?: unknown;
    requestId?: string;
    isNetworkError?: boolean;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.messageKey = init.messageKey;
    this.details = init.details;
    this.requestId = init.requestId;
    this.isNetworkError = init.isNetworkError ?? false;
  }

  /** Field errors from ValidationPipe, ready to feed into react-hook-form. */
  get fieldErrors(): { field: string; message: string }[] {
    const details = this.details as ValidationDetails | undefined;
    if (!Array.isArray(details)) return [];

    return details
      .map((entry) => {
        if (typeof entry === 'string') {
          // ValidationPipe emits "propertyName must be a string" — take the head
          // as the field name so the message can be attached to the right input.
          const field = entry.split(' ')[0] ?? '';
          return { field, message: entry };
        }
        return entry;
      })
      .filter((entry) => Boolean(entry.field));
  }

  /** Fields that collided on a 409 duplicate-key error. */
  get duplicateFields(): string[] {
    const details = this.details as { fields?: string[] } | undefined;
    return Array.isArray(details?.fields) ? details.fields : [];
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof AxiosError) {
    const body = error.response?.data as ApiErrorBody | undefined;

    if (!error.response) {
      return new ApiError({
        message: error.message || 'Network request failed',
        status: 0,
        messageKey: 'common.networkError',
        isNetworkError: true,
      });
    }

    return new ApiError({
      message: body?.message ?? error.message,
      status: error.response.status,
      messageKey: body?.messageKey,
      details: body?.details,
      requestId: body?.requestId,
    });
  }

  return new ApiError({
    message: error instanceof Error ? error.message : String(error),
    status: 0,
    messageKey: 'common.internalError',
  });
}
