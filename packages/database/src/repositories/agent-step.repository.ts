import mongoose from 'mongoose';
import { AgentStepModel, IAgentStep } from '../models/agent-step.model.js';

export class AgentStepRepository {
  async create(data: Partial<IAgentStep> & { _id?: string }): Promise<IAgentStep> {
    return AgentStepModel.create(data);
  }

  async findById(id: string): Promise<IAgentStep | null> {
    if (!mongoose.isValidObjectId(id)) {
      return null;
    }
    return AgentStepModel.findById(id).exec();
  }

  async listByRunId(runId: string): Promise<IAgentStep[]> {
    return AgentStepModel.find({ runId }).sort({ createdAt: 1 }).exec();
  }

  async listByTaskId(taskId: string): Promise<IAgentStep[]> {
    return AgentStepModel.find({ taskId }).sort({ createdAt: 1 }).exec();
  }

  async updateDuration(id: string, durationMs: number): Promise<IAgentStep | null> {
    if (!mongoose.isValidObjectId(id)) {
      return null;
    }
    return AgentStepModel.findByIdAndUpdate(
      id,
      { $set: { durationMs } },
      { new: true },
    ).exec();
  }
}

export const agentStepRepository = new AgentStepRepository();

