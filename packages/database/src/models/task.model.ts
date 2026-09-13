import mongoose, { Schema, Model } from 'mongoose';
import { TaskStatus, TaskStatusType } from '@buildpilot/domain';

export interface ITask {
  _id?: string;
  projectId: string;
  repositoryId: string;
  issueNumber: number;
  title: string;
  description: string;
  status: TaskStatusType;
  branch: string;
  baseBranch: string;
  activeRunId?: string;
  completedRunId?: string;
  prId?: string;
  prUrl?: string;
  prNumber?: number;
  activeApprovalId?: string;
  tags: string[];
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export const TaskSchema = new Schema<ITask>(
  {
    projectId: { type: String, required: true, index: true },
    repositoryId: { type: String, required: true, index: true },
    issueNumber: { type: Number, required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    status: {
      type: String,
      enum: Object.values(TaskStatus),
      default: TaskStatus.QUEUED,
      index: true,
    },
    branch: { type: String, required: true },
    baseBranch: { type: String, default: 'main' },
    activeRunId: { type: String },
    completedRunId: { type: String },
    prId: { type: String },
    prUrl: { type: String },
    prNumber: { type: Number },
    activeApprovalId: { type: String },
    tags: { type: [String], default: [] },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

TaskSchema.index({ repositoryId: 1, issueNumber: 1 }, { unique: true });
TaskSchema.index({ repositoryId: 1, status: 1 });
TaskSchema.index({ projectId: 1, status: 1 });
TaskSchema.index({ status: 1, createdAt: -1 });

export const TaskModel: Model<ITask> =
  mongoose.models.Task || mongoose.model<ITask>('Task', TaskSchema);
