import { z } from 'zod';

export const MongoUriRegex = /^(mongodb|mongodb\+srv):\/\/.+/;

export const DatabaseConfigSchema = z.object({
  uri: z
    .string({ required_error: 'MongoDB connection URI is required' })
    .regex(MongoUriRegex, {
      message: 'Invalid MongoDB connection URI. Must start with "mongodb://" or "mongodb+srv://"',
    }),
  maxPoolSize: z.number().int().positive().default(10),
  minPoolSize: z.number().int().nonnegative().default(2),
  serverSelectionTimeoutMS: z.number().int().positive().default(5000),
  connectTimeoutMS: z.number().int().positive().default(10000),
  socketTimeoutMS: z.number().int().positive().default(45000),
  autoIndex: z.boolean().default(true),
});

export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;

export function validateDatabaseConfig(config: unknown): DatabaseConfig {
  return DatabaseConfigSchema.parse(config);
}
