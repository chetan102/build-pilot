import { Worker, Job, Processor } from 'bullmq';
import { Redis } from 'ioredis';
import { createLogger, Logger } from '@buildpilot/observability';
import {
  ENGINEERING_TASK_QUEUE,
  DEFAULT_WORKER_CONCURRENCY,
} from './constants.js';
import { EngineeringTaskJobPayload } from './schemas.js';
import { RedisConnectionConfig, RedisConnectionManager } from './connection.js';

export interface WorkerOptions {
  concurrency?: number;
  queueName?: string;
  connection?: Redis;
}

export class TaskWorkerManager {
  private worker: Worker<EngineeringTaskJobPayload>;
  private logger: Logger;

  constructor(
    private readonly connectionConfig: RedisConnectionConfig,
    processor: Processor<EngineeringTaskJobPayload>,
    options: WorkerOptions = {},
  ) {
    this.logger = createLogger({ serviceName: 'task-worker' });
    const connection =
      options.connection || {
        host: connectionConfig.host,
        port: connectionConfig.port,
        password: connectionConfig.password || undefined,
        maxRetriesPerRequest: null,
      };

    const concurrency = options.concurrency || DEFAULT_WORKER_CONCURRENCY;
    const queueName = options.queueName || ENGINEERING_TASK_QUEUE;

    this.logger.info({ queueName, concurrency }, 'Initializing TaskWorkerManager');

    this.worker = new Worker<EngineeringTaskJobPayload>(queueName, processor, {
      connection,
      concurrency,
      lockDuration: 60000, // 60s lock
      stalledInterval: 30000,
    });

    this.setupLifecycleListeners();
  }

  private setupLifecycleListeners(): void {
    this.worker.on('active', (job: Job<EngineeringTaskJobPayload>) => {
      this.logger.info(
        { jobId: job.id, taskId: job.data.taskId, runId: job.data.runId, attempt: job.attemptsMade + 1 },
        'Job execution started',
      );
    });

    this.worker.on('completed', (job: Job<EngineeringTaskJobPayload>, returnvalue: unknown) => {
      this.logger.info(
        { jobId: job.id, taskId: job.data.taskId, runId: job.data.runId },
        'Job execution completed successfully',
      );
    });

    this.worker.on('failed', (job: Job<EngineeringTaskJobPayload> | undefined, error: Error) => {
      this.logger.error(
        {
          jobId: job?.id,
          taskId: job?.data.taskId,
          runId: job?.data.runId,
          attemptsMade: job?.attemptsMade,
          maxAttempts: job?.opts.attempts,
          err: error.message,
        },
        'Job execution failed',
      );
    });

    this.worker.on('error', (err: Error) => {
      this.logger.error({ err: err.message }, 'Task worker encountered error');
    });

    this.worker.on('stalled', (jobId: string) => {
      this.logger.warn({ jobId }, 'Job execution stalled and will be re-assigned');
    });
  }

  async pause(): Promise<void> {
    this.logger.warn('Pausing worker processing');
    await this.worker.pause();
  }

  async resume(): Promise<void> {
    this.logger.info('Resuming worker processing');
    this.worker.resume();
  }

  async close(): Promise<void> {
    this.logger.info('Closing worker cleanly and draining active jobs');
    await this.worker.close();
  }

  getRawWorker(): Worker<EngineeringTaskJobPayload> {
    return this.worker;
  }
}

