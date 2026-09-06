import mongoose, { Schema, Model } from 'mongoose';
import {
  TaskRunStatus,
  TaskRunStatusType,
  LLMProviderType,
  LLMProviderKind,
} from '@buildpilot/domain';

export interface ITaskRun {
  taskId: string;
  status: TaskRunStatusType;
  branch: string;
  provider: LLMProviderKind;
  model: string;
  maxSteps: number;
  currentStepIndex: number;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  errorMessage?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export const TaskRunSchema = new Schema<ITaskRun>(
  {
    taskId: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: Object.values(TaskRunStatus),
      default: TaskRunStatus.PENDING,
      index: true,
    },
    branch: { type: String, required: true },
    provider: { type: String, enum: Object.values(LLMProviderType), required: true },
    model: { type: String, required: true },
    maxSteps: { type: Number, default: 30 },
    currentStepIndex: { type: Number, default: 0 },
    startedAt: { type: Date },
    completedAt: { type: Date },
    durationMs: { type: Number },
    errorMessage: { type: String },
  },
  { timestamps: true },
);

TaskRunSchema.index({ taskId: 1, createdAt: -1 });

export const TaskRunModel: Model<ITaskRun> =
  mongoose.models.TaskRun || mongoose.model<ITaskRun>('TaskRun', TaskRunSchema);
