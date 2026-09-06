import { Queue, JobsOptions, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { createLogger, Logger } from '@buildpilot/observability';
import {
  ENGINEERING_TASK_QUEUE,
  TASK_EXECUTION_JOB,
  DEFAULT_JOB_OPTIONS,
} from './constants.js';
import {
  EngineeringTaskJobSchema,
  EngineeringTaskJobInput,
  EngineeringTaskJobPayload,
  formatJobId,
} from './schemas.js';
import { RedisConnectionConfig, RedisConnectionManager } from './connection.js';

export interface QueueMetrics {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

export class TaskQueueManager {
  private queue: Queue<EngineeringTaskJobPayload>;
  private queueEvents: QueueEvents | null = null;
  private logger: Logger;

  constructor(
    private readonly connectionConfig: RedisConnectionConfig,
    queueName: string = ENGINEERING_TASK_QUEUE,
    sharedConnection?: Redis,
  ) {
    this.logger = createLogger({ serviceName: 'task-queue' });
    const connection =
      sharedConnection || {
        host: connectionConfig.host,
        port: connectionConfig.port,
        password: connectionConfig.password || undefined,
        maxRetriesPerRequest: null,
      };

    this.queue = new Queue<EngineeringTaskJobPayload>(queueName, {
      connection,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
  }

  /**
   * Enqueues an engineering task for background execution with deduplication via taskId:runId
   */
  async enqueueTask(
    rawPayload: EngineeringTaskJobInput,
    options: JobsOptions = {},
  ) {
    const payload = EngineeringTaskJobSchema.parse(rawPayload);
    const jobId = formatJobId(payload.taskId, payload.runId);

    const mergedOptions: JobsOptions = {
      jobId,
      ...DEFAULT_JOB_OPTIONS,
      ...options,
    };

    this.logger.info(
      { taskId: payload.taskId, runId: payload.runId, jobId },
      'Enqueuing engineering task job',
    );

    const job = await this.queue.add(TASK_EXECUTION_JOB, payload, mergedOptions);
    return job;
  }

  async getJob(jobId: string) {
    return this.queue.getJob(jobId);
  }

  async getMetrics(): Promise<QueueMetrics> {
    const counts = await this.queue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
      'paused',
    );
    return {
      waiting: counts.waiting || 0,
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      delayed: counts.delayed || 0,
      paused: counts.paused || 0,
    };
  }

  async pause() {
    this.logger.warn('Pausing task queue');
    await this.queue.pause();
  }

  async resume() {
    this.logger.info('Resuming task queue');
    await this.queue.resume();
  }

  async close() {
    this.logger.info('Closing task queue');
    if (this.queueEvents) {
      await this.queueEvents.close();
      this.queueEvents = null;
    }
    await this.queue.close();
  }

  getRawQueue(): Queue<EngineeringTaskJobPayload> {
    return this.queue;
  }
}
