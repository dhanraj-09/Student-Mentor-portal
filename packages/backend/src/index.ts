/** Process entry point: verify the database, then start listening. */

import { config } from './config.js';
import { closePool, verifyConnection } from './models/shared/index.js';
import { createApp } from './server.js';

async function start(): Promise<void> {
  // Fail before accepting traffic if the database is unreachable.
  await verifyConnection();
  // eslint-disable-next-line no-console
  console.log('Connected to the MySQL database!');

  const app = createApp();

  const server = app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server is running on port ${config.port}`);
    // eslint-disable-next-line no-console
    console.log(`Environment: ${config.env}`);
  });

  const shutdown = (signal: string): void => {
    // eslint-disable-next-line no-console
    console.log(`\n${signal} received, shutting down...`);
    server.close(() => {
      void closePool().finally(() => process.exit(0));
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(
    'Failed to start server:',
    error instanceof Error ? error.message : error
  );
  process.exit(1);
});
