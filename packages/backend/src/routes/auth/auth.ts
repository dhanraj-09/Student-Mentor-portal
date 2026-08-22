import { Router } from 'express';
import type { CookieOptions, Response } from 'express';
import {
  REFRESH_COOKIE_MAX_AGE_MS,
  REFRESH_COOKIE_NAMES,
  REFRESH_COOKIE_PATHS,
} from 'shared';
import type { UserType } from 'shared';
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

function refreshCookieOptions(role: UserType): CookieOptions {
  return {
    httpOnly: true,
    secure: config.isProduction,
    // Cross-site in production (frontend and backend on different domains):
    // the cookie is only sent if SameSite=None, which browsers require to be
    // paired with Secure. Locally (same-site localhost) 'lax' over plain HTTP.
    sameSite: config.isProduction ? 'none' : 'lax',
    path: REFRESH_COOKIE_PATHS[role],
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  };
}

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
    res.cookie(
      REFRESH_COOKIE_NAMES.student,
      refreshToken,
      refreshCookieOptions('student')
    );
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
    res.cookie(
      REFRESH_COOKIE_NAMES.faculty,
      refreshToken,
      refreshCookieOptions('faculty')
    );
    res.status(200).json({ message: 'Login successful', accessToken, faculty });
  })
);

// Per-role refresh/logout endpoints. The path must match the cookie's path so
// the browser attaches that role's refresh cookie (and only that one).
const ROLES: UserType[] = ['student', 'faculty'];
for (const role of ROLES) {
  router.post(`/refresh-token/${role}`, (req, res) => {
    const result = refreshAccessToken(
      req.cookies?.[REFRESH_COOKIE_NAMES[role]]
    );
    if (!result.success) {
      sendError(res, result.code);
      return;
    }
    res.status(200).json(result.data);
  });

  router.post(`/logout/${role}`, (_req, res) => {
    // Match the attributes the cookie was set with so browsers clear it,
    // including cross-site (SameSite=None; Secure) in production.
    res.clearCookie(REFRESH_COOKIE_NAMES[role], {
      path: REFRESH_COOKIE_PATHS[role],
      secure: config.isProduction,
      sameSite: config.isProduction ? 'none' : 'lax',
    });
    res.status(200).json({ message: 'Logged out successfully' });
  });
}

export default router;
