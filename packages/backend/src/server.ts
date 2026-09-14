import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { API_PREFIX, AUTH_PREFIX } from 'shared';
import { config } from './config.js';
import { errorHandler, notFoundHandler } from './errors/index.js';
import { healthRoutes } from './routes/health.js';
import { requestLogger } from './logging/loggerMiddleware.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { authRoutes } from './routes/auth/index.js';
import {
  assignmentRoutes,
  messageRoutes,
  queryRoutes,
  resourceRoutes,
} from './routes/community/index.js';
import { dashboardRoutes } from './routes/dashboard/index.js';
import {
  facultyMeetingRoutes,
  sharedMeetingRoutes,
  studentMeetingRoutes,
} from './routes/meetings/index.js';
import {
  facultyProfileRoutes,
  studentProfileRoutes,
} from './routes/profile/index.js';

export function createApp(): express.Express {
  const app = express();

  // Must be set before the rate limiter, which reads req.ip.
  if (config.trustProxy > 0) {
    app.set('trust proxy', config.trustProxy);
  }

  // First in the chain: everything after it is logged and carries a request id.
  app.use(requestLogger);

  app.use(express.json());
  app.use(cookieParser());

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

  app.use(AUTH_PREFIX, authRoutes);

  // Mount order matters: routers holding literal paths (/student/unassigned,
  // the matching parameter catch-alls (/student/:registration_no,
  // literal segment as a parameter. Profile is therefore mounted last.
  app.use(API_PREFIX, dashboardRoutes);
  app.use(API_PREFIX, resourceRoutes);
  app.use(API_PREFIX, messageRoutes);
  app.use(API_PREFIX, assignmentRoutes);
  app.use(API_PREFIX, queryRoutes);
  app.use(API_PREFIX, studentMeetingRoutes);
  app.use(API_PREFIX, facultyMeetingRoutes);
  app.use(API_PREFIX, sharedMeetingRoutes);
  app.use(API_PREFIX, studentProfileRoutes);
  app.use(API_PREFIX, facultyProfileRoutes);

  // Liveness and readiness; see routes/health.ts for why they differ.
  app.use(healthRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
