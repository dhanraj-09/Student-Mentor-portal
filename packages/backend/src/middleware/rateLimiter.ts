import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

export const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  limit: config.rateLimit.maxRequests,
  message: 'Too many requests. Please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

export const loginLimiter = rateLimit({
  windowMs: config.rateLimit.loginWindowMs,
  limit: config.rateLimit.loginMaxRequests,
  message: 'Too many login attempts. Please try again after 15 minutes',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.user !== undefined,
});

export const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 300,
  message: 'Too many registrations. Please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});
