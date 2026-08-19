/**
 * Where tokens live.
 *
 * The access token is kept in a module variable only — it never touches
 * `localStorage`, so a successful XSS cannot read it out of storage after the
 * tab closes, and it disappears on reload.
 *
 * The refresh token *is* persisted, because without it every page reload would
 * force a fresh login. It is single-use: the API rotates it on each `/auth/refresh`
 * and revokes every session if an already-rotated token is replayed, which caps
 * the damage from a stolen one.
 *
 * (The backend has no cookie flow today. Moving to an httpOnly refresh cookie is
 * a backend change plus CSRF protection; only this file would change here.)
 */

const REFRESH_TOKEN_KEY = 'vpsi.refreshToken';

let accessToken: string | null = null;
/** Absolute epoch ms at which the access token stops being accepted. */
let accessTokenExpiresAt = 0;

export const tokenStore = {
  getAccessToken(): string | null {
    return accessToken;
  },

  /** `expiresIn` is the API's value in seconds. */
  setAccessToken(token: string | null, expiresIn?: number): void {
    accessToken = token;
    accessTokenExpiresAt = token && expiresIn ? Date.now() + expiresIn * 1000 : 0;
  },

  /**
   * True within `skewSeconds` of expiry, so a request can refresh proactively
   * instead of taking a guaranteed 401 first.
   */
  isAccessTokenExpiring(skewSeconds = 30): boolean {
    if (!accessToken) return true;
    if (!accessTokenExpiresAt) return false;
    return Date.now() >= accessTokenExpiresAt - skewSeconds * 1000;
  },

  getRefreshToken(): string | null {
    try {
      return localStorage.getItem(REFRESH_TOKEN_KEY);
    } catch {
      // Private-mode Safari and similar can throw on access.
      return null;
    }
  },

  setRefreshToken(token: string | null): void {
    try {
      if (token) localStorage.setItem(REFRESH_TOKEN_KEY, token);
      else localStorage.removeItem(REFRESH_TOKEN_KEY);
    } catch {
      /* storage unavailable — the session simply won't survive a reload */
    }
  },

  clear(): void {
    accessToken = null;
    accessTokenExpiresAt = 0;
    tokenStore.setRefreshToken(null);
  },
};
