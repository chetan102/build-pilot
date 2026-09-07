import {
  TaskRunRepository,
  TaskRepository,
  EventRepository,
  taskRunRepository as defaultTaskRunRepository,
  taskRepository as defaultTaskRepository,
  eventRepository as defaultEventRepository,
  ITaskRun,
} from '@buildpilot/database';
import { TaskStatus, TaskRunStatus } from '@buildpilot/domain';
import { createLogger, Logger } from '@buildpilot/observability';

export interface CrashRecoveryOptions {
  taskRunRepo?: TaskRunRepository;
  taskRepo?: TaskRepository;
  eventRepo?: EventRepository;
  logger?: Logger;
  maxStalledLeaseMs?: number;
}

export interface RecoverySummary {
  recoveredCount: number;
  timedOutCount: number;
  processedRunIds: string[];
}

export class CrashRecoveryService {
  private taskRunRepo: TaskRunRepository;
  private taskRepo: TaskRepository;
  private eventRepo: EventRepository;
  private logger: Logger;
  private maxStalledLeaseMs: number;

  constructor(options: CrashRecoveryOptions = {}) {
    this.taskRunRepo = options.taskRunRepo || defaultTaskRunRepository;
    this.taskRepo = options.taskRepo || defaultTaskRepository;
    this.eventRepo = options.eventRepo || defaultEventRepository;
    this.logger = options.logger || createLogger({ serviceName: 'crash-recovery' });
    this.maxStalledLeaseMs = options.maxStalledLeaseMs || 60000;
  }

  async recoverStalledRuns(): Promise<RecoverySummary> {
    const thresholdDate = new Date(Date.now() - this.maxStalledLeaseMs);
    const stalledRuns = await this.taskRunRepo.findStalledRuns(thresholdDate);

    let recoveredCount = 0;
    let timedOutCount = 0;
    const processedRunIds: string[] = [];

    for (const run of stalledRuns) {
      if (!run._id) continue;
      const runId = run._id.toString();
      processedRunIds.push(runId);

      this.logger.warn(
        { runId, taskId: run.taskId, lastHeartbeat: run.heartbeat?.lastHeartbeatAt },
        'Detected stalled worker run with expired lease. Initiating crash recovery',
      );

      const task = await this.taskRepo.findById(run.taskId);
      if (!task) continue;

      const checkpoint = run.checkpoint;
      const errorMessage = `Worker process terminated unexpectedly during stage '${checkpoint?.stage || 'UNKNOWN'}' (step ${checkpoint?.stepIndex || 0})`;

      // Mark the crashed TaskRun as FAILED / TIMED_OUT
      await this.taskRunRepo.markFailed(runId, errorMessage);

      // Record crash recovery event
      await this.eventRepo.create({
        taskId: run.taskId,
        runId,
        type: 'WORKER_CRASH_DETECTED',
        payload: {
          lastStage: checkpoint?.stage,
          lastStepIndex: checkpoint?.stepIndex,
          summary: checkpoint?.summary,
          recoveredAt: new Date().toISOString(),
        },
        level: 'error',
      });

      // If task is still in active state, transition safely
      if (task.status !== TaskStatus.COMPLETED && task.status !== TaskStatus.CANCELLED) {
        await this.taskRepo.updateStatus(run.taskId, TaskStatus.TIMED_OUT);
        timedOutCount++;
      }

      recoveredCount++;
    }

    return {
      recoveredCount,
      timedOutCount,
      processedRunIds,
    };
  }
}

export const crashRecoveryService = new CrashRecoveryService();
