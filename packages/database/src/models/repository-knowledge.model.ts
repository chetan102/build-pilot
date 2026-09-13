import mongoose, { Schema, Model } from 'mongoose';

export interface IRepositoryKnowledge {
  _id?: string;
  repositoryId: string;
  commitSha: string;
  fileTree: string;
  techStack: {
    languages: string[];
    frameworks: string[];
    packageManager: string;
    testFramework: string;
    testCommand: string;
    buildTool: string;
  };
  entrypoints: string[];
  conventions: string;
  architectureSummary: string;
  pastLearnings: string[];
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export const RepositoryKnowledgeSchema = new Schema<IRepositoryKnowledge>(
  {
    repositoryId: { type: String, required: true, unique: true, index: true },
    commitSha: { type: String, required: true },
    fileTree: { type: String, default: '' },
    techStack: {
      languages: { type: [String], default: [] },
      frameworks: { type: [String], default: [] },
      packageManager: { type: String, default: 'npm' },
      testFramework: { type: String, default: '' },
      testCommand: { type: String, default: 'npm test' },
      buildTool: { type: String, default: '' },
    },
    entrypoints: { type: [String], default: [] },
    conventions: { type: String, default: '' },
    architectureSummary: { type: String, default: '' },
    pastLearnings: { type: [String], default: [] },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true },
);

export const RepositoryKnowledgeModel: Model<IRepositoryKnowledge> =
  mongoose.models.RepositoryKnowledge || mongoose.model<IRepositoryKnowledge>('RepositoryKnowledge', RepositoryKnowledgeSchema);
