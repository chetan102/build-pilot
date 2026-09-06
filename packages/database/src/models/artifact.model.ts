import mongoose, { Schema, Model } from 'mongoose';
import { ArtifactType, ArtifactTypeType } from '@buildpilot/domain';

export interface IArtifact {
  taskId: string;
  runId: string;
  type: ArtifactTypeType;
  path: string;
  content?: string;
  sizeBytes?: number;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export const ArtifactSchema = new Schema<IArtifact>(
  {
    taskId: { type: String, required: true, index: true },
    runId: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: Object.values(ArtifactType),
      required: true,
      index: true,
    },
    path: { type: String, required: true },
    content: { type: String },
    sizeBytes: { type: Number },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

ArtifactSchema.index({ taskId: 1, type: 1 });

export const ArtifactModel: Model<IArtifact> =
  mongoose.models.Artifact || mongoose.model<IArtifact>('Artifact', ArtifactSchema);
