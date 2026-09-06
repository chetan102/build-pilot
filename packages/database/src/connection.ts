import mongoose, { Connection } from 'mongoose';
import { createLogger, Logger } from '@buildpilot/observability';
import { DatabaseConfig, validateDatabaseConfig } from './config.js';
import { DatabaseConnectionError } from './errors.js';

export const DB_READY_STATE = {
  DISCONNECTED: 0,
  CONNECTED: 1,
  CONNECTING: 2,
  DISCONNECTING: 3,
} as const;

export type DbReadyStateType = (typeof DB_READY_STATE)[keyof typeof DB_READY_STATE];

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  readyState: DbReadyStateType;
  databaseName?: string;
  latencyMs?: number;
  error?: string;
}

export class DatabaseConnectionManager {
  private static instance: DatabaseConnectionManager | null = null;
  private connection: Connection | null = null;
  private config: DatabaseConfig | null = null;
  private logger: Logger;

  private constructor() {
    this.logger = createLogger({ serviceName: 'database-manager' });
  }

  public static getInstance(): DatabaseConnectionManager {
    if (!DatabaseConnectionManager.instance) {
      DatabaseConnectionManager.instance = new DatabaseConnectionManager();
    }
    return DatabaseConnectionManager.instance;
  }

  /**
   * Connect to MongoDB using validated configuration.
   */
  public async connect(rawConfig: unknown): Promise<Connection> {
    const config = validateDatabaseConfig(rawConfig);
    this.config = config;

    if (this.connection && this.connection.readyState === DB_READY_STATE.CONNECTED) {
      this.logger.debug('Reusing existing active MongoDB connection');
      return this.connection;
    }

    try {
      this.logger.info({ uri: this.maskUri(config.uri) }, 'Connecting to MongoDB...');

      const mongooseInstance = await mongoose.connect(config.uri, {
        maxPoolSize: config.maxPoolSize,
        minPoolSize: config.minPoolSize,
        serverSelectionTimeoutMS: config.serverSelectionTimeoutMS,
        connectTimeoutMS: config.connectTimeoutMS,
        socketTimeoutMS: config.socketTimeoutMS,
        autoIndex: config.autoIndex,
      });

      this.connection = mongooseInstance.connection;

      this.connection.on('error', (err) => {
        this.logger.error({ err }, 'MongoDB connection error event');
      });

      this.connection.on('disconnected', () => {
        this.logger.warn('MongoDB disconnected');
      });

      this.connection.on('reconnected', () => {
        this.logger.info('MongoDB reconnected');
      });

      this.logger.info('Successfully connected to MongoDB');
      return this.connection;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ err: error }, 'Failed to connect to MongoDB');
      throw new DatabaseConnectionError(
        `Failed to connect to MongoDB: ${message}`,
        this.maskUri(config.uri),
      );
    }
  }

  /**
   * Disconnect gracefully from MongoDB.
   */
  public async disconnect(force: boolean = false): Promise<void> {
    if (this.connection && this.connection.readyState !== DB_READY_STATE.DISCONNECTED) {
      this.logger.info('Closing MongoDB connection...');
      await mongoose.disconnect();
      this.connection = null;
      this.logger.info('MongoDB connection closed');
    } else if (force) {
      await mongoose.disconnect();
      this.connection = null;
    }
  }

  /**
   * Return the active mongoose connection or throw if not connected.
   */
  public getConnection(): Connection {
    if (!this.connection || this.connection.readyState !== DB_READY_STATE.CONNECTED) {
      throw new DatabaseConnectionError(
        'Database connection is not established. Call connect() first.',
      );
    }
    return this.connection;
  }

  /**
   * Check connection health with ping latency.
   */
  public async healthCheck(): Promise<HealthCheckResult> {
    const readyState = (this.connection?.readyState ?? DB_READY_STATE.DISCONNECTED) as DbReadyStateType;

    if (readyState !== DB_READY_STATE.CONNECTED || !this.connection?.db) {
      return {
        status: 'unhealthy',
        readyState,
        error: 'Database is not connected',
      };
    }

    try {
      const start = Date.now();
      await this.connection.db.admin().ping();
      const latencyMs = Date.now() - start;

      return {
        status: 'healthy',
        readyState,
        databaseName: this.connection.name,
        latencyMs,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: 'unhealthy',
        readyState,
        error: message,
      };
    }
  }

  private maskUri(uri: string): string {
    return uri.replace(/\/\/(.*):(.*)@/, '//$1:****@');
  }
}

export const dbManager = DatabaseConnectionManager.getInstance();

export async function connectToDatabase(config: unknown): Promise<Connection> {
  return dbManager.connect(config);
}

export async function disconnectDatabase(): Promise<void> {
  return dbManager.disconnect();
}

export function isDbConnected(readyState: number): boolean {
  return readyState === DB_READY_STATE.CONNECTED;
}
