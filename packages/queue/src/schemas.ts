import { z } from 'zod';
import { LLMProviderType } from '@buildpilot/domain';

export const EngineeringTaskJobSchema = z.object({
  taskId: z.string().min(1, 'taskId is required'),
  runId: z.string().min(1, 'runId is required'),
  projectId: z.string().min(1, 'projectId is required'),
  repositoryId: z.string().min(1, 'repositoryId is required'),
  issueNumber: z.number().int().positive(),
  title: z.string().min(1, 'title is required'),
  description: z.string().default(''),
  branch: z.string().min(1, 'branch is required'),
  baseBranch: z.string().default('main'),
  provider: z.nativeEnum(LLMProviderType).optional(),
  model: z.string().optional(),
  maxSteps: z.number().int().positive().default(30),
  metadata: z.record(z.unknown()).default({}),
  correlationId: z.string().optional(),
  createdAt: z.string().datetime().optional(),
});

export type EngineeringTaskJobInput = z.input<typeof EngineeringTaskJobSchema>;
export type EngineeringTaskJobPayload = z.infer<typeof EngineeringTaskJobSchema>;

/**
 * Creates correlated job ID format `taskId__runId` for exact-once attempt deduplication
 * Note: BullMQ disallows colons (:) in custom job IDs as colon is used as Redis key delimiter
 */
export function formatJobId(taskId: string, runId: string): string {
  return `${taskId}__${runId}`;
}

/**
 * Parses job ID into its constituent taskId and runId
 */
export function parseJobId(jobId: string): { taskId: string; runId: string } | null {
  const parts = jobId.split('__');
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { taskId: parts[0], runId: parts[1] };
  }
  return null;
}
