import mongoose, { Schema, Model } from 'mongoose';
import { PullRequestStatus, PullRequestStatusType } from '@buildpilot/domain';

export interface IPullRequest {
  taskId: string;
  projectId: string;
  repositoryId: string;
  githubPrNumber: number;
  githubPrUrl: string;
  branch: string;
  baseBranch: string;
  title: string;
  body: string;
  status: PullRequestStatusType;
  createdAt?: Date;
  updatedAt?: Date;
}

export const PullRequestSchema = new Schema<IPullRequest>(
  {
    taskId: { type: String, required: true, unique: true, index: true },
    projectId: { type: String, required: true, index: true },
    repositoryId: { type: String, required: true, index: true },
    githubPrNumber: { type: Number, required: true },
    githubPrUrl: { type: String, required: true },
    branch: { type: String, required: true },
    baseBranch: { type: String, default: 'main' },
    title: { type: String, required: true },
    body: { type: String, required: true },
    status: {
      type: String,
      enum: Object.values(PullRequestStatus),
      default: PullRequestStatus.OPEN,
      index: true,
    },
  },
  { timestamps: true },
);

PullRequestSchema.index({ repositoryId: 1, githubPrNumber: 1 }, { unique: true });

export const PullRequestModel: Model<IPullRequest> =
  mongoose.models.PullRequest ||
  mongoose.model<IPullRequest>('PullRequest', PullRequestSchema);
