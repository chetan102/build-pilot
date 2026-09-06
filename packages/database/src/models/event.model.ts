import mongoose, { Schema, Model } from 'mongoose';

export interface IEvent {
  taskId?: string;
  runId?: string;
  type: string;
  payload: Record<string, unknown>;
  level: 'info' | 'warn' | 'error' | 'debug';
  timestamp?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export const EventSchema = new Schema<IEvent>(
  {
    taskId: { type: String, index: true },
    runId: { type: String, index: true },
    type: { type: String, required: true, index: true },
    payload: { type: Schema.Types.Mixed, default: {} },
    level: { type: String, enum: ['info', 'warn', 'error', 'debug'], default: 'info' },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

EventSchema.index({ taskId: 1, timestamp: -1 });
EventSchema.index({ runId: 1, timestamp: -1 });

export const EventModel: Model<IEvent> =
  mongoose.models.Event || mongoose.model<IEvent>('Event', EventSchema);
