import { TaskModel, ITask } from '../models/task.model.js';
import { TaskStatusType } from '@buildpilot/domain';

export class TaskRepository {
  async create(data: Partial<ITask>): Promise<ITask> {
    return TaskModel.create(data);
  }

  async findById(id: string): Promise<ITask | null> {
    return TaskModel.findById(id).exec();
  }

  async findByRepoAndIssue(repositoryId: string, issueNumber: number): Promise<ITask | null> {
    return TaskModel.findOne({ repositoryId, issueNumber }).exec();
  }

  async updateStatus(id: string, status: TaskStatusType, extra: Partial<ITask> = {}): Promise<ITask | null> {
    return TaskModel.findByIdAndUpdate(
      id,
      { $set: { status, ...extra } },
      { new: true },
    ).exec();
  }

  async listByProject(projectId: string, filter: { status?: TaskStatusType } = {}): Promise<ITask[]> {
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
    const res = await TaskModel.findByIdAndDelete(id).exec();
    return res !== null;
  }
}

export const taskRepository = new TaskRepository();
