/**
 * Express application wiring.
 *
 * Kept separate from `index.ts` so the app can be constructed without binding
 * a port (useful for tests).
 */

import express from 'express';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { AUTH_PREFIX } from 'shared';
import { config } from './config.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { authRoutes } from './routes/auth/index.js';

const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Route not found' });
};

// Declares all four parameters so Express recognises it as an error handler.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error('Error:', err instanceof Error ? err.message : err);
  // Never leak internal details to the client.
  res.status(500).json({ error: 'Internal server error' });
};

export function createApp(): express.Express {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());

  // `credentials` is required for the httpOnly refresh cookie to be accepted.
  app.use(
    cors({
      origin: config.cors.allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      optionsSuccessStatus: 200,
    })
  );

  app.use(apiLimiter);

  // Public authentication routes.
  app.use(AUTH_PREFIX, authRoutes);

  // Protected /api routes are mounted here as each feature is ported.

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'Server is running' });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
