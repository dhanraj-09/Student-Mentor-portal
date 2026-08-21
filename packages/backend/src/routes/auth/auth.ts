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
import {
  checkSetupToken,
  completePasswordSetup,
  requestEmailReset,
  startTotpSetup,
  verifyTotpCode,
} from '../../services/auth/passwordSetupService.js';
import type { PasswordSetupErrorCode } from '../../services/auth/passwordSetupService.js';
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
  PASSWORD_NOT_SET: {
    status: 409,
    message:
      'Your password has not been set yet. Set your password first to access your account.',
  },
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

/* -------------------------------------------------------------------------- */
/* First login: setting a password that was never set                          */
/* -------------------------------------------------------------------------- */

const setupErrorResponses: Record<
  PasswordSetupErrorCode,
  { status: number; message: string }
> = {
  MISSING_REGISTRATION: {
    status: 400,
    message: 'Enter your registration number',
  },
  INVALID_TOKEN: {
    status: 400,
    message: 'That link is invalid or has expired. Request a new one.',
  },
  WEAK_PASSWORD: {
    status: 400,
    message:
      'Password must be at least 8 characters and include upper and lower case letters, a number and a special character',
  },
  PASSWORD_ALREADY_SET: {
    status: 409,
    message: 'A password is already set for this account',
  },
  NO_EMAIL_ON_RECORD: {
    status: 400,
    message:
      'No email address is on record for that account. Contact your department to have one added.',
  },
  TOTP_NOT_STARTED: {
    status: 400,
    message: 'Scan the QR code with Microsoft Authenticator first',
  },
  INVALID_CODE: {
    status: 400,
    message: 'That code is not valid. Check the app and try again.',
  },
  MAIL_FAILED: {
    status: 502,
    message: 'The email could not be sent. Please try again shortly.',
  },
};

function sendSetupError(res: Response, code: PasswordSetupErrorCode): void {
  const { status, message } = setupErrorResponses[code];
  res.status(status).json({ error: message });
}

/** Path A, step 4A: email a reset link. */
router.post(
  '/password-setup/email',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const result = await requestEmailReset(req.body?.registration_no);
    if (!result.success) {
      sendSetupError(res, result.code);
      return;
    }
    res.status(202).json({
      message: 'If that account exists, a reset link has been sent.',
      sent_to: result.data.sent_to,
    });
  })
);

/** Path B, step 4B/5B: pair Microsoft Authenticator. */
router.post(
  '/password-setup/authenticator/start',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const result = await startTotpSetup(req.body?.registration_no);
    if (!result.success) {
      sendSetupError(res, result.code);
      return;
    }
    res.status(200).json(result.data);
  })
);

/** Path B, step 6B: verify the 6-digit code. */
router.post(
  '/password-setup/authenticator/verify',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const result = await verifyTotpCode(
      req.body?.registration_no,
      req.body?.code
    );
    if (!result.success) {
      sendSetupError(res, result.code);
      return;
    }
    res.status(200).json(result.data);
  })
);

/** Steps 6A/7A and 7B: check the token behind the "set password" screen. */
router.get(
  '/password-setup/token',
  asyncHandler(async (req, res) => {
    const result = await checkSetupToken(req.query.token);
    if (!result.success) {
      sendSetupError(res, result.code);
      return;
    }
    res.status(200).json(result.data);
  })
);

/** Steps 7A/7B: write the new password. */
router.post(
  '/password-setup/complete',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const result = await completePasswordSetup(
      req.body?.token,
      req.body?.password
    );
    if (!result.success) {
      sendSetupError(res, result.code);
      return;
    }
    res.status(200).json({ message: 'Password set successfully' });
  })
);

export default router;
