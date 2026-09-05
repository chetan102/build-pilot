import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().default('mongodb://localhost:27017/buildpilot'),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6380),
  REDIS_PASSWORD: z.string().optional(),
  DEFAULT_LLM_PROVIDER: z.string().default('openrouter'),
  DEFAULT_LLM_MODEL: z.string().default('anthropic/claude-3.5-sonnet'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function loadConfig(env: Record<string, unknown> = process.env): EnvConfig {
  return envSchema.parse(env);
}

