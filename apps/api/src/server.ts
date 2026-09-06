import { createApp } from './app.js';
import { loadConfig } from '@buildpilot/config';
import { createLogger } from '@buildpilot/observability';
import { connectToDatabase, disconnectDatabase } from '@buildpilot/database';

const config = loadConfig();
const logger = createLogger({ serviceName: 'control-api' });

async function bootstrap() {
  try {
    logger.info('Initializing Control API...');

    // Attempt to connect to database
    try {
      await connectToDatabase({ uri: config.MONGODB_URI });
    } catch (dbErr) {
      logger.warn({ err: dbErr }, 'Database connection deferred/failed on startup');
    }

    const app = createApp({ logger });

    const server = app.listen(config.PORT, () => {
      logger.info(
        { port: config.PORT, env: config.NODE_ENV },
        `BuildPilot Control API listening on port ${config.PORT}`,
      );
    });

    let isShuttingDown = false;

    const gracefulShutdown = async (signal: string) => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      logger.info({ signal }, 'Received shutdown signal, terminating gracefully...');

      server.close(async () => {
        logger.info('HTTP server closed');
        try {
          await disconnectDatabase();
          logger.info('Database disconnected cleanly');
        } catch (err) {
          logger.error({ err }, 'Error during database disconnect');
        }
        process.exit(0);
      });

      // Force terminate if graceful shutdown hangs
      setTimeout(() => {
        logger.error('Graceful shutdown timeout exceeded, forcing exit');
        process.exit(1);
      }, 10000).unref();
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (err) {
    logger.fatal({ err }, 'Fatal error during Control API bootstrap');
    process.exit(1);
  }
}

bootstrap();
