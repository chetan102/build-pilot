import { z } from 'zod';
import { TaskStatus } from '@buildpilot/domain';

export const CreateTaskSchema = z.object({
  repositoryId: z.string().min(1, 'Repository ID is required'),
  issueNumber: z.coerce.number().int().positive().optional(),
  title: z.string().min(1, 'Task title is required').trim(),
  description: z.string().default(''),
  branch: z.string().optional(),
  baseBranch: z.string().default('main'),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({}),
});

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

export const ListTasksQuerySchema = z.object({
  projectId: z.string().optional(),
  repositoryId: z.string().optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

export type ListTasksQuery = z.infer<typeof ListTasksQuerySchema>;

export const CancelTaskSchema = z.object({
  reason: z.string().optional(),
});

export type CancelTaskInput = z.infer<typeof CancelTaskSchema>;

export const ApprovalDecisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  reviewedBy: z.string().min(1, 'Reviewer identity is required'),
  rejectionReason: z.string().optional(),
});

export type ApprovalDecisionInput = z.infer<typeof ApprovalDecisionSchema>;

