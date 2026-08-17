/**
 * Public authentication routes, mounted at /auth.
 *
 * Token handling is deliberately split: the short-lived access token is
 * returned in the body (the client keeps it in memory only), while the
 * long-lived refresh token goes into an httpOnly, path-scoped cookie that
 * JavaScript can never read.
 */

import { Router } from 'express';
import type { CookieOptions, Response } from 'express';
import {
  REFRESH_COOKIE_MAX_AGE_MS,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
} from 'shared';
import { config } from '../../config.js';
import {
  loginLimiter,
  registrationLimiter,
} from '../../middleware/rateLimiter.js';
import {
  loginFaculty,
  loginStudent,
  refreshAccessToken,
  registerFaculty,
  registerStudent,
} from '../../services/auth/index.js';
import type { AuthErrorCode } from '../../services/auth/index.js';
import { asyncHandler } from '../../utils/helpers.js';

const router = Router();

/** Maps a service error code onto its HTTP status and client-facing message. */
const errorResponses: Record<
  AuthErrorCode,
  { status: number; message: string }
> = {
  MISSING_CREDENTIALS: { status: 400, message: 'Missing credentials' },
  WEAK_PASSWORD: {
    status: 400,
    message: 'Password must be at least 8 characters',
  },
  DUPLICATE_ACCOUNT: { status: 400, message: 'That account already exists' },
  INVALID_CREDENTIALS: { status: 401, message: 'Invalid credentials' },
  MISSING_REFRESH_TOKEN: { status: 401, message: 'Refresh token required' },
  INVALID_REFRESH_TOKEN: { status: 401, message: 'Invalid refresh token' },
};

function sendError(res: Response, code: AuthErrorCode): void {
  const { status, message } = errorResponses[code];
  res.status(status).json({ error: message });
}

const refreshCookieOptions: CookieOptions = {
  httpOnly: true,
  // HTTPS-only in production; plain HTTP is needed for local development.
  secure: config.isProduction,
  sameSite: 'lax',
  path: REFRESH_COOKIE_PATH,
  maxAge: REFRESH_COOKIE_MAX_AGE_MS,
};

// ===== Registration =====

router.post(
  '/register-student',
  registrationLimiter,
  asyncHandler(async (req, res) => {
    const result = await registerStudent(req.body);
    if (!result.success) {
      sendError(res, result.code);
      return;
    }
    res.status(201).json({ message: 'Student registered successfully' });
  })
);

router.post(
  '/register-faculty',
  registrationLimiter,
  asyncHandler(async (req, res) => {
    const result = await registerFaculty(req.body);
    if (!result.success) {
      sendError(res, result.code);
      return;
    }
    res.status(201).json({ message: 'Faculty registered successfully' });
  })
);

// ===== Login =====

router.post(
  '/login-student',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const result = await loginStudent(
      req.body?.registration_no,
      req.body?.password
    );
    if (!result.success) {
      sendError(res, result.code);
      return;
    }

    const { accessToken, refreshToken, student } = result.data;
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions);
    res.status(200).json({ message: 'Login successful', accessToken, student });
  })
);

router.post(
  '/login-faculty',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const result = await loginFaculty(req.body?.email, req.body?.password);
    if (!result.success) {
      sendError(res, result.code);
      return;
    }

    const { accessToken, refreshToken, faculty } = result.data;
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions);
    res.status(200).json({ message: 'Login successful', accessToken, faculty });
  })
);

// ===== Session lifecycle =====

router.post('/refresh-token', (req, res) => {
  // The refresh token travels in the cookie, never the request body.
  const result = refreshAccessToken(req.cookies?.[REFRESH_COOKIE_NAME]);
  if (!result.success) {
    sendError(res, result.code);
    return;
  }
  res.status(200).json(result.data);
});

router.post('/logout', (_req, res) => {
  // Path must match how the cookie was set or the browser keeps it.
  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
  res.status(200).json({ message: 'Logged out successfully' });
});

export default router;
