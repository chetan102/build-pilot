import { createLogger, Logger } from '@buildpilot/observability';
import { loadConfig } from '@buildpilot/config';
import { connectToDatabase, disconnectDatabase } from '@buildpilot/database';
import {
  TaskWorkerManager,
  EngineeringTaskJobPayload,
  DEFAULT_WORKER_CONCURRENCY,
} from '@buildpilot/queue';
import { Job } from 'bullmq';

const config = loadConfig();

export interface WorkerServiceOptions {
  logger?: Logger;
  concurrency?: number;
}

export class WorkerService {
  private workerManager: TaskWorkerManager | null = null;
  private logger: Logger;
  private isRunning = false;

  constructor(private options: WorkerServiceOptions = {}) {
    this.logger = options.logger || createLogger({ serviceName: 'agent-worker' });
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.logger.info('Starting BuildPilot Agent Worker Service...');

    // Attempt DB connection
    try {
      await connectToDatabase({ uri: config.MONGODB_URI });
      this.logger.info('Connected to MongoDB');
    } catch (err) {
      this.logger.warn({ err }, 'Worker database connection deferred/failed');
    }

    // Initialize BullMQ Worker Processor
    this.workerManager = new TaskWorkerManager(
      {
        host: config.REDIS_HOST,
        port: config.REDIS_PORT,
        password: config.REDIS_PASSWORD,
      },
      this.processJob.bind(this),
      {
        concurrency: this.options.concurrency || DEFAULT_WORKER_CONCURRENCY,
      },
    );

    this.isRunning = true;
    this.logger.info(
      { concurrency: this.options.concurrency || DEFAULT_WORKER_CONCURRENCY },
      'Agent Worker Service started and listening for jobs',
    );
  }

  async processJob(job: Job<EngineeringTaskJobPayload>): Promise<{ success: boolean; taskId: string; runId: string }> {
    const { taskId, runId, title, branch } = job.data;
    this.logger.info(
      { jobId: job.id, taskId, runId, title, branch, attempt: job.attemptsMade + 1 },
      'Processing engineering task job',
    );

    // Placeholder execution until agent runtime / sandbox executes in later phases
    return {
      success: true,
      taskId,
      runId,
    };
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.logger.info('Stopping Agent Worker Service gracefully...');

    if (this.workerManager) {
      await this.workerManager.close();
      this.workerManager = null;
    }

    try {
      await disconnectDatabase();
    } catch (err) {
      this.logger.error({ err }, 'Error disconnecting database');
    }

    this.isRunning = false;
    this.logger.info('Agent Worker Service stopped cleanly');
  }

  getWorkerManager(): TaskWorkerManager | null {
    return this.workerManager;
  }
}

export function createWorkerService(options?: WorkerServiceOptions): WorkerService {
  return new WorkerService(options);
}

if (process.env.NODE_ENV !== 'test') {
  const service = createWorkerService();
  service.start();

  const shutdown = async (signal: string) => {
    service.getWorkerManager()?.pause();
    await service.stop();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
