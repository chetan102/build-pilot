import { createLogger } from '@buildpilot/observability';
import { loadConfig } from '@buildpilot/config';

const config = loadConfig();
const logger = createLogger({ serviceName: 'agent-worker' });

export function createWorkerService() {
  logger.info({ redisHost: config.REDIS_HOST }, 'Agent worker service initializing');
  return {
    status: 'initialized',
    start: async () => {
      logger.info('Agent worker started listening for tasks');
    },
    stop: async () => {
      logger.info('Agent worker stopping gracefully');
    },
  };
}

if (process.env.NODE_ENV !== 'test') {
  const workerService = createWorkerService();
  workerService.start();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Worker shutting down...');
    await workerService.stop();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

