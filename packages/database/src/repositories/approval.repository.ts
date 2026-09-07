import mongoose from 'mongoose';
import { ApprovalModel, IApproval } from '../models/approval.model.js';
import { ApprovalStatusType } from '@buildpilot/domain';

export class ApprovalRepository {
  async create(data: Partial<IApproval>): Promise<IApproval> {
    return ApprovalModel.create(data);
  }

  async findById(id: string): Promise<IApproval | null> {
    if (!mongoose.isValidObjectId(id)) {
      return null;
    }
    return ApprovalModel.findById(id).exec();
  }

  async findByTaskId(taskId: string): Promise<IApproval[]> {
    return ApprovalModel.find({ taskId }).sort({ createdAt: -1 }).exec();
  }

  async findPendingByTaskId(taskId: string): Promise<IApproval | null> {
    return ApprovalModel.findOne({ taskId, status: 'PENDING' }).sort({ createdAt: -1 }).exec();
  }

  async approve(id: string, reviewedBy: string): Promise<IApproval | null> {
    if (!mongoose.isValidObjectId(id)) {
      return null;
    }
    return ApprovalModel.findByIdAndUpdate(
      id,
      {
        $set: {
          status: 'APPROVED',
          reviewedBy,
          reviewedAt: new Date(),
        },
      },
      { new: true },
    ).exec();
  }

  async reject(id: string, reviewedBy: string, rejectionReason?: string): Promise<IApproval | null> {
    if (!mongoose.isValidObjectId(id)) {
      return null;
    }
    return ApprovalModel.findByIdAndUpdate(
      id,
      {
        $set: {
          status: 'REJECTED',
          reviewedBy,
          reviewedAt: new Date(),
          rejectionReason,
        },
      },
      { new: true },
    ).exec();
  }
}

export const approvalRepository = new ApprovalRepository();
