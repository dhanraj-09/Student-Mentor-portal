import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../../../src/utils/jwt.js';

const STUDENT = { registration_no: '229301001', type: 'student' } as const;
const FACULTY = { email: 'mentor@example.edu', type: 'faculty' } as const;

describe('access tokens', () => {
  it('round-trips a student payload', () => {
    const result = verifyAccessToken(signAccessToken(STUDENT));

    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.payload).toMatchObject(STUDENT);
  });

  it('round-trips a faculty payload', () => {
    const result = verifyAccessToken(signAccessToken(FACULTY));

    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.payload).toMatchObject(FACULTY);
  });

  it('rejects a token signed with the refresh secret', () => {
    // The two secrets are distinct precisely so a refresh token cannot be
    // presented as an access token.
    const result = verifyAccessToken(signRefreshToken(STUDENT));

    expect(result).toEqual({ valid: false, expired: false });
  });

  it('rejects a tampered signature', () => {
    const token = signAccessToken(STUDENT);
    const tampered = `${token.slice(0, -3)}abc`;

    expect(verifyAccessToken(tampered).valid).toBe(false);
  });

  it('reports expiry separately, so the client knows to refresh', () => {
    const expired = jwt.sign(STUDENT, 'test-access-secret', {
      algorithm: 'HS256',
      expiresIn: '-1s',
    });

    expect(verifyAccessToken(expired)).toEqual({ valid: false, expired: true });
  });

  it('rejects a well-signed token whose payload is not a known shape', () => {
    // Correct secret, wrong claims: must not authenticate anyone.
    const bogus = jwt.sign({ type: 'admin' }, 'test-access-secret', {
      algorithm: 'HS256',
    });

    expect(verifyAccessToken(bogus)).toEqual({ valid: false, expired: false });
  });

  it('rejects a student token that carries no registration number', () => {
    const bogus = jwt.sign({ type: 'student' }, 'test-access-secret', {
      algorithm: 'HS256',
    });

    expect(verifyAccessToken(bogus).valid).toBe(false);
  });

  it('rejects the "none" algorithm', () => {
    // An unsigned token must never be accepted, whatever it claims.
    const unsigned = jwt.sign(STUDENT, '', { algorithm: 'none' });

    expect(verifyAccessToken(unsigned).valid).toBe(false);
  });
});

describe('refresh tokens', () => {
  it('round-trips through the refresh secret', () => {
    const result = verifyRefreshToken(signRefreshToken(FACULTY));

    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.payload).toMatchObject(FACULTY);
  });

  it('rejects an access token', () => {
    expect(verifyRefreshToken(signAccessToken(FACULTY)).valid).toBe(false);
  });

  it('rejects a malformed string', () => {
    expect(verifyRefreshToken('not-a-token').valid).toBe(false);
  });
});
