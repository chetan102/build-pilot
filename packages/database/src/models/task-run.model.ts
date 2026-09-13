import mongoose, { Schema, Model } from 'mongoose';
import {
  TaskRunStatus,
  TaskRunStatusType,
  LLMProviderType,
  LLMProviderKind,
} from '@buildpilot/domain';

export interface ITaskRunCheckpoint {
  stage: string;
  stepIndex: number;
  filesModified?: string[];
  lastSavedAt: Date;
  summary?: string;
}

export interface ITaskRunHeartbeat {
  workerId: string;
  lastHeartbeatAt: Date;
  leaseExpiresAt: Date;
}

export interface ITaskRun {
  _id?: string;
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
  diff?: string;
  output?: {
    finalAnswer?: string;
    totalSteps?: number;
    totalTokens?: any;
  };
  checkpoint?: ITaskRunCheckpoint;
  heartbeat?: ITaskRunHeartbeat;
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
    diff: { type: String },
    output: {
      finalAnswer: { type: String },
      totalSteps: { type: Number },
      totalTokens: { type: Schema.Types.Mixed },
    },
    checkpoint: {
      stage: { type: String },
      stepIndex: { type: Number },
      filesModified: { type: [String], default: [] },
      lastSavedAt: { type: Date },
      summary: { type: String },
    },
    heartbeat: {
      workerId: { type: String },
      lastHeartbeatAt: { type: Date },
      leaseExpiresAt: { type: Date, index: true },
    },
  },
  { timestamps: true },
);

TaskRunSchema.index({ taskId: 1, createdAt: -1 });

export const TaskRunModel: Model<ITaskRun> =
  mongoose.models.TaskRun || mongoose.model<ITaskRun>('TaskRun', TaskRunSchema);
