import mongoose, { Schema, Model } from 'mongoose';

export interface IRepository {
  projectId: string;
  githubInstallationId: number;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  isPrivate: boolean;
  webhookSecret?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export const RepositorySchema = new Schema<IRepository>(
  {
    projectId: { type: String, required: true, index: true },
    githubInstallationId: { type: Number, required: true, index: true },
    owner: { type: String, required: true },
    name: { type: String, required: true },
    fullName: { type: String, required: true, unique: true, index: true },
    defaultBranch: { type: String, default: 'main' },
    isPrivate: { type: Boolean, default: false },
    webhookSecret: { type: String },
  },
  { timestamps: true },
);

export const RepositoryModel: Model<IRepository> =
  mongoose.models.Repository || mongoose.model<IRepository>('Repository', RepositorySchema);
