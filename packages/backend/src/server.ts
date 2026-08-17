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
import { API_PREFIX, AUTH_PREFIX } from 'shared';
import { config } from './config.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { authRoutes } from './routes/auth/index.js';
import { assignmentRoutes, queryRoutes } from './routes/community/index.js';
import {
  facultyMeetingRoutes,
  sharedMeetingRoutes,
  studentMeetingRoutes,
} from './routes/meetings/index.js';
import {
  facultyProfileRoutes,
  studentProfileRoutes,
} from './routes/profile/index.js';

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

  // Protected /api routes.
  //
  // Mount order matters: routers holding literal paths (/student/unassigned,
  // /faculty/meetings, /meetings/create) must come before the routers holding
  // the matching parameter catch-alls (/student/:registration_no,
  // /faculty/:email, /meetings/:meeting_id), or Express would capture the
  // literal segment as a parameter. Profile is therefore mounted last.
  app.use(API_PREFIX, assignmentRoutes);
  app.use(API_PREFIX, queryRoutes);
  app.use(API_PREFIX, studentMeetingRoutes);
  app.use(API_PREFIX, facultyMeetingRoutes);
  app.use(API_PREFIX, sharedMeetingRoutes);
  app.use(API_PREFIX, studentProfileRoutes);
  app.use(API_PREFIX, facultyProfileRoutes);

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'Server is running' });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
