import { config } from './config.js';
import { logger } from './logging/logger.js';
import { closePool, verifyConnection } from './models/shared/index.js';
import { createApp } from './server.js';

async function start(): Promise<void> {
  await verifyConnection();
  logger.info('connected to the MySQL database');

  const app = createApp();

  const server = app.listen(config.port, () => {
    logger.info('server listening', {
      port: config.port,
      env: config.env,
      logLevel: config.logging.level,
    });
  });

  const shutdown = (signal: string): void => {
    logger.info('shutting down', { signal });
    server.close(() => {
      void closePool().finally(() => process.exit(0));
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((error: unknown) => {
  logger.error('failed to start server', {
    cause: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
