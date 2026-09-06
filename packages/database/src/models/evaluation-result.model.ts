import mongoose, { Schema, Model } from 'mongoose';

export interface IEvaluationResult {
  taskId: string;
  runId: string;
  benchmarkName: string;
  score: number;
  passed: boolean;
  metrics: Record<string, unknown>;
  details?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export const EvaluationResultSchema = new Schema<IEvaluationResult>(
  {
    taskId: { type: String, required: true, index: true },
    runId: { type: String, required: true, index: true },
    benchmarkName: { type: String, required: true, index: true },
    score: { type: Number, min: 0, max: 100, required: true },
    passed: { type: Boolean, required: true, index: true },
    metrics: { type: Schema.Types.Mixed, default: {} },
    details: { type: String },
  },
  { timestamps: true },
);

EvaluationResultSchema.index({ benchmarkName: 1, passed: 1 });

export const EvaluationResultModel: Model<IEvaluationResult> =
  mongoose.models.EvaluationResult ||
  mongoose.model<IEvaluationResult>('EvaluationResult', EvaluationResultSchema);
