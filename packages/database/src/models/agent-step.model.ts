import mongoose, { Schema, Model } from 'mongoose';
import { AgentStepStage, AgentStepStageType } from '@buildpilot/domain';

export interface IAgentStep {
  runId: string;
  taskId: string;
  stage: AgentStepStageType;
  title: string;
  thought?: string;
  durationMs?: number;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

export const AgentStepSchema = new Schema<IAgentStep>(
  {
    runId: { type: String, required: true, index: true },
    taskId: { type: String, required: true, index: true },
    stage: {
      type: String,
      enum: Object.values(AgentStepStage),
      required: true,
      index: true,
    },
    title: { type: String, required: true },
    thought: { type: String },
    durationMs: { type: Number },
    tokenUsage: {
      promptTokens: { type: Number, default: 0 },
      completionTokens: { type: Number, default: 0 },
      totalTokens: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

AgentStepSchema.index({ runId: 1, createdAt: 1 });

export const AgentStepModel: Model<IAgentStep> =
  mongoose.models.AgentStep || mongoose.model<IAgentStep>('AgentStep', AgentStepSchema);
