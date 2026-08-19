import type { PermissionAction, PermissionResource, PersonType } from './enums';

/** Shape every paginated list endpoint returns. */
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

/** Query parameters accepted by every list endpoint. */
export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
}

/** The API's hard cap — asking for more is a 400. */
export const MAX_PAGE_SIZE = 100;

/**
 * Error body produced by the API's global exception filter.
 *
 * `messageKey` is the stable identifier (`auth.invalidCredentials`,
 * `common.duplicate`, …); `message` is already localised by the backend from the
 * `Accept-Language` header. The frontend prefers its own translation of
 * `messageKey` and falls back to `message`.
 */
export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string;
  messageKey?: string;
  details?: unknown;
  path: string;
  timestamp: string;
  requestId?: string;
}

/** Field-level errors as ValidationPipe reports them (`details` on a 400). */
export type ValidationDetails = string[] | { field: string; message: string }[];

export interface ResolvedPermission {
  resource: PermissionResource;
  actions: PermissionAction[];
}

/** `GET /auth/me`, and the `user` half of the login response. */
export interface AuthUser {
  id: string;
  username: string;
  roleCode: string;
  personType: PersonType;
  personId: string | null;
  mustChangePassword: boolean;
  locale: string;
  permissions: ResolvedPermission[];
}

/**
 * `GET /auth/me` returns the request-scoped user, which names the id `sub`
 * (the JWT claim) rather than `id`. Both shapes are normalised on the way in.
 */
export interface AuthMeResponse extends Omit<AuthUser, 'id'> {
  sub?: string;
  id?: string;
  roleId?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

export interface LoginResponse {
  tokens: AuthTokens;
  user: AuthUser;
}

/** Audit columns present on every persisted document. */
export interface Timestamped {
  createdAt?: string;
  updatedAt?: string;
}

export interface WithId {
  id: string;
}

/**
 * A reference field is an id string on list endpoints and a populated object on
 * detail endpoints. Read it through `refId()` / `refName()` in `lib/utils`.
 */
export type Ref<T> = string | (T & WithId) | null;
