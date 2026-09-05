import { createApp } from './app.js';
import { loadConfig } from '@buildpilot/config';
import { createLogger } from '@buildpilot/observability';

const config = loadConfig();
const logger = createLogger({ serviceName: 'control-api' });
const app = createApp();

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, 'Control API server started');
});

const gracefulShutdown = (signal: string) => {
  logger.info({ signal }, 'Shutting down gracefully...');
  server.close(() => {
    logger.info('Control API server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

