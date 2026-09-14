/**
 * `src/config.ts` throws on import when a required variable is missing, so the
 * whole suite would fail to load without these. The values are deliberately
 * obvious fakes — no test should ever reach a real database or sign a token a
 * real environment would honour.
 */
process.env.NODE_ENV = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'test';
process.env.DB_SSL = 'false';
process.env.JWT_SECRET = 'test-access-secret';
process.env.REFRESH_SECRET = 'test-refresh-secret';
process.env.ACCESS_TOKEN_EXPIRY = '30m';
process.env.REFRESH_TOKEN_EXPIRY = '7d';
// Keep the request logger quiet unless a test opts back in.
process.env.LOG_LEVEL = 'error';
