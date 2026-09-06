import mongoose from 'mongoose';
import { TaskModel, ITask } from '../models/task.model.js';
import { TaskRunModel, ITaskRun } from '../models/task-run.model.js';
import { AgentStepModel, IAgentStep } from '../models/agent-step.model.js';
import { TaskStatusType } from '@buildpilot/domain';

export interface ListTasksFilter {
  projectId?: string;
  repositoryId?: string;
  status?: TaskStatusType;
  search?: string;
}

export interface TaskPaginationOptions {
  page?: number;
  limit?: number;
}

export interface TaskDetailsResult {
  task: ITask;
  runs: ITaskRun[];
  steps: IAgentStep[];
}

export class TaskRepository {
  async create(data: Partial<ITask>): Promise<ITask> {
    return TaskModel.create(data);
  }

  async findById(id: string): Promise<ITask | null> {
    if (!mongoose.isValidObjectId(id)) {
      return null;
    }
    return TaskModel.findById(id).exec();
  }

  async findByRepoAndIssue(repositoryId: string, issueNumber: number): Promise<ITask | null> {
    return TaskModel.findOne({ repositoryId, issueNumber }).exec();
  }

  async getLatestIssueNumber(repositoryId: string): Promise<number> {
    const latest = await TaskModel.findOne({ repositoryId })
      .sort({ issueNumber: -1 })
      .select('issueNumber')
      .exec();
    return latest?.issueNumber ?? 0;
  }

  async list(
    filter: ListTasksFilter = {},
    pagination: TaskPaginationOptions = {},
  ): Promise<{ tasks: ITask[]; total: number }> {
    const query: Record<string, unknown> = {};

    if (filter.projectId) {
      query.projectId = filter.projectId;
    }

    if (filter.repositoryId) {
      query.repositoryId = filter.repositoryId;
    }

    if (filter.status) {
      query.status = filter.status;
    }

    if (filter.search) {
      query.$or = [
        { title: { $regex: filter.search, $options: 'i' } },
        { description: { $regex: filter.search, $options: 'i' } },
      ];
    }

    const page = pagination.page && pagination.page > 0 ? pagination.page : 1;
    const limit = pagination.limit && pagination.limit > 0 ? pagination.limit : 20;
    const skip = (page - 1) * limit;

    const [tasks, total] = await Promise.all([
      TaskModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      TaskModel.countDocuments(query).exec(),
    ]);

    return { tasks, total };
  }

  async findTaskDetails(taskId: string): Promise<TaskDetailsResult | null> {
    const task = await this.findById(taskId);
    if (!task) {
      return null;
    }

    const [runs, steps] = await Promise.all([
      TaskRunModel.find({ taskId }).sort({ createdAt: -1 }).exec(),
      AgentStepModel.find({ taskId }).sort({ createdAt: 1 }).exec(),
    ]);

    return { task, runs, steps };
  }

  async updateStatus(
    id: string,
    status: TaskStatusType,
    extra: Partial<ITask> = {},
  ): Promise<ITask | null> {
    if (!mongoose.isValidObjectId(id)) {
      return null;
    }
    return TaskModel.findByIdAndUpdate(
      id,
      { $set: { status, ...extra } },
      { new: true },
    ).exec();
  }

  async listByProject(
    projectId: string,
    filter: { status?: TaskStatusType } = {},
  ): Promise<ITask[]> {
    const query: Record<string, unknown> = { projectId };
    if (filter.status) {
      query.status = filter.status;
    }
    return TaskModel.find(query).sort({ createdAt: -1 }).exec();
  }

  async listActive(): Promise<ITask[]> {
    return TaskModel.find({
      status: { $nin: ['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT'] },
    }).sort({ createdAt: -1 }).exec();
  }

  async deleteById(id: string): Promise<boolean> {
    if (!mongoose.isValidObjectId(id)) {
      return false;
    }
    const res = await TaskModel.findByIdAndDelete(id).exec();
    return res !== null;
  }
}

export const taskRepository = new TaskRepository();
