import pino, { Logger, LoggerOptions } from 'pino';

export interface CreateLoggerOptions extends LoggerOptions {
  serviceName: string;
}

export const REDACTED_PATHS = [
  'apiKey',
  '*.apiKey',
  'token',
  '*.token',
  'password',
  '*.password',
  'secret',
  '*.secret',
  'authorization',
  'Authorization',
  '*.authorization',
  'x-api-key',
  '*.x-api-key',
  'headers.authorization',
  'headers.Authorization',
  'headers["x-api-key"]',
];

export function createLogger(options: CreateLoggerOptions): Logger {
  const isDevelopment = process.env.NODE_ENV !== 'production';

  return pino({
    name: options.serviceName,
    level: options.level || process.env.LOG_LEVEL || 'info',
    redact: {
      paths: REDACTED_PATHS,
      censor: '[REDACTED_SECRET]',
    },
    transport: isDevelopment
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
    ...options,
  });
}

export type { Logger } from 'pino';
