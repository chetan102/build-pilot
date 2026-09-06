import { Redis, RedisOptions } from 'ioredis';
import { createLogger, Logger } from '@buildpilot/observability';

export interface RedisConnectionConfig {
  host: string;
  port: number;
  password?: string;
  maxRetriesPerRequest?: number | null;
  enableReadyCheck?: boolean;
  lazyConnect?: boolean;
}

export interface RedisHealthStatus {
  status: 'healthy' | 'unhealthy';
  latencyMs?: number;
  statusString?: string;
  error?: string;
}

export class RedisConnectionManager {
  private static instance: RedisConnectionManager;
  private client: Redis | null = null;
  private logger: Logger;

  private constructor() {
    this.logger = createLogger({ serviceName: 'redis-manager' });
  }

  public static getInstance(): RedisConnectionManager {
    if (!RedisConnectionManager.instance) {
      RedisConnectionManager.instance = new RedisConnectionManager();
    }
    return RedisConnectionManager.instance;
  }

  public createClient(config: RedisConnectionConfig): Redis {
    const isTest = process.env.NODE_ENV === 'test';

    const options: RedisOptions = {
      host: config.host,
      port: config.port,
      password: config.password || undefined,
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: false,
      lazyConnect: config.lazyConnect ?? isTest,
      connectTimeout: isTest ? 1000 : 5000,
      commandTimeout: isTest ? 1000 : undefined,
      enableOfflineQueue: !isTest,
      retryStrategy: (times: number) => {
        if (isTest && times > 1) {
          return null; // Don't retry endlessly in test runs
        }
        const delay = Math.min(times * 200, 3000);
        this.logger.warn({ attempt: times, delayMs: delay }, 'Retrying Redis connection...');
        return delay;
      },
      reconnectOnError: (err: Error) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          return true;
        }
        return false;
      },
    };

    const redis = new Redis(options);

    redis.on('connect', () => {
      this.logger.info({ host: config.host, port: config.port }, 'Connected to Redis');
    });

    redis.on('ready', () => {
      this.logger.info('Redis connection ready for operations');
    });

    redis.on('error', (err: Error) => {
      this.logger.error({ err: err.message }, 'Redis connection error occurred');
    });

    return redis;
  }

  public getOrCreateSharedClient(config: RedisConnectionConfig): Redis {
    if (!this.client || this.client.status === 'end') {
      this.client = this.createClient(config);
    }
    return this.client;
  }

  public async healthCheck(client?: Redis): Promise<RedisHealthStatus> {
    const target = client || this.client;
    if (!target) {
      return { status: 'unhealthy', error: 'Redis client not initialized' };
    }

    // Fast-fail if not connected or connecting
    if (target.status !== 'ready' && target.status !== 'connect') {
      return {
        status: 'unhealthy',
        statusString: target.status,
        error: `Redis is not connected (status: ${target.status})`,
      };
    }

    const start = Date.now();
    try {
      const pingPromise = target.ping();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Redis health check timed out')), 1500),
      );

      const pong = await Promise.race([pingPromise, timeoutPromise]);
      const latencyMs = Date.now() - start;

      if (pong === 'PONG') {
        return {
          status: 'healthy',
          latencyMs,
          statusString: target.status,
        };
      }

      return {
        status: 'unhealthy',
        latencyMs,
        statusString: target.status,
        error: `Unexpected ping response: ${pong}`,
      };
    } catch (err) {
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  public async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
        this.client = null;
        this.logger.info('Redis disconnected cleanly');
      } catch (err) {
        this.logger.error({ err }, 'Error during Redis disconnect');
      }
    }
  }
}

export const redisConnectionManager = RedisConnectionManager.getInstance();

