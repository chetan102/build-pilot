import { z } from 'zod';

export const TaskStatus = {
  QUEUED: 'QUEUED',
  PLANNING: 'PLANNING',
  READY_FOR_DEVELOPMENT: 'READY_FOR_DEVELOPMENT',
  DEVELOPMENT: 'DEVELOPMENT',
  TESTING: 'TESTING',
  REPAIRING: 'REPAIRING',
  REVIEW: 'REVIEW',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  AWAITING_APPROVAL: 'AWAITING_APPROVAL',
  PR_READY: 'PR_READY',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  BLOCKED: 'BLOCKED',
  TIMED_OUT: 'TIMED_OUT',
} as const;

export type TaskStatusType = (typeof TaskStatus)[keyof typeof TaskStatus];

export const TaskStatusSchema = z.nativeEnum(TaskStatus);

export const ToolPermissionClass = {
  READ_ONLY: 'READ_ONLY',
  SAFE_WRITE: 'SAFE_WRITE',
  EXTERNAL_WRITE: 'EXTERNAL_WRITE',
  HIGH_RISK: 'HIGH_RISK',
} as const;

export type ToolPermissionClassType =
  (typeof ToolPermissionClass)[keyof typeof ToolPermissionClass];
