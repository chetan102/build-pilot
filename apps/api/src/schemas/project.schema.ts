import { z } from 'zod';

export const CreateProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').trim(),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-_]+$/, 'Slug must be alphanumeric and may contain hyphens or underscores')
    .optional(),
  description: z.string().optional(),
  ownerId: z.string().default('user_default'),
});

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

export const ListProjectsQuerySchema = z.object({
  active: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListProjectsQuery = z.infer<typeof ListProjectsQuerySchema>;

