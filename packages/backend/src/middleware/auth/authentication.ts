/**
 * Verifies the access token and attaches the decoded payload to `req.user`.
 *
 * A 401 here is the frontend's signal to silently refresh and retry, so the
 * expired case is reported distinctly from a malformed/forged token.
 */

import type { RequestHandler } from 'express';
import { verifyAccessToken } from '../../utils/jwt.js';

function extractBearerToken(header: string | undefined): string | null {
  if (header === undefined) return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || token === undefined || token.length === 0)
    return null;
  return token;
}

export const authenticate: RequestHandler = (req, res, next) => {
  const token = extractBearerToken(req.headers.authorization);

  if (token === null) {
    res.status(401).json({ error: 'No token provided. Please login first' });
    return;
  }

  const result = verifyAccessToken(token);

  if (!result.valid) {
    res.status(401).json({
      error: result.expired ? 'Token expired. Please refresh' : 'Invalid token',
    });
    return;
  }

  req.user = result.payload;
  next();
};
