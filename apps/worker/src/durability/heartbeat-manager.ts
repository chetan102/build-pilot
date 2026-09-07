import { taskRunRepository, TaskRunRepository } from '@buildpilot/database';
import { createLogger, Logger } from '@buildpilot/observability';

export interface HeartbeatOptions {
  runId: string;
  workerId?: string;
  intervalMs?: number;
  leaseTtlMs?: number;
  taskRunRepo?: TaskRunRepository;
  logger?: Logger;
}

export class TaskHeartbeatSession {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private workerId: string;
  private intervalMs: number;
  private leaseTtlMs: number;
  private taskRunRepo: TaskRunRepository;
  private logger: Logger;
  private runId: string;

  constructor(options: HeartbeatOptions) {
    this.runId = options.runId;
    this.workerId = options.workerId || `worker-${process.pid}-${Math.random().toString(36).substring(2, 7)}`;
    this.intervalMs = options.intervalMs || 10000;
    this.leaseTtlMs = options.leaseTtlMs || 30000;
    this.taskRunRepo = options.taskRunRepo || taskRunRepository;
    this.logger = options.logger || createLogger({ serviceName: 'heartbeat-session' });
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    // Immediate initial lease acquisition
    await this.pulse();

    // Setup periodic heartbeats
    this.timer = setInterval(async () => {
      await this.pulse();
    }, this.intervalMs);
  }

  async pulse(): Promise<boolean> {
    try {
      const updated = await this.taskRunRepo.renewHeartbeat(
        this.runId,
        this.workerId,
        this.leaseTtlMs,
      );
      if (updated) {
        this.logger.debug(
          { runId: this.runId, workerId: this.workerId, leaseTtlMs: this.leaseTtlMs },
          'Worker heartbeat lease renewed successfully',
        );
        return true;
      }
      return false;
    } catch (err) {
      this.logger.warn({ runId: this.runId, err }, 'Failed to renew worker heartbeat lease');
      return false;
    }
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.logger.debug({ runId: this.runId, workerId: this.workerId }, 'Heartbeat session stopped');
  }

  getWorkerId(): string {
    return this.workerId;
  }
}
