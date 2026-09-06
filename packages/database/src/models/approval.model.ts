import mongoose, { Schema, Model } from 'mongoose';
import {
  ApprovalStatus,
  ApprovalStatusType,
  ToolPermissionClass,
  ToolPermissionClassType,
} from '@buildpilot/domain';

export interface IApproval {
  taskId: string;
  runId: string;
  action: string;
  permissionClass: ToolPermissionClassType;
  status: ApprovalStatusType;
  details: Record<string, unknown>;
  requestedBy: string;
  reviewedBy?: string;
  reviewedAt?: Date;
  rejectionReason?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export const ApprovalSchema = new Schema<IApproval>(
  {
    taskId: { type: String, required: true, index: true },
    runId: { type: String, required: true, index: true },
    action: { type: String, required: true },
    permissionClass: {
      type: String,
      enum: Object.values(ToolPermissionClass),
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(ApprovalStatus),
      default: ApprovalStatus.PENDING,
      index: true,
    },
    details: { type: Schema.Types.Mixed, default: {} },
    requestedBy: { type: String, required: true },
    reviewedBy: { type: String },
    reviewedAt: { type: Date },
    rejectionReason: { type: String },
  },
  { timestamps: true },
);

ApprovalSchema.index({ taskId: 1, status: 1 });

export const ApprovalModel: Model<IApproval> =
  mongoose.models.Approval || mongoose.model<IApproval>('Approval', ApprovalSchema);
