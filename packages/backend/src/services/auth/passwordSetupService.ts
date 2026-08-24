import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { generateSecret, generateURI, verify } from 'otplib';
import QRCode from 'qrcode';
import { BCRYPT_SALT_ROUNDS, isStrongPassword } from 'shared';
import { config } from '../../config.js';
import { logger } from '../../logging/logger.js';
import {
  findLiveSetupToken,
  findStudentAccount,
  findTotp,
  insertSetupToken,
  invalidateOtherSetupTokens,
  markSetupTokenUsed,
  markTotpConfirmed,
  updateStudentPassword,
  upsertTotpSecret,
} from '../../models/auth/index.js';
import type { SetupPurpose } from '../../models/auth/index.js';
import { buildPasswordSetupEmail, sendMail } from './mailer.js';

/**
 * First login: a student provisioned without a password sets one, either
 * through a link emailed to them or by pairing Microsoft Authenticator.
 *
 * Both paths end at the same place - a single-use setup token that authorises
 * exactly one password write.
 */

export type PasswordSetupErrorCode =
  | 'MISSING_REGISTRATION'
  | 'INVALID_TOKEN'
  | 'WEAK_PASSWORD'
  | 'PASSWORD_ALREADY_SET'
  | 'NO_EMAIL_ON_RECORD'
  | 'TOTP_NOT_STARTED'
  | 'INVALID_CODE'
  | 'MAIL_FAILED';

export type SetupResult<T> =
  { success: true; data: T } | { success: false; code: PasswordSetupErrorCode };

/** One 30-second step either side absorbs clock skew between phone and server. */
const TOTP_EPOCH_TOLERANCE_SECONDS = 30;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function minutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

/** Institutional address for a student with no explicit email on record. */
function resolveEmail(
  registrationNo: string,
  stored: string | null
): string | null {
  if (stored !== null && stored !== '') return stored;
  const domain = config.passwordSetup.studentEmailDomain;
  return domain === '' ? null : `${registrationNo}@${domain}`;
}

/** Shows enough of the address to be recognisable without disclosing it. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (domain === undefined) return '•••';
  const head = local.slice(0, 2);
  return `${head}${'•'.repeat(Math.max(local.length - 2, 3))}@${domain}`;
}

async function issueSetupToken(
  registrationNo: string,
  purpose: SetupPurpose,
  ttlMinutes: number
): Promise<string> {
  const token = randomBytes(32).toString('base64url');

  // Requesting a new token retires anything still outstanding, so an older
  // link stops working the moment a fresh one is issued.
  await invalidateOtherSetupTokens(registrationNo, null);
  await insertSetupToken(
    registrationNo,
    hashToken(token),
    purpose,
    minutesFromNow(ttlMinutes)
  );

  return token;
}

/* -------------------------------------------------------------------------- */
/* Path A: reset link by email                                                 */
/* -------------------------------------------------------------------------- */

export interface EmailRequestView {
  /** Masked so the screen can say where the link went. */
  sent_to: string | null;
}

/**
 * Sends the reset link.
 *
 * The caller always sees the same success response, whether or not the
 * registration number exists, so this endpoint cannot be used to discover which
 * students are registered.
 */
