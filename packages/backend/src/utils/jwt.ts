/**
 * JWT signing and verification.
 *
 * Tokens are signed with HMAC-SHA256 (HS256): the signature is
 * HMAC-SHA256(base64(header).base64(payload), secret). The algorithm is pinned
 * on verify so a token cannot be downgraded to `none` or an asymmetric alg.
 *
 * Two separate secrets are used so a leaked access-token secret cannot be used
 * to mint refresh tokens.
 */

import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { JWT_ALGORITHM } from 'shared';
import type { AuthTokenPayload } from 'shared';
import { config } from '../config.js';

/** Payload as supplied by the caller, before jsonwebtoken adds `iat`/`exp`. */
export type TokenInput =
  | { registration_no: string; type: 'student' }
  | { email: string; type: 'faculty' };

export type VerifyResult =
  | { valid: true; payload: AuthTokenPayload }
  | { valid: false; expired: boolean };

function sign(payload: TokenInput, secret: string, expiresIn: string): string {
  return jwt.sign(payload, secret, {
    algorithm: JWT_ALGORITHM,
    // Cast because @types/jsonwebtoken narrows `expiresIn` to a template
    // literal type in newer releases, while the value comes from config.
    expiresIn: expiresIn as SignOptions['expiresIn'],
  });
}

/** Short-lived token the client keeps in memory only. */
export function signAccessToken(payload: TokenInput): string {
  return sign(payload, config.auth.jwtSecret, config.auth.accessTokenExpiry);
}

/** Long-lived token stored in an httpOnly, path-scoped cookie. */
export function signRefreshToken(payload: TokenInput): string {
  return sign(
    payload,
    config.auth.refreshSecret,
    config.auth.refreshTokenExpiry
  );
}

/** Narrows an arbitrary decoded payload to a known auth payload shape. */
function toAuthPayload(decoded: unknown): AuthTokenPayload | null {
  if (typeof decoded !== 'object' || decoded === null) return null;

  const candidate = decoded as Record<string, unknown>;

  if (
    candidate.type === 'student' &&
    typeof candidate.registration_no === 'string'
  ) {
    return {
      registration_no: candidate.registration_no,
      type: 'student',
      iat: typeof candidate.iat === 'number' ? candidate.iat : undefined,
      exp: typeof candidate.exp === 'number' ? candidate.exp : undefined,
    };
  }

  if (candidate.type === 'faculty' && typeof candidate.email === 'string') {
    return {
      email: candidate.email,
      type: 'faculty',
      iat: typeof candidate.iat === 'number' ? candidate.iat : undefined,
      exp: typeof candidate.exp === 'number' ? candidate.exp : undefined,
    };
  }

  return null;
}

function verify(token: string, secret: string): VerifyResult {
  try {
    const decoded = jwt.verify(token, secret, { algorithms: [JWT_ALGORITHM] });
    const payload = toAuthPayload(decoded);
    if (payload === null) return { valid: false, expired: false };
    return { valid: true, payload };
  } catch (error) {
    const expired = error instanceof jwt.TokenExpiredError;
    return { valid: false, expired };
  }
}

export function verifyAccessToken(token: string): VerifyResult {
  return verify(token, config.auth.jwtSecret);
}

export function verifyRefreshToken(token: string): VerifyResult {
  return verify(token, config.auth.refreshSecret);
}
