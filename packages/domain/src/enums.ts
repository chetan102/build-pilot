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

export const TaskRunStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  TIMED_OUT: 'TIMED_OUT',
} as const;

export type TaskRunStatusType = (typeof TaskRunStatus)[keyof typeof TaskRunStatus];
export const TaskRunStatusSchema = z.nativeEnum(TaskRunStatus);

export const AgentStepStage = {
  PLANNING: 'PLANNING',
  DEVELOPMENT: 'DEVELOPMENT',
  TESTING: 'TESTING',
  REPAIR: 'REPAIR',
  REVIEW: 'REVIEW',
  APPROVAL: 'APPROVAL',
  DELIVERY: 'DELIVERY',
} as const;

export type AgentStepStageType = (typeof AgentStepStage)[keyof typeof AgentStepStage];
export const AgentStepStageSchema = z.nativeEnum(AgentStepStage);

export const ToolPermissionClass = {
  READ_ONLY: 'READ_ONLY',
  SAFE_WRITE: 'SAFE_WRITE',
  EXTERNAL_WRITE: 'EXTERNAL_WRITE',
  HIGH_RISK: 'HIGH_RISK',
} as const;

export type ToolPermissionClassType =
  (typeof ToolPermissionClass)[keyof typeof ToolPermissionClass];
export const ToolPermissionClassSchema = z.nativeEnum(ToolPermissionClass);

export const ToolCallStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  BLOCKED: 'BLOCKED',
  REJECTED: 'REJECTED',
} as const;

export type ToolCallStatusType = (typeof ToolCallStatus)[keyof typeof ToolCallStatus];
export const ToolCallStatusSchema = z.nativeEnum(ToolCallStatus);

export const ApprovalStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
} as const;

export type ApprovalStatusType = (typeof ApprovalStatus)[keyof typeof ApprovalStatus];
export const ApprovalStatusSchema = z.nativeEnum(ApprovalStatus);

export const ArtifactType = {
  PATCH: 'PATCH',
  DIFF: 'DIFF',
  TEST_REPORT: 'TEST_REPORT',
  BUILD_LOG: 'BUILD_LOG',
  AGENT_TRACE: 'AGENT_TRACE',
  PULL_REQUEST_PLAN: 'PULL_REQUEST_PLAN',
} as const;

export type ArtifactTypeType = (typeof ArtifactType)[keyof typeof ArtifactType];
export const ArtifactTypeSchema = z.nativeEnum(ArtifactType);

export const TestRunStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  PASSED: 'PASSED',
  FAILED: 'FAILED',
  ERROR: 'ERROR',
} as const;

export type TestRunStatusType = (typeof TestRunStatus)[keyof typeof TestRunStatus];
export const TestRunStatusSchema = z.nativeEnum(TestRunStatus);

export const PullRequestStatus = {
  DRAFT: 'DRAFT',
  OPEN: 'OPEN',
  MERGED: 'MERGED',
  CLOSED: 'CLOSED',
} as const;

export type PullRequestStatusType = (typeof PullRequestStatus)[keyof typeof PullRequestStatus];
export const PullRequestStatusSchema = z.nativeEnum(PullRequestStatus);

export const LLMProviderType = {
  OPENROUTER: 'OPENROUTER',
  GEMINI: 'GEMINI',
  OPENAI: 'OPENAI',
  ANTHROPIC: 'ANTHROPIC',
  CUSTOM_OPENAI_COMPATIBLE: 'CUSTOM_OPENAI_COMPATIBLE',
} as const;

export type LLMProviderKind = (typeof LLMProviderType)[keyof typeof LLMProviderType];
export const LLMProviderTypeSchema = z.nativeEnum(LLMProviderType);
