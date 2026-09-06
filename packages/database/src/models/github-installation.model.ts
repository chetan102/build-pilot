import mongoose, { Schema, Model } from 'mongoose';

export interface IGitHubInstallation {
  installationId: number;
  accountName: string;
  accountId: number;
  accountType: 'User' | 'Organization';
  permissions: Record<string, string>;
  events: string[];
  repositorySelection: 'all' | 'selected';
  createdAt?: Date;
  updatedAt?: Date;
}

export const GitHubInstallationSchema = new Schema<IGitHubInstallation>(
  {
    installationId: { type: Number, required: true, unique: true, index: true },
    accountName: { type: String, required: true },
    accountId: { type: Number, required: true },
    accountType: { type: String, enum: ['User', 'Organization'], required: true },
    permissions: { type: Schema.Types.Mixed, default: {} },
    events: { type: [String], default: [] },
    repositorySelection: { type: String, enum: ['all', 'selected'], default: 'all' },
  },
  { timestamps: true },
);

export const GitHubInstallationModel: Model<IGitHubInstallation> =
  mongoose.models.GitHubInstallation ||
  mongoose.model<IGitHubInstallation>('GitHubInstallation', GitHubInstallationSchema);