export async function requestEmailReset(
  registrationNoInput: unknown
): Promise<SetupResult<EmailRequestView>> {
  const registrationNo =
    typeof registrationNoInput === 'string' ? registrationNoInput.trim() : '';
  if (registrationNo === '') {
    return { success: false, code: 'MISSING_REGISTRATION' };
  }

  const student = await findStudentAccount(registrationNo);
  if (student === null) {
    logger.info('Password setup requested for an unknown registration number');
    return { success: true, data: { sent_to: null } };
  }

  const email = resolveEmail(student.registration_no, student.email);
  if (email === null) {
    return { success: false, code: 'NO_EMAIL_ON_RECORD' };
  }

  const token = await issueSetupToken(
    student.registration_no,
    'email',
    config.passwordSetup.emailTokenTtlMinutes
  );
  const link = `${config.passwordSetup.appBaseUrl}/set-password/new?token=${token}`;

  try {
    await sendMail({
      to: email,
      ...buildPasswordSetupEmail({
        name: student.name,
        link,
        expiryMinutes: config.passwordSetup.emailTokenTtlMinutes,
      }),
    });
  } catch (error) {
    logger.error('Failed to send the password setup email', {
      registration_no: student.registration_no,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return { success: false, code: 'MAIL_FAILED' };
  }

  logger.info('Password setup link sent', {
    registration_no: student.registration_no,
  });
  return { success: true, data: { sent_to: maskEmail(email) } };
}

/* -------------------------------------------------------------------------- */
/* Path B: Microsoft Authenticator                                             */
/* -------------------------------------------------------------------------- */

export interface TotpSetupView {
  /** Data URL of the QR code to scan. */
  qr_code: string;
  /** Same secret, for manual entry when the QR cannot be scanned. */
  manual_key: string;
  account: string;
}

export async function startTotpSetup(
  registrationNoInput: unknown
): Promise<SetupResult<TotpSetupView>> {
  const registrationNo =
    typeof registrationNoInput === 'string' ? registrationNoInput.trim() : '';
  if (registrationNo === '') {
    return { success: false, code: 'MISSING_REGISTRATION' };
  }

  const student = await findStudentAccount(registrationNo);
  if (student === null) {
    // Same shape as a wrong code: the endpoint stays quiet about who exists.
    return { success: false, code: 'INVALID_CODE' };
  }

  const secret = generateSecret();
  await upsertTotpSecret(student.registration_no, secret);

  const otpauth = generateURI({
    strategy: 'totp',
    issuer: config.passwordSetup.totpIssuer,
    label: student.registration_no,
    secret,
  });

  return {
    success: true,
    data: {
      qr_code: await QRCode.toDataURL(otpauth, { margin: 1, width: 240 }),
      manual_key: secret,
      account: student.registration_no,
    },
  };
}

export interface TotpVerifyView {
  /** Single-use token that authorises the password write. */
  setup_token: string;
  expires_in_minutes: number;
}

export async function verifyTotpCode(
  registrationNoInput: unknown,
  codeInput: unknown
): Promise<SetupResult<TotpVerifyView>> {
  const registrationNo =
    typeof registrationNoInput === 'string' ? registrationNoInput.trim() : '';
  const code =
    typeof codeInput === 'string' ? codeInput.replace(/\s/g, '') : '';

  if (registrationNo === '') {
    return { success: false, code: 'MISSING_REGISTRATION' };
  }
  if (!/^\d{6}$/.test(code)) {
    return { success: false, code: 'INVALID_CODE' };
  }

  const totp = await findTotp(registrationNo);
  if (totp === null) {
    return { success: false, code: 'TOTP_NOT_STARTED' };
  }
  const result = await verify({
    strategy: 'totp',
    secret: totp.secret,
    token: code,
    epochTolerance: TOTP_EPOCH_TOLERANCE_SECONDS,
  });

  if (!result.valid) {
    logger.warn('Rejected an authenticator code', {
      registration_no: registrationNo,
    });
    return { success: false, code: 'INVALID_CODE' };
  }

  await markTotpConfirmed(registrationNo);
  const token = await issueSetupToken(
    registrationNo,
    'totp',
    config.passwordSetup.totpTokenTtlMinutes
  );

  return {
    success: true,
    data: {
      setup_token: token,
      expires_in_minutes: config.passwordSetup.totpTokenTtlMinutes,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Shared: verify a token and set the password                                 */
/* -------------------------------------------------------------------------- */

export interface TokenCheckView {
  registration_no: string;
  name: string;
}

export async function checkSetupToken(
  tokenInput: unknown
): Promise<SetupResult<TokenCheckView>> {
  const token = typeof tokenInput === 'string' ? tokenInput : '';
  if (token === '') return { success: false, code: 'INVALID_TOKEN' };

  const row = await findLiveSetupToken(hashToken(token));
  if (row === null) return { success: false, code: 'INVALID_TOKEN' };

  const student = await findStudentAccount(row.registration_no);
  if (student === null) return { success: false, code: 'INVALID_TOKEN' };

  return {
    success: true,
    data: { registration_no: student.registration_no, name: student.name },
  };
}

export async function completePasswordSetup(
  tokenInput: unknown,
  passwordInput: unknown
): Promise<SetupResult<{ registration_no: string }>> {
  const token = typeof tokenInput === 'string' ? tokenInput : '';
  if (token === '') return { success: false, code: 'INVALID_TOKEN' };

  if (!isStrongPassword(passwordInput)) {
    return { success: false, code: 'WEAK_PASSWORD' };
  }

  const row = await findLiveSetupToken(hashToken(token));
  if (row === null) return { success: false, code: 'INVALID_TOKEN' };

  const passwordHash = await bcrypt.hash(passwordInput, BCRYPT_SALT_ROUNDS);
  await updateStudentPassword(row.registration_no, passwordHash);

  // The token is spent, and any other outstanding one is retired with it.
  await markSetupTokenUsed(row.token_id);
  await invalidateOtherSetupTokens(row.registration_no, row.token_id);

  logger.info('Password set through the first login flow', {
    registration_no: row.registration_no,
    purpose: row.purpose,
  });

  return { success: true, data: { registration_no: row.registration_no } };
}
