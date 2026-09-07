import mongoose from 'mongoose';
import { ToolCallModel, IToolCall } from '../models/tool-call.model.js';
import { ToolCallStatusType } from '@buildpilot/domain';

export class ToolCallRepository {
  async create(data: Partial<IToolCall> & { _id?: string }): Promise<IToolCall> {
    return ToolCallModel.create(data);
  }

  async findById(id: string): Promise<IToolCall | null> {
    if (!mongoose.isValidObjectId(id)) {
      return null;
    }
    return ToolCallModel.findById(id).exec();
  }

  async listByStepId(stepId: string): Promise<IToolCall[]> {
    return ToolCallModel.find({ stepId }).sort({ createdAt: 1 }).exec();
  }

  async listByRunId(runId: string): Promise<IToolCall[]> {
    return ToolCallModel.find({ runId }).sort({ createdAt: 1 }).exec();
  }

  async updateStatus(
    id: string,
    status: ToolCallStatusType,
    extra: {
      output?: Record<string, unknown>;
      error?: string;
      durationMs?: number;
    } = {},
  ): Promise<IToolCall | null> {
    if (!mongoose.isValidObjectId(id)) {
      return null;
    }
    return ToolCallModel.findByIdAndUpdate(
      id,
      { $set: { status, ...extra } },
      { new: true },
    ).exec();
  }
}

export const toolCallRepository = new ToolCallRepository();

