/**
 * Refresh token v httpOnly cookie (PC-18 — production-config-audit).
 *
 * Refresh token (dlouhá životnost) patří do `httpOnly` cookie, ne do localStorage
 * (kam dosáhne XSS). Access token zůstává Bearer (krátká životnost). Cookie je
 * `SameSite=None; Secure` v produkci (projde i cross-site FE↔BE), `Lax` v devu;
 * `path=/api/auth` → posílá se jen na auth endpointy (refresh/logout), ne všude.
 *
 * Bez závislosti na cookie-parser — čtení parsuje hlavičku ručně, zápis přes
 * Express `res.cookie()`.
 */
import type { Request, Response } from 'express';

export const REFRESH_COOKIE = 'ikaros_rt';

function isProd(): boolean {
  return process.env.NODE_ENV === 'production';
}

function ttlMs(): number {
  const days = Number(process.env.JWT_REFRESH_TTL_DAYS ?? 30);
  const safe = Number.isFinite(days) && days >= 1 ? days : 30;
  return safe * 24 * 60 * 60 * 1000;
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProd(),
    sameSite: isProd() ? 'none' : 'lax',
    path: '/api/auth',
    maxAge: ttlMs(),
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: isProd(),
    sameSite: isProd() ? 'none' : 'lax',
    path: '/api/auth',
  });
}

/** Přečte refresh token z cookie hlavičky (bez cookie-parser). */
export function readRefreshCookie(req: Request): string | undefined {
  const header = req.headers?.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === REFRESH_COOKIE) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return undefined;
}
