import type { RowDataPacket } from 'mysql2/promise';
import { mutate, query, queryOne } from '../shared/index.js';

/**
 * Storage for the first login flow.
 *
 * Reset tokens are stored as a SHA-256 hash, so a leaked database row cannot be
 * turned back into a working link. TOTP secrets are stored as issued, because
 * verifying a code requires the secret itself.
 */

export type SetupPurpose = 'email' | 'totp';

export interface StudentAccountRow extends RowDataPacket {
  registration_no: string;
  name: string;
  email: string | null;
  password_hash: string | null;
}

export interface SetupTokenRow extends RowDataPacket {
  token_id: number;
  registration_no: string;
  purpose: SetupPurpose;
  expires_at: Date;
  used_at: Date | null;
}

export interface TotpRow extends RowDataPacket {
  registration_no: string;
  secret: string;
  confirmed_at: Date | null;
}

export function findStudentAccount(
  registrationNo: string
): Promise<StudentAccountRow | null> {
  return queryOne<StudentAccountRow>(
    `SELECT registration_no, name, email, password_hash
     FROM student
     WHERE registration_no = ?`,
    [registrationNo]
  );
}

/* -------------------------------------------------------------------------- */
/* Setup tokens                                                                */
/* -------------------------------------------------------------------------- */

export async function insertSetupToken(
  registrationNo: string,
  tokenHash: string,
  purpose: SetupPurpose,
  expiresAt: Date
): Promise<void> {
  await mutate(
    `INSERT INTO password_setup_tokens(registration_no, token_hash, purpose, expires_at)
     VALUES (?, ?, ?, ?)`,
    [registrationNo, tokenHash, purpose, expiresAt]
  );
}

/** Only unused, unexpired tokens come back. */
export function findLiveSetupToken(
  tokenHash: string
): Promise<SetupTokenRow | null> {
  return queryOne<SetupTokenRow>(
    `SELECT token_id, registration_no, purpose, expires_at, used_at
     FROM password_setup_tokens
     WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()`,
    [tokenHash]
  );
}

export async function markSetupTokenUsed(tokenId: number): Promise<void> {
  await mutate(
    `UPDATE password_setup_tokens SET used_at = NOW() WHERE token_id = ?`,
    [tokenId]
  );
}

/**
 * Invalidates any other outstanding token for the student, so requesting a new
 * link silently retires the previous one.
 */
export async function invalidateOtherSetupTokens(
  registrationNo: string,
  exceptTokenId: number | null
): Promise<void> {
  await mutate(
    `UPDATE password_setup_tokens
        SET used_at = NOW()
      WHERE registration_no = ? AND used_at IS NULL AND token_id <> ?`,
    [registrationNo, exceptTokenId ?? 0]
  );
}

/** Recent unused tokens, used to throttle repeated link requests. */
export function countRecentSetupTokens(
  registrationNo: string,
  withinMinutes: number
): Promise<RowDataPacket[]> {
  return query(
    `SELECT token_id FROM password_setup_tokens
      WHERE registration_no = ?
        AND created_at > (NOW() - INTERVAL ? MINUTE)`,
    [registrationNo, withinMinutes]
  );
}

/* -------------------------------------------------------------------------- */
/* Passwords                                                                   */
/* -------------------------------------------------------------------------- */

export async function updateStudentPassword(
  registrationNo: string,
  passwordHash: string
): Promise<void> {
  await mutate(
    `UPDATE student SET password_hash = ? WHERE registration_no = ?`,
    [passwordHash, registrationNo]
  );
}

/* -------------------------------------------------------------------------- */
/* Microsoft Authenticator (TOTP)                                              */
/* -------------------------------------------------------------------------- */

export function findTotp(registrationNo: string): Promise<TotpRow | null> {
  return queryOne<TotpRow>(
    `SELECT registration_no, secret, confirmed_at
     FROM student_totp
     WHERE registration_no = ?`,
    [registrationNo]
  );
}

export async function upsertTotpSecret(
  registrationNo: string,
  secret: string
): Promise<void> {
  await mutate(
    `INSERT INTO student_totp(registration_no, secret)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE secret = VALUES(secret), confirmed_at = NULL`,
    [registrationNo, secret]
  );
}

export async function markTotpConfirmed(registrationNo: string): Promise<void> {
  await mutate(
    `UPDATE student_totp SET confirmed_at = NOW() WHERE registration_no = ?`,
    [registrationNo]
  );
}
