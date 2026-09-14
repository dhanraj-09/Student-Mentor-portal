import type { AuthTokenPayload } from 'shared';

declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
      /** Correlation id assigned by the request logger. */
      id?: string;
    }
  }
}

export {};
