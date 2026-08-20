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

export const LOG_LEVELS = ['error', 'warn', 'info', 'debug'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

function logLevelEnv(name: string, fallback: LogLevel): LogLevel {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const normalised = value.toLowerCase();
  const match = LOG_LEVELS.find((level) => level === normalised);
  if (match === undefined) {
    throw new Error(
      `Environment variable ${name} must be one of ${LOG_LEVELS.join(', ')}, got "${value}"`
    );
  }
  return match;
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
    /** Aiven requires SSL, so it stays on by default. Set DB_SSL=false only for
     *  a local database container that does not terminate TLS. */
    ssl: booleanEnv('DB_SSL', true),
    /** Aiven requires SSL. Locally the CA lives at the backend package root
     *  (git-ignored) and is read from disk; in a deploy where no file exists
     *  (e.g. Railway) paste the cert contents into DB_SSL_CA_PEM instead. */
    sslCaPath: path.resolve(packageRoot, optionalEnv('DB_SSL_CA', 'ca.pem')),
    sslCaPem: optionalEnv('DB_SSL_CA_PEM', ''),
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

  /**
   * LiveKit powers the WebRTC media for meeting video calls. The API secret is
   * used only to sign short-lived join tokens and must never reach the browser.
   * In production LIVEKIT_URL has to be wss://.
   */
  livekit: {
    url: optionalEnv('LIVEKIT_URL', ''),
    apiKey: optionalEnv('LIVEKIT_API_KEY', ''),
    apiSecret: optionalEnv('LIVEKIT_API_SECRET', ''),
    tokenTtlSeconds: numberEnv('LIVEKIT_TOKEN_TTL_SECONDS', 300),
    configured:
      optionalEnv('LIVEKIT_URL', '') !== '' &&
      optionalEnv('LIVEKIT_API_KEY', '') !== '' &&
      optionalEnv('LIVEKIT_API_SECRET', '') !== '',
  },

  logging: {
    /** Verbosity floor. Defaults to every level locally, info upward in
     *  production so request noise does not swamp the aggregator. */
    level: logLevelEnv(
      'LOG_LEVEL',
      nodeEnv === 'production' ? 'info' : 'debug'
    ),
  },

  /**
   * Hops of reverse proxy in front of the app, passed to Express `trust proxy`.
   *
   * Rate limits are keyed on the client IP, and without this every request
   * arriving through a proxy carries the proxy's address instead — collapsing
   * all callers into one bucket, so a single client can lock everyone out.
   * Set it to the number of proxies actually in front of the app (1 for
   * Vercel/Railway/a single nginx). It stays 0 by default because trusting a
   * forwarded header that nothing sets would let a client spoof its own IP.
   */
  trustProxy: numberEnv('TRUST_PROXY', 0),

  rateLimit: {
    windowMs: numberEnv('RATE_LIMIT_WINDOW_MS', 30 * 60 * 1000),
    maxRequests: numberEnv('RATE_LIMIT_MAX_REQUESTS', 1000),
    /**
     * Login attempts are counted per client IP. Behind a reverse proxy every
     * request arrives from the proxy's address unless `trust proxy` is set, so
     * all users end up sharing one bucket — which is why this needs to be
     * raisable for local multi-device testing rather than hard-coded.
     */
    loginWindowMs: numberEnv('LOGIN_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
    loginMaxRequests: numberEnv('LOGIN_RATE_LIMIT_MAX_REQUESTS', 25),
  },
} as const;

export type Config = typeof config;
