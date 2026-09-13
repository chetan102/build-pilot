import mongoose from 'mongoose';
import { TaskModel, ITask } from '../models/task.model.js';
import { TaskRunModel, ITaskRun } from '../models/task-run.model.js';
import { AgentStepModel, IAgentStep } from '../models/agent-step.model.js';
import { ToolCallModel, IToolCall } from '../models/tool-call.model.js';
import { EventModel } from '../models/event.model.js';
import { ApprovalModel } from '../models/approval.model.js';
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
  toolCalls?: IToolCall[];
}

export class TaskRepository {
  async create(data: Partial<ITask>): Promise<ITask> {
    return TaskModel.create(data);
  }

  async findById(id: string): Promise<ITask | null> {
    if (!mongoose.isValidObjectId(id) || mongoose.connection.readyState !== 1) {
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

    const [runs, steps, toolCalls] = await Promise.all([
      TaskRunModel.find({ taskId }).sort({ createdAt: -1 }).exec(),
      AgentStepModel.find({ taskId }).sort({ createdAt: 1 }).exec(),
      ToolCallModel.find({
        $or: [
          { taskId },
          { runId: { $in: (await TaskRunModel.find({ taskId }).select('_id').exec()).map((r) => r._id?.toString() || '') } },
        ],
      }).sort({ createdAt: 1 }).exec(),
    ]);

    const taskObj = typeof (task as any).toObject === 'function' ? (task as any).toObject() : task;
    const model = runs[0]?.model || taskObj.metadata?.model || undefined;
    const provider = runs[0]?.provider || taskObj.metadata?.provider || undefined;

    // Attach toolCalls to their corresponding steps
    const stepsWithTools = steps.map((step) => {
      const stepObj = typeof (step as any).toObject === 'function' ? (step as any).toObject() : step;
      const stepId = stepObj._id?.toString() || '';
      const matchedTools = toolCalls.filter((tc) => tc.stepId === stepId || tc.stepId === `step_${stepObj._id}`);
      return {
        ...stepObj,
        toolCalls: matchedTools,
      };
    });

    const finalAnswer =
      runs[0]?.output?.finalAnswer ||
      runs[0]?.checkpoint?.summary ||
      taskObj.metadata?.finalAnswer ||
      undefined;

    return {
      task: {
        ...taskObj,
        model,
        provider,
        finalAnswer,
      },
      runs,
      steps: stepsWithTools as any,
      toolCalls,
    };
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
    const [res] = await Promise.all([
      TaskModel.findByIdAndDelete(id).exec(),
      TaskRunModel.deleteMany({ taskId: id }).exec(),
      AgentStepModel.deleteMany({ taskId: id }).exec(),
      EventModel.deleteMany({ taskId: id }).exec(),
      ApprovalModel.deleteMany({ taskId: id }).exec(),
    ]);
    return res !== null;
  }
}

export const taskRepository = new TaskRepository();
