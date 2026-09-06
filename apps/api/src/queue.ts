import { TaskQueueManager } from '@buildpilot/queue';
import { loadConfig } from '@buildpilot/config';

const config = loadConfig();

export const taskQueueManager = new TaskQueueManager({
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD,
});

