import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { ACCESS_TOKEN_EXPIRY, REFRESH_TOKEN_EXPIRY } from 'shared';

dotenv.config();

/**
 * The backend package root. Resolves identically from `src/config.ts` during
 * development and `dist/config.js` after a build, since both sit one level in.
 */
const packageRoot = fileURLToPath(new URL('../', import.meta.url));

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function numberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(
      `Environment variable ${name} must be a number, got "${value}"`
    );
  }
  return parsed;
}

function booleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return value.toLowerCase() === 'true';
}

const nodeEnv = optionalEnv('NODE_ENV', 'development');

export const config = {
  env: nodeEnv,
  isProduction: nodeEnv === 'production',
  port: numberEnv('PORT', 8080),

  db: {
    host: requireEnv('DB_HOST'),
    port: numberEnv('DB_PORT', 3306),
    user: requireEnv('DB_USER'),
    password: requireEnv('DB_PASSWORD'),
    database: requireEnv('DB_NAME'),
    connectionLimit: numberEnv('DB_CONNECTION_LIMIT', 10),
    /** Aiven requires SSL; the CA lives at the backend package root (git-ignored). */
    sslCaPath: path.resolve(packageRoot, optionalEnv('DB_SSL_CA', 'ca.pem')),
    sslRejectUnauthorized: booleanEnv('DB_SSL_REJECT_UNAUTHORIZED', true),
  },

  auth: {
    jwtSecret: requireEnv('JWT_SECRET'),
    refreshSecret: requireEnv('REFRESH_SECRET'),
    accessTokenExpiry: optionalEnv('ACCESS_TOKEN_EXPIRY', ACCESS_TOKEN_EXPIRY),
    refreshTokenExpiry: optionalEnv(
      'REFRESH_TOKEN_EXPIRY',
      REFRESH_TOKEN_EXPIRY
    ),
  },

  cors: {
    allowedOrigins: optionalEnv(
      'ALLOWED_ORIGINS',
      'http://localhost:5173,http://localhost:3000'
    )
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  },

  rateLimit: {
    windowMs: numberEnv('RATE_LIMIT_WINDOW_MS', 30 * 60 * 1000),
    maxRequests: numberEnv('RATE_LIMIT_MAX_REQUESTS', 1000),
  },
} as const;

export type Config = typeof config;
