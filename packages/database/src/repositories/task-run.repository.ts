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
    completedAt: Date = new Date(),
  ): Promise<ITaskRun | null> {
    return this.updateStatus(id, 'COMPLETED', {
      completedAt,
      durationMs,
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

  async deleteById(id: string): Promise<boolean> {
    if (!mongoose.isValidObjectId(id)) {
      return false;
    }
    const res = await TaskRunModel.findByIdAndDelete(id).exec();
    return res !== null;
  }
}

export const taskRunRepository = new TaskRunRepository();

