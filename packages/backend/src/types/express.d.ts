import type { AuthTokenPayload } from 'shared';

/**
 * Attaches the decoded JWT payload to the request, set by the authentication
 * middleware. It is optional here because it is absent on unauthenticated
 * routes; the `getStudentUser` / `getFacultyUser` helpers narrow it safely.
 */
declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

export {};
