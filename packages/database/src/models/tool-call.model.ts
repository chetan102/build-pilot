import mongoose, { Schema, Model } from 'mongoose';
import {
  ToolPermissionClass,
  ToolPermissionClassType,
  ToolCallStatus,
  ToolCallStatusType,
} from '@buildpilot/domain';

export interface IToolCall {
  runId: string;
  stepId: string;
  name: string;
  permissionClass: ToolPermissionClassType;
  status: ToolCallStatusType;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  durationMs?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export const ToolCallSchema = new Schema<IToolCall>(
  {
    runId: { type: String, required: true, index: true },
    stepId: { type: String, required: true, index: true },
    name: { type: String, required: true, index: true },
    permissionClass: {
      type: String,
      enum: Object.values(ToolPermissionClass),
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(ToolCallStatus),
      default: ToolCallStatus.PENDING,
      index: true,
    },
    input: { type: Schema.Types.Mixed, default: {} },
    output: { type: Schema.Types.Mixed },
    error: { type: String },
    durationMs: { type: Number },
  },
  { timestamps: true },
);

ToolCallSchema.index({ runId: 1, createdAt: 1 });

export const ToolCallModel: Model<IToolCall> =
  mongoose.models.ToolCall || mongoose.model<IToolCall>('ToolCall', ToolCallSchema);
