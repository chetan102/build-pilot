import { describe, it, expect } from 'vitest';
import {
  validateDatabaseConfig,
  DatabaseConnectionManager,
  DatabaseConnectionError,
  DatabaseError,
  DB_READY_STATE,
  isDbConnected,
} from './index.js';

describe('Database Configuration Validation', () => {
  it('validates standard MongoDB URI format', () => {
    const valid = validateDatabaseConfig({
      uri: 'mongodb://localhost:27017/buildpilot',
    });
    expect(valid.uri).toBe('mongodb://localhost:27017/buildpilot');
    expect(valid.maxPoolSize).toBe(10);
    expect(valid.minPoolSize).toBe(2);
    expect(valid.serverSelectionTimeoutMS).toBe(5000);
  });

  it('validates MongoDB Atlas SRV URI format', () => {
    const valid = validateDatabaseConfig({
      uri: 'mongodb+srv://user:pass@cluster0.mongodb.net/buildpilot?retryWrites=true',
    });
    expect(valid.uri).toContain('mongodb+srv://');
  });

  it('rejects invalid URI schemes', () => {
    expect(() =>
      validateDatabaseConfig({
        uri: 'http://localhost:27017/buildpilot',
      }),
    ).toThrow();

    expect(() =>
      validateDatabaseConfig({
        uri: 'postgres://localhost:5432/buildpilot',
      }),
    ).toThrow();

    expect(() =>
      validateDatabaseConfig({
        uri: '',
      }),
    ).toThrow();
  });
});

describe('Database Errors', () => {
  it('creates typed database errors with appropriate codes', () => {
    const err = new DatabaseConnectionError(
      'Connection refused',
      'mongodb://localhost:27017/buildpilot',
    );
    expect(err).toBeInstanceOf(DatabaseError);
    expect(err).toBeInstanceOf(DatabaseConnectionError);
    expect(err.code).toBe('DATABASE_CONNECTION_ERROR');
    expect(err.uri).toBe('mongodb://localhost:27017/buildpilot');
    expect(err.message).toContain('Connection refused');
  });
});

describe('Database Connection Manager Lifecycle', () => {
  it('reports unhealthy when not connected', async () => {
    const manager = DatabaseConnectionManager.getInstance();
    await manager.disconnect(true);

    const health = await manager.healthCheck();
    expect(health.status).toBe('unhealthy');
    expect(health.readyState).toBe(DB_READY_STATE.DISCONNECTED);
    expect(isDbConnected(health.readyState)).toBe(false);
  });

  it('throws DatabaseConnectionError when getConnection is called before connect', () => {
    const manager = DatabaseConnectionManager.getInstance();
    expect(() => manager.getConnection()).toThrow(DatabaseConnectionError);
  });

  it('fails with structured DatabaseConnectionError on unreachable host', async () => {
    const manager = DatabaseConnectionManager.getInstance();
    const unreachableConfig = {
      uri: 'mongodb://127.0.0.1:29999/buildpilot',
      serverSelectionTimeoutMS: 500,
      connectTimeoutMS: 500,
    };

    await expect(manager.connect(unreachableConfig)).rejects.toThrow(
      DatabaseConnectionError,
    );
  });
});
