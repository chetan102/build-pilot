import mongoose from 'mongoose';
import { TaskRunModel, ITaskRun } from '../models/task-run.model.js';
import { TaskRunStatusType } from '@buildpilot/domain';

export class TaskRunRepository {
  async create(data: Partial<ITaskRun>): Promise<ITaskRun> {
    return TaskRunModel.create(data);
  }

  async findById(id: string): Promise<ITaskRun | null> {
    if (!mongoose.isValidObjectId(id)) {
      return null;
    }
    return TaskRunModel.findById(id).exec();
  }

  async findByTaskId(taskId: string): Promise<ITaskRun[]> {
    return TaskRunModel.find({ taskId }).sort({ createdAt: -1 }).exec();
  }

  async findLatestByTaskId(taskId: string): Promise<ITaskRun | null> {
    return TaskRunModel.findOne({ taskId }).sort({ createdAt: -1 }).exec();
  }

  async updateStatus(
    id: string,
    status: TaskRunStatusType,
    extra: Partial<ITaskRun> = {},
  ): Promise<ITaskRun | null> {
    if (!mongoose.isValidObjectId(id)) {
      return null;
    }
    return TaskRunModel.findByIdAndUpdate(
      id,
      { $set: { status, ...extra } },
      { new: true },
    ).exec();
  }

  async markStarted(id: string, startedAt: Date = new Date()): Promise<ITaskRun | null> {
    return this.updateStatus(id, 'RUNNING', { startedAt });
  }

  async markCompleted(
    id: string,
    durationMs?: number,
    output?: { finalAnswer?: string; totalSteps?: number; totalTokens?: any },
    completedAt: Date = new Date(),
  ): Promise<ITaskRun | null> {
    return this.updateStatus(id, 'COMPLETED', {
      completedAt,
      durationMs,
      ...(output ? { output } : {}),
    });
  }

  async markFailed(
    id: string,
    errorMessage: string,
    durationMs?: number,
    completedAt: Date = new Date(),
  ): Promise<ITaskRun | null> {
    return this.updateStatus(id, 'FAILED', {
      errorMessage,
      completedAt,
      durationMs,
    });
  }

  async saveCheckpoint(
    id: string,
    checkpoint: {
      stage: string;
      stepIndex: number;
      filesModified?: string[];
      summary?: string;
    },
  ): Promise<ITaskRun | null> {
    if (!mongoose.isValidObjectId(id)) {
      return null;
    }
    return TaskRunModel.findByIdAndUpdate(
      id,
      {
        $set: {
          currentStepIndex: checkpoint.stepIndex,
          checkpoint: {
            ...checkpoint,
            lastSavedAt: new Date(),
          },
        },
      },
      { new: true },
    ).exec();
  }

  async renewHeartbeat(
    id: string,
    workerId: string,
    ttlMs: number = 30000,
  ): Promise<ITaskRun | null> {
    if (!mongoose.isValidObjectId(id)) {
      return null;
    }
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + ttlMs);
    return TaskRunModel.findByIdAndUpdate(
      id,
      {
        $set: {
          heartbeat: {
            workerId,
            lastHeartbeatAt: now,
            leaseExpiresAt,
          },
        },
      },
      { new: true },
    ).exec();
  }

  async findStalledRuns(thresholdDate: Date = new Date()): Promise<ITaskRun[]> {
    return TaskRunModel.find({
      status: 'RUNNING',
      'heartbeat.leaseExpiresAt': { $lt: thresholdDate },
    }).exec();
  }

  async update(id: string, extra: Partial<ITaskRun>): Promise<ITaskRun | null> {
    if (!mongoose.isValidObjectId(id)) {
      return null;
    }
    return TaskRunModel.findByIdAndUpdate(
      id,
      { $set: extra },
      { new: true },
    ).exec();
  }

  async deleteById(id: string): Promise<boolean> {
    if (!mongoose.isValidObjectId(id)) {
      return false;
    }
    const res = await TaskRunModel.findByIdAndDelete(id).exec();
    return res !== null;
  }
}

export const taskRunRepository = new TaskRunRepository();

