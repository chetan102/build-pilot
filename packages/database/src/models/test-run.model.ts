import mongoose, { Schema, Model } from 'mongoose';
import { TestRunStatus, TestRunStatusType } from '@buildpilot/domain';

export interface ITestRun {
  taskId: string;
  runId: string;
  command: string;
  status: TestRunStatusType;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  rawOutput?: string;
  durationMs?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export const TestRunSchema = new Schema<ITestRun>(
  {
    taskId: { type: String, required: true, index: true },
    runId: { type: String, required: true, index: true },
    command: { type: String, required: true },
    status: {
      type: String,
      enum: Object.values(TestRunStatus),
      default: TestRunStatus.PENDING,
      index: true,
    },
    totalTests: { type: Number, default: 0 },
    passed: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    rawOutput: { type: String },
    durationMs: { type: Number },
  },
  { timestamps: true },
);

TestRunSchema.index({ taskId: 1, createdAt: -1 });

export const TestRunModel: Model<ITestRun> =
  mongoose.models.TestRun || mongoose.model<ITestRun>('TestRun', TestRunSchema);
