import pino, { Logger, LoggerOptions } from 'pino';

export interface CreateLoggerOptions extends LoggerOptions {
  serviceName: string;
}

export function createLogger(options: CreateLoggerOptions): Logger {
  const isDevelopment = process.env.NODE_ENV !== 'production';

  return pino({
    name: options.serviceName,
    level: options.level || process.env.LOG_LEVEL || 'info',
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
