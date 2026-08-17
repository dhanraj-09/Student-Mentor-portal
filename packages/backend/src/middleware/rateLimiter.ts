/** Rate limiters guarding brute-force-prone endpoints. */

import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

/** Applied to every request. */
export const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  limit: config.rateLimit.maxRequests,
  message: 'Too many requests. Please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

/** Tighter budget for credential checks. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 25,
  message: 'Too many login attempts. Please try again after 15 minutes',
  standardHeaders: true,
  legacyHeaders: false,
  // Already-authenticated callers are not brute-forcing a login.
  skip: (req) => req.user !== undefined,
});

/** Strict budget for account creation. */
export const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 300,
  message: 'Too many registrations. Please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});
