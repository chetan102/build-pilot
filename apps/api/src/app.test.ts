import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'events';
import express, { Express, Request, Response, NextFunction } from 'express';
import { createApp } from './app.js';
import {
  EntityNotFoundError,
  InvalidStateTransitionError,
  PermissionDeniedError,
} from '@buildpilot/domain';
import { DatabaseConnectionError } from '@buildpilot/database';
import { z } from 'zod';

interface MockResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function invokeApp(
  app: Express,
  options: {
    method?: string;
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
  },
): Promise<MockResponse> {
  return new Promise((resolve) => {
    const reqHeaders = { ...(options.headers || {}) };
    const method = options.method || 'GET';

    const req = Object.assign(new EventEmitter(), {
      method,
      url: options.url,
      originalUrl: options.url,
      headers: reqHeaders,
      body: options.body || {},
    });

    let statusCode = 200;
    const resHeaders: Record<string, string> = {};
    let responseBody: Record<string, unknown> = {};

    const res = Object.assign(new EventEmitter(), {
      statusCode: 200,
      setHeader(name: string, value: string) {
        resHeaders[name.toLowerCase()] = String(value);
        return this;
      },
      header(name: string, value: string) {
        resHeaders[name.toLowerCase()] = String(value);
        return this;
      },
      getHeader(name: string) {
        return resHeaders[name.toLowerCase()];
      },
      status(code: number) {
        statusCode = code;
        this.statusCode = code;
        return this;
      },
      json(data: Record<string, unknown>) {
        responseBody = data;
        resolve({ statusCode, headers: resHeaders, body: responseBody });
        return this;
      },
      send(data: Record<string, unknown>) {
        responseBody = data;
        resolve({ statusCode, headers: resHeaders, body: responseBody });
        return this;
      },
      end() {
        resolve({ statusCode, headers: resHeaders, body: responseBody });
        return this;
      },
    });

    app(req as unknown as Parameters<typeof app>[0], res as unknown as Parameters<typeof app>[1]);
  });
}

describe('Control API Application', () => {
  const app = createApp();

  it('GET /health returns 200 OK with health status and correlation ID', async () => {
    const res = await invokeApp(app, { url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('control-api');
    expect(res.body.timestamp).toBeDefined();
    expect(res.headers['x-correlation-id']).toBeDefined();
  });

  it('GET /ready returns database readiness check', async () => {
    const res = await invokeApp(app, { url: '/ready' });

    expect([200, 503]).toContain(res.statusCode);
    expect(res.body.status).toBeDefined();
    expect(res.body.database).toBeDefined();
  });

  it('preserves client-provided x-correlation-id header', async () => {
    const customId = 'client-custom-trace-id-12345';
    const res = await invokeApp(app, {
      url: '/health',
      headers: { 'x-correlation-id': customId },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['x-correlation-id']).toBe(customId);
  });

  it('handles 404 for unknown endpoints with structured JSON', async () => {
    const res = await invokeApp(app, { url: '/api/v1/unknown-endpoint' });

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
    expect(res.body.message).toContain('Route not found');
    expect(res.body.correlationId).toBeDefined();
  });
});

describe('Error Handling Middleware', () => {
  it('converts ZodError to 400 Bad Request', async () => {
    const app = createApp({
      routes: [
        {
          path: '/test-zod-error',
          handler: ((_req: Request, _res: Response, next: NextFunction) => {
            try {
              const schema = z.object({ name: z.string() });
              schema.parse({});
            } catch (err) {
              next(err);
            }
          }) as express.RequestHandler,
        },
      ],
    });

    const res = await invokeApp(app, { url: '/test-zod-error' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.details).toBeDefined();
  });

  it('converts EntityNotFoundError to 404 Not Found', async () => {
    const app = createApp({
      routes: [
        {
          path: '/test-not-found',
          handler: ((_req: Request, _res: Response, next: NextFunction) => {
            next(new EntityNotFoundError('Task', 'task_123'));
          }) as express.RequestHandler,
        },
      ],
    });

    const res = await invokeApp(app, { url: '/test-not-found' });
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('ENTITY_NOT_FOUND');
    expect(res.body.entityType).toBe('Task');
  });

  it('converts InvalidStateTransitionError to 409 Conflict', async () => {
    const app = createApp({
      routes: [
        {
          path: '/test-transition-error',
          handler: ((_req: Request, _res: Response, next: NextFunction) => {
            next(new InvalidStateTransitionError('QUEUED', 'COMPLETED'));
          }) as express.RequestHandler,
        },
      ],
    });

    const res = await invokeApp(app, { url: '/test-transition-error' });
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe('INVALID_STATE_TRANSITION');
    expect(res.body.fromStatus).toBe('QUEUED');
    expect(res.body.toStatus).toBe('COMPLETED');
  });

  it('converts PermissionDeniedError to 403 Forbidden', async () => {
    const app = createApp({
      routes: [
        {
          path: '/test-permission-error',
          handler: ((_req: Request, _res: Response, next: NextFunction) => {
            next(new PermissionDeniedError('delete_branch', 'HIGH_RISK'));
          }) as express.RequestHandler,
        },
      ],
    });

    const res = await invokeApp(app, { url: '/test-permission-error' });
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('PERMISSION_DENIED');
  });

  it('converts DatabaseConnectionError to 503 Service Unavailable', async () => {
    const app = createApp({
      routes: [
        {
          path: '/test-db-error',
          handler: ((_req: Request, _res: Response, next: NextFunction) => {
            next(new DatabaseConnectionError('Failed to connect to MongoDB'));
          }) as express.RequestHandler,
        },
      ],
    });

    const res = await invokeApp(app, { url: '/test-db-error' });
    expect(res.statusCode).toBe(503);
    expect(res.body.error).toBe('DATABASE_CONNECTION_ERROR');
  });
});
