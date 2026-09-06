import { z } from 'zod';
import {
  TaskStatusSchema,
  TaskRunStatusSchema,
  AgentStepStageSchema,
  ToolPermissionClassSchema,
  ToolCallStatusSchema,
  ApprovalStatusSchema,
  ArtifactTypeSchema,
  TestRunStatusSchema,
  PullRequestStatusSchema,
  LLMProviderTypeSchema,
} from './enums.js';

// Base entity schema with timestamps
export const BaseEntitySchema = z.object({
  id: z.string(),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
});

// Tool Call Schema
export const ToolCallSchema = BaseEntitySchema.extend({
  runId: z.string(),
  stepId: z.string(),
  name: z.string(),
  permissionClass: ToolPermissionClassSchema,
  status: ToolCallStatusSchema,
  input: z.record(z.unknown()),
  output: z.record(z.unknown()).optional(),
  error: z.string().optional(),
  durationMs: z.number().optional(),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

// Agent Step Schema
export const AgentStepSchema = BaseEntitySchema.extend({
  runId: z.string(),
  taskId: z.string(),
  stage: AgentStepStageSchema,
  title: z.string(),
  thought: z.string().optional(),
  toolCalls: z.array(ToolCallSchema).default([]),
  durationMs: z.number().optional(),
  tokenUsage: z
    .object({
      promptTokens: z.number(),
      completionTokens: z.number(),
      totalTokens: z.number(),
    })
    .optional(),
});
export type AgentStep = z.infer<typeof AgentStepSchema>;

// Artifact Schema
export const ArtifactSchema = BaseEntitySchema.extend({
  taskId: z.string(),
  runId: z.string(),
  type: ArtifactTypeSchema,
  path: z.string(),
  content: z.string().optional(),
  sizeBytes: z.number().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type Artifact = z.infer<typeof ArtifactSchema>;

// Test Run Schema
export const TestRunSchema = BaseEntitySchema.extend({
  taskId: z.string(),
  runId: z.string(),
  command: z.string(),
  status: TestRunStatusSchema,
  totalTests: z.number().default(0),
  passed: z.number().default(0),
  failed: z.number().default(0),
  skipped: z.number().default(0),
  rawOutput: z.string().optional(),
  durationMs: z.number().optional(),
});
export type TestRun = z.infer<typeof TestRunSchema>;

// Approval Schema (High-Risk Gating)
export const ApprovalSchema = BaseEntitySchema.extend({
  taskId: z.string(),
  runId: z.string(),
  action: z.string(),
  permissionClass: ToolPermissionClassSchema,
  status: ApprovalStatusSchema,
  details: z.record(z.unknown()),
  requestedBy: z.string(),
  reviewedBy: z.string().optional(),
  reviewedAt: z.date().or(z.string()).optional(),
  rejectionReason: z.string().optional(),
});
export type Approval = z.infer<typeof ApprovalSchema>;

// Pull Request Schema
export const PullRequestSchema = BaseEntitySchema.extend({
  taskId: z.string(),
  projectId: z.string(),
  repositoryId: z.string(),
  githubPrNumber: z.number(),
  githubPrUrl: z.string().url(),
  branch: z.string(),
  baseBranch: z.string().default('main'),
  title: z.string(),
  body: z.string(),
  status: PullRequestStatusSchema,
});
export type PullRequest = z.infer<typeof PullRequestSchema>;

// Task Run Schema (Individual Execution Attempt)
export const TaskRunSchema = BaseEntitySchema.extend({
  taskId: z.string(),
  status: TaskRunStatusSchema,
  branch: z.string(),
  provider: LLMProviderTypeSchema,
  model: z.string(),
  maxSteps: z.number().default(30),
  currentStepIndex: z.number().default(0),
  startedAt: z.date().or(z.string()).optional(),
  completedAt: z.date().or(z.string()).optional(),
  durationMs: z.number().optional(),
  errorMessage: z.string().optional(),
});
export type TaskRun = z.infer<typeof TaskRunSchema>;

// Task Schema (Core Durable Entity)
export const TaskSchema = BaseEntitySchema.extend({
  projectId: z.string(),
  repositoryId: z.string(),
  issueNumber: z.number(),
  title: z.string(),
  description: z.string(),
  status: TaskStatusSchema,
  branch: z.string(),
  baseBranch: z.string().default('main'),
  activeRunId: z.string().optional(),
  completedRunId: z.string().optional(),
  prId: z.string().optional(),
  activeApprovalId: z.string().optional(),
  tags: z.array(z.string()).default([]),
});
export type Task = z.infer<typeof TaskSchema>;

// Task Creation Input
export const CreateTaskInputSchema = z.object({
  projectId: z.string(),
  repositoryId: z.string(),
  issueNumber: z.number(),
  title: z.string().min(1),
  description: z.string(),
  baseBranch: z.string().default('main'),
  tags: z.array(z.string()).optional(),
});
export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>;

// Project Schema
export const ProjectSchema = BaseEntitySchema.extend({
  name: z.string(),
  slug: z.string(),
  description: z.string().optional(),
  ownerId: z.string(),
  active: z.boolean().default(true),
});
export type Project = z.infer<typeof ProjectSchema>;

// Repository Schema
export const RepositorySchema = BaseEntitySchema.extend({
  projectId: z.string(),
  githubInstallationId: z.number(),
  owner: z.string(),
  name: z.string(),
  fullName: z.string(),
  defaultBranch: z.string().default('main'),
  isPrivate: z.boolean().default(false),
  webhookSecret: z.string().optional(),
});
export type Repository = z.infer<typeof RepositorySchema>;

// Provider Credential Schema
export const ProviderCredentialSchema = BaseEntitySchema.extend({
  userId: z.string(),
  provider: LLMProviderTypeSchema,
  apiKeyEncrypted: z.string(),
  baseUrl: z.string().url().optional(),
  defaultModel: z.string(),
  availableModels: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});
export type ProviderCredential = z.infer<typeof ProviderCredentialSchema>;

// Evaluation Result Schema
export const EvaluationResultSchema = BaseEntitySchema.extend({
  taskId: z.string(),
  runId: z.string(),
  benchmarkName: z.string(),
  score: z.number().min(0).max(100),
  passed: z.boolean(),
  metrics: z.record(z.unknown()),
  details: z.string().optional(),
});
export type EvaluationResult = z.infer<typeof EvaluationResultSchema>;
