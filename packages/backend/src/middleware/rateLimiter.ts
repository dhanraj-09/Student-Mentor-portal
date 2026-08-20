import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

/**
 * Rate-limit rejections use the same `{ error }` shape as every other failure.
 *
 * Passing a bare string makes express-rate-limit send a plain-text body, which
 * the client's error reader (looking for `error`) cannot see — so a 429 was
 * displayed as the generic "Login failed", indistinguishable from a wrong
 * password. Waiting is very different advice from re-typing a password.
 */
function rejection(message: string): { error: string } {
  return { error: message };
}

function minutes(ms: number): number {
  return Math.max(1, Math.round(ms / 60000));
}

export const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  limit: config.rateLimit.maxRequests,
  message: rejection('Too many requests. Please try again later'),
  standardHeaders: true,
  legacyHeaders: false,
});

export const loginLimiter = rateLimit({
  windowMs: config.rateLimit.loginWindowMs,
  limit: config.rateLimit.loginMaxRequests,
  // The window is configurable, so the wait it quotes has to follow it.
  message: rejection(
    `Too many login attempts. Please try again after ${minutes(
      config.rateLimit.loginWindowMs
    )} minutes`
  ),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.user !== undefined,
});

export const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 300,
  message: rejection('Too many registrations. Please try again later'),
  standardHeaders: true,
  legacyHeaders: false,
});
