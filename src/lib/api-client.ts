import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import type { AuthTokens } from '@/types/common';
import { toApiError } from './api-error';
import { tokenStore } from './token-store';

/**
 * Two request-scoped flags the interceptors below rely on. Declaring them on
 * axios' own config type keeps them typed at every call site instead of needing a
 * cast wherever they are set.
 */
declare module 'axios' {
  interface AxiosRequestConfig {
    /** Set on `/auth/*` calls that must never trigger a refresh attempt. */
    _skipAuthRefresh?: boolean;
    /** Guards against retrying the same request more than once after a 401. */
    _retried?: boolean;
  }
}

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? 'http://localhost:3000/api/v1';

/** Read by the request interceptor so responses come back in the UI language. */
let currentLocale = 'lo';
export function setApiLocale(locale: string): void {
  currentLocale = locale;
}

/** Called when the session is unrecoverable, so the app can send the user to /login. */
type SessionExpiredHandler = () => void;
let onSessionExpired: SessionExpiredHandler = () => {};
export function setSessionExpiredHandler(handler: SessionExpiredHandler): void {
  onSessionExpired = handler;
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * A bare client for the refresh call itself.
 *
 * Refreshing through `apiClient` would re-enter the response interceptor on
 * failure and recurse.
 */
const refreshClient = axios.create({ baseURL: API_BASE_URL, timeout: 15_000 });

type RetriableRequest = InternalAxiosRequestConfig;

/**
 * The in-flight refresh, if any.
 *
 * Ten queries firing at once on a stale token must produce **one** refresh
 * request: the API rotates the refresh token and treats a replay of the old one
 * as theft, revoking every session. Without this single-flight guard, a burst of
 * parallel 401s would log the user out.
 */
let refreshInFlight: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) throw toApiError(new Error('No refresh token'));

  const { data } = await refreshClient.post<AuthTokens>('/auth/refresh', { refreshToken });

  tokenStore.setAccessToken(data.accessToken, data.expiresIn);
  tokenStore.setRefreshToken(data.refreshToken);
  return data.accessToken;
}

function runRefresh(): Promise<string> {
  refreshInFlight ??= refreshAccessToken().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

apiClient.interceptors.request.use(async (config: RetriableRequest) => {
  config.headers['Accept-Language'] = currentLocale;

  // Proactive refresh: the access token lives 15 minutes, and swapping it just
  // before expiry avoids a wasted round trip on the next request.
  if (
    !config._skipAuthRefresh &&
    tokenStore.getRefreshToken() &&
    tokenStore.getAccessToken() &&
    tokenStore.isAccessTokenExpiring()
  ) {
    try {
      await runRefresh();
    } catch {
      /* fall through — the 401 handler below deals with it */
    }
  }

  const token = tokenStore.getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // Let axios pick the multipart boundary for FormData bodies.
  if (config.data instanceof FormData) delete config.headers['Content-Type'];

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const request = error.config as RetriableRequest | undefined;

    const shouldRefresh =
      error.response?.status === 401 &&
      request &&
      !request._retried &&
      !request._skipAuthRefresh &&
      Boolean(tokenStore.getRefreshToken());

    if (shouldRefresh) {
      request._retried = true;
      try {
        const token = await runRefresh();
        request.headers.Authorization = `Bearer ${token}`;
        return apiClient.request(request);
      } catch {
        tokenStore.clear();
        onSessionExpired();
        return Promise.reject(toApiError(error));
      }
    }

    // A 401 with no way to recover means the session is over.
    if (error.response?.status === 401 && !request?._skipAuthRefresh) {
      tokenStore.clear();
      onSessionExpired();
    }

    return Promise.reject(toApiError(error));
  },
);

/** `GET`, unwrapped to the response body. */
export async function get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await apiClient.get<T>(url, config);
  return data;
}

export async function post<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const { data } = await apiClient.post<T>(url, body, config);
  return data;
}

export async function patch<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const { data } = await apiClient.patch<T>(url, body, config);
  return data;
}

export async function put<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await apiClient.put<T>(url, body, config);
  return data;
}

export async function del<T = void>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await apiClient.delete<T>(url, config);
  return data;
}

/**
 * Multipart upload with progress.
 *
 * `onProgress` receives 0–100, or is skipped entirely when the browser cannot
 * determine the total size.
 */
export async function upload<T>(
  url: string,
  formData: FormData,
  onProgress?: (percent: number) => void,
): Promise<T> {
  const { data } = await apiClient.post<T>(url, formData, {
    onUploadProgress: (event) => {
      if (!onProgress || !event.total) return;
      onProgress(Math.round((event.loaded * 100) / event.total));
    },
  });
  return data;
}

/** Fetches a binary body (report PDF, certificate) for download. */
export async function download(url: string): Promise<Blob> {
  const { data } = await apiClient.get<Blob>(url, { responseType: 'blob' });
  return data;
}

/** Used by the auth feature for calls that must bypass the refresh machinery. */
export const authRequestConfig: AxiosRequestConfig = { _skipAuthRefresh: true };
