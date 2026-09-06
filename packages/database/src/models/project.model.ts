import mongoose, { Schema, Model } from 'mongoose';

export interface IProject {
  name: string;
  slug: string;
  description?: string;
  ownerId: string;
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export const ProjectSchema = new Schema<IProject>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    description: { type: String },
    ownerId: { type: String, required: true, index: true },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

export const ProjectModel: Model<IProject> =
  mongoose.models.Project || mongoose.model<IProject>('Project', ProjectSchema);
